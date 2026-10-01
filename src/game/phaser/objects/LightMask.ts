import Phaser from "phaser";
import { LIGHT_RADIUS, TERMINAL_INTERACT_RADIUS } from "../constants";
import type { RoomId } from "../events";
import type { RectData, TerminalMarker } from "../scenes/mapObjects";

/** 黑色遮罩的不透明度。不是 1，讓牆的輪廓在極暗處隱約可見，維持恐怖氣氛又不至於完全迷路。 */
const DARKNESS_ALPHA = 0.92;

/**
 * 深度：角色之上、UI 文字之下。TerminalZones 的「按 E」文字深度 60 要比這個高。
 */
const MASK_DEPTH = 50;

/** 終端機周圍的洞半徑，剛好等於互動半徑，讓玩家看得見「能互動的範圍」。 */
const TERMINAL_HOLE_RADIUS = TERMINAL_INTERACT_RADIUS;

/** 亮燈（斷電解除）淡出時間，毫秒。 */
const POWER_FADE_DURATION = 1500;

/** 單一艙區亮起的淡入時間，毫秒。短到像「啪」一聲開燈，又不至於生硬。 */
const ROOM_LIGHT_DURATION = 200;

/** 艙區挖亮用的顏色：erase 只看 alpha，顏色無所謂，用白色方便除錯時目視。 */
const ROOM_ERASE_COLOR = 0xffffff;

/** `powerOnSequence` 的輸入：只需要艙區 id 與矩形，Station 的 `StationRoom` 可以直接傳。 */
export interface PowerOnRoom {
	roomId: RoomId;
	rect: RectData;
}

/** 已經亮起（或正在亮起）的艙區，`level` 0 到 1，是挖洞的 alpha。 */
interface LitRoom {
	roomId: RoomId;
	rect: RectData;
	level: number;
}

/** 程式產生的徑向漸層 texture key，前綴加半徑避免不同大小撞名。 */
function gradientTextureKey(radius: number): string {
	return `light-gradient-${radius}`;
}

/**
 * 斷電燈光遮罩：整張地圖大小的黑色層，在角色與每台終端機周圍挖出柔邊的洞。
 *
 * 實作用 RenderTexture：每幀 `clear()`、`fill(黑, alpha)`、再用 `erase(漸層 texture, x, y)` 挖洞，最後 `render()`。
 * Phaser 4 的 RenderTexture 是指令緩衝，指令只有在 `render()` 時才真的畫進去，
 * 所以這裡每次重畫完都明確呼叫 `render()`，不依賴 renderMode。
 *
 * 整合方式：Station 的 `create()` 在 `createPlayer()` 之後建立，`update()` 每幀傳入玩家座標。
 */
export class LightMask {
	private readonly scene: Phaser.Scene;
	private readonly terminals: readonly TerminalMarker[];
	private readonly mapWidth: number;
	private readonly mapHeight: number;

	private overlay!: Phaser.GameObjects.RenderTexture;
	private fadeTween: Phaser.Tweens.Tween | null = null;

	/** 不加進顯示清單的 Graphics，每次重畫時畫上已亮艙區的矩形，再拿去 erase。 */
	private roomGraphics!: Phaser.GameObjects.Graphics;
	/** 已亮的艙區，`update()` 重畫時持續挖掉。整層隱藏後就不再用到。 */
	private litRooms: LitRoom[] = [];
	/** 亮燈序列排程中的計時器與每間艙區的淡入 tween，destroy 或立即通電時要收掉。 */
	private sequenceTimers: Phaser.Time.TimerEvent[] = [];
	private roomTweens: Phaser.Tweens.Tween[] = [];
	/** 進行中的亮燈序列，重複呼叫 `powerOnSequence` 時回傳同一個。 */
	private sequencePromise: Promise<void> | null = null;
	/** 等「整層淡出完成」的 resolve 們；destroy 或反向斷電時也會放行，避免呼叫端卡住。 */
	private fullyLitWaiters: Array<() => void> = [];

	private playerKey = "";
	private terminalKey = "";

	/** 上一次畫上去的玩家座標（取整），沒變且不髒就不重畫。 */
	private lastPlayerX: number | null = null;
	private lastPlayerY: number | null = null;
	private needsRedraw = true;

	/** 是否已通電。通電且淡出完成後才會停止重畫並隱藏遮罩。 */
	private isPowered = false;
	private isFullyLit = false;
	private isDestroyed = false;

	constructor(scene: Phaser.Scene, mapWidth: number, mapHeight: number, terminals: TerminalMarker[]) {
		this.scene = scene;
		this.mapWidth = mapWidth;
		this.mapHeight = mapHeight;
		this.terminals = terminals;

		// 所有需要 scene 的呼叫都集中在這兩個方法，除錯時從這裡下手
		this.createGradientTextures();
		this.createOverlay();
		this.roomGraphics = this.scene.make.graphics({}, false);

		// 先畫一次（只有終端機的洞），玩家座標由第一次 update 補上
		this.redraw();
	}

	/** 每幀呼叫，把光圈移到玩家位置。通電淡出完成後不做任何事。 */
	update(playerX: number, playerY: number): void {
		if (this.isDestroyed || this.isFullyLit) {
			return;
		}

		// 取整避免子像素位置讓漸層邊緣閃爍
		const nextX = Math.round(playerX);
		const nextY = Math.round(playerY);
		const hasMoved = nextX !== this.lastPlayerX || nextY !== this.lastPlayerY;
		if (!hasMoved && !this.needsRedraw) {
			return;
		}

		this.lastPlayerX = nextX;
		this.lastPlayerY = nextY;
		this.redraw();
	}

	/**
	 * 配電箱過關演出（M4-3）：依 `order` 一間一間把艙區從遮罩挖亮，每間間隔 `stepMs`，
	 * 全部亮完後呼叫 `setPowered(true)` 把剩下的黑淡掉。
	 *
	 * - 每間艙區用 `ROOM_LIGHT_DURATION` 從 0 淡入到全亮；`onRoomLit` 在該艙區淡入完成時呼叫（人影閃現用）。
	 * - `order` 裡找不到矩形的艙區直接跳過，不佔時間格。
	 * - 回傳的 Promise 在整層淡出完成時 resolve；場景銷毀或中途被立即通電時也會 resolve，不會卡住。
	 * - 已通電（或已在跑序列）時不重播：前者立即 resolve，後者回傳同一個 Promise。
	 * - 計時器與 tween 都掛在場景上，場景暫停（終端機開著）時會一起停住。
	 */
	powerOnSequence(
		rooms: readonly PowerOnRoom[],
		order: readonly RoomId[],
		stepMs = 450,
		onRoomLit?: (roomId: RoomId) => void,
	): Promise<void> {
		if (this.isDestroyed || this.isPowered) {
			return Promise.resolve();
		}
		if (this.sequencePromise !== null) {
			return this.sequencePromise;
		}

		const steps: PowerOnRoom[] = [];
		for (const roomId of order) {
			const room = rooms.find((item) => item.roomId === roomId);
			if (room !== undefined) {
				steps.push(room);
			}
		}

		const promise = new Promise<void>((resolve) => {
			this.fullyLitWaiters.push(resolve);
		});
		this.sequencePromise = promise;

		steps.forEach((room, index) => {
			const timer = this.scene.time.delayedCall(index * stepMs, () => {
				this.lightRoom(room, onRoomLit);
			});
			this.sequenceTimers.push(timer);
		});

		// 最後一間淡入完成後才開始整層淡出；沒有任何艙區時直接淡出
		let finalDelay = 0;
		if (steps.length > 0) {
			finalDelay = (steps.length - 1) * stepMs + ROOM_LIGHT_DURATION;
		}
		const finalTimer = this.scene.time.delayedCall(finalDelay, () => {
			this.sequenceTimers = [];
			this.setPowered(true);
		});
		this.sequenceTimers.push(finalTimer);

		return promise;
	}

	/**
	 * 配電箱過關後呼叫（M4 用）。
	 * `true`：1.5 秒內把遮罩淡出到全亮，淡出期間光圈仍會跟著玩家，完成後停止重畫並隱藏。
	 * `false`：反向，遮罩立即顯示並淡入回斷電狀態。
	 * `immediate`：只對 `true` 有效，不播淡出直接全亮（重整後還原存檔用）。
	 */
	setPowered(powered: boolean, immediate = false): void {
		if (this.isDestroyed) {
			return;
		}
		// 已經在淡出中又要求立即全亮：允許跳過剩下的淡出
		const skipRemainingFade = powered && immediate && this.isPowered && !this.isFullyLit;
		if (powered === this.isPowered && !skipRemainingFade) {
			return;
		}
		this.isPowered = powered;

		this.fadeTween?.stop();
		this.fadeTween = null;

		if (powered && immediate) {
			this.cancelSequence();
			this.overlay.setAlpha(0);
			this.markFullyLit();
			return;
		}

		if (powered) {
			this.fadeTween = this.scene.tweens.add({
				targets: this.overlay,
				alpha: 0,
				duration: POWER_FADE_DURATION,
				ease: "Sine.easeInOut",
				onComplete: () => {
					this.fadeTween = null;
					this.markFullyLit();
				},
			});
			return;
		}

		// 反向斷電：已亮的艙區與進行中的序列全部作廢，等待者也放行
		this.cancelSequence();
		this.litRooms = [];
		this.resolveFullyLitWaiters();
		this.isFullyLit = false;
		this.needsRedraw = true;
		this.overlay.setVisible(true);
		this.fadeTween = this.scene.tweens.add({
			targets: this.overlay,
			alpha: 1,
			duration: POWER_FADE_DURATION,
			ease: "Sine.easeInOut",
			onComplete: () => {
				this.fadeTween = null;
			},
		});
	}

	/** 清掉遮罩與 tween。漸層 texture 留在 TextureManager（很小，場景重啟時重用）。 */
	destroy(): void {
		if (this.isDestroyed) {
			return;
		}
		this.isDestroyed = true;

		this.fadeTween?.stop();
		this.fadeTween = null;
		this.cancelSequence();
		this.litRooms = [];
		this.resolveFullyLitWaiters();
		this.roomGraphics.destroy();
		this.overlay.destroy();
	}

	// -----------------------------------------------------------------------
	// 亮燈序列
	// -----------------------------------------------------------------------

	/** 把一間艙區加進已亮清單，level 從 0 淡入到 1，每一步都標記需要重畫。 */
	private lightRoom(room: PowerOnRoom, onRoomLit?: (roomId: RoomId) => void): void {
		if (this.isDestroyed || this.isFullyLit) {
			return;
		}

		// 只複製矩形的四個數字，不保留 Phaser.Geom.Rectangle 的參照
		const litRoom: LitRoom = {
			roomId: room.roomId,
			rect: { x: room.rect.x, y: room.rect.y, width: room.rect.width, height: room.rect.height },
			level: 0,
		};
		this.litRooms.push(litRoom);
		this.needsRedraw = true;

		const tween = this.scene.tweens.add({
			targets: litRoom,
			level: 1,
			duration: ROOM_LIGHT_DURATION,
			ease: "Quad.easeOut",
			onUpdate: () => {
				this.needsRedraw = true;
			},
			onComplete: () => {
				this.needsRedraw = true;
				this.roomTweens = this.roomTweens.filter((item) => item !== tween);
				onRoomLit?.(room.roomId);
			},
		});
		this.roomTweens.push(tween);
	}

	/** 取消排程中的序列計時器與艙區淡入 tween（不 resolve 等待者，由呼叫端決定）。 */
	private cancelSequence(): void {
		for (const timer of this.sequenceTimers) {
			timer.remove(false);
		}
		this.sequenceTimers = [];
		for (const tween of this.roomTweens) {
			tween.stop();
		}
		this.roomTweens = [];
		this.sequencePromise = null;
	}

	/** 整層淡出完成：停止重畫、隱藏遮罩、放行等待者。 */
	private markFullyLit(): void {
		this.isFullyLit = true;
		this.overlay.setVisible(false);
		this.sequencePromise = null;
		this.resolveFullyLitWaiters();
	}

	private resolveFullyLitWaiters(): void {
		const waiters = this.fullyLitWaiters;
		this.fullyLitWaiters = [];
		for (const resolve of waiters) {
			resolve();
		}
	}

	// -----------------------------------------------------------------------
	// 建構子用：所有 scene 相關呼叫
	// -----------------------------------------------------------------------

	/** 產生角色與終端機兩種大小的徑向漸層 texture（texture 是全域的，已存在就重用）。 */
	private createGradientTextures(): void {
		this.playerKey = this.ensureGradientTexture(LIGHT_RADIUS);
		this.terminalKey = this.ensureGradientTexture(TERMINAL_HOLE_RADIUS);
	}

	/** 整張地圖大小的黑色層，原點在左上角，與世界座標一致。 */
	private createOverlay(): void {
		this.overlay = this.scene.add.renderTexture(0, 0, this.mapWidth, this.mapHeight);
		this.overlay.setOrigin(0, 0);
		this.overlay.setDepth(MASK_DEPTH);
	}

	/**
	 * 用 canvas 畫一張中心不透明白、邊緣透明的徑向漸層。
	 * `erase` 時 texture 的 alpha 越高，挖掉黑色越多，所以中心全亮、邊緣柔和過渡到全黑。
	 * 回傳 texture key。
	 */
	private ensureGradientTexture(radius: number): string {
		const key = gradientTextureKey(radius);
		if (this.scene.textures.exists(key)) {
			return key;
		}

		const size = radius * 2;
		const texture = this.scene.textures.createCanvas(key, size, size);
		if (!texture) {
			throw new Error(`[LightMask] 無法建立漸層 texture「${key}」`);
		}

		const context = texture.getContext();
		const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);
		gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
		gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.9)");
		gradient.addColorStop(0.75, "rgba(255, 255, 255, 0.45)");
		gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
		context.fillStyle = gradient;
		context.fillRect(0, 0, size, size);

		// WebGL 下 canvas 內容要 refresh 才會上傳到 GPU
		texture.refresh();
		return key;
	}

	// -----------------------------------------------------------------------
	// 重畫
	// -----------------------------------------------------------------------

	/** 清空、鋪黑、挖玩家與終端機的洞，最後 render 讓指令緩衝真正畫進去。 */
	private redraw(): void {
		this.needsRedraw = false;

		this.overlay.clear();
		this.overlay.fill(0x000000, DARKNESS_ALPHA);

		if (this.lastPlayerX !== null && this.lastPlayerY !== null) {
			this.overlay.erase(this.playerKey, this.lastPlayerX, this.lastPlayerY);
		}
		for (const terminal of this.terminals) {
			this.overlay.erase(this.terminalKey, terminal.x, terminal.y);
		}
		this.eraseLitRooms();

		this.overlay.render();
	}

	/** 已亮的艙區畫成矩形（alpha = level），一次 erase 掉。Graphics 不在顯示清單上，只當橡皮擦。 */
	private eraseLitRooms(): void {
		if (this.litRooms.length === 0) {
			return;
		}

		this.roomGraphics.clear();
		for (const room of this.litRooms) {
			this.roomGraphics.fillStyle(ROOM_ERASE_COLOR, room.level);
			this.roomGraphics.fillRect(room.rect.x, room.rect.y, room.rect.width, room.rect.height);
		}
		this.overlay.erase(this.roomGraphics, 0, 0);
	}
}
