import Phaser from "phaser";
import { LIGHT_RADIUS, TERMINAL_INTERACT_RADIUS } from "../constants";
import type { TerminalMarker } from "../scenes/mapObjects";

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
	 * 配電箱過關後呼叫（M4 用）。
	 * `true`：1.5 秒內把遮罩淡出到全亮，淡出期間光圈仍會跟著玩家，完成後停止重畫並隱藏。
	 * `false`：反向，遮罩立即顯示並淡入回斷電狀態。
	 */
	setPowered(powered: boolean): void {
		if (this.isDestroyed || powered === this.isPowered) {
			return;
		}
		this.isPowered = powered;

		this.fadeTween?.stop();
		this.fadeTween = null;

		if (powered) {
			this.fadeTween = this.scene.tweens.add({
				targets: this.overlay,
				alpha: 0,
				duration: POWER_FADE_DURATION,
				ease: "Sine.easeInOut",
				onComplete: () => {
					this.isFullyLit = true;
					this.overlay.setVisible(false);
					this.fadeTween = null;
				},
			});
			return;
		}

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
		this.overlay.destroy();
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

		this.overlay.render();
	}
}
