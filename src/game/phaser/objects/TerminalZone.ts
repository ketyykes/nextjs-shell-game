import Phaser from "phaser";
import { TERMINAL_INTERACT_RADIUS, TILE_SIZE } from "../constants";
import { emitGameEvent } from "../EventBus";
import type { TerminalMarker } from "../scenes/mapObjects";
import { findNearestTerminal } from "./nearby";

/** 全息藍，與暫代角色同色。 */
const HOLOGRAM_BLUE = 0x5fb3e8;

/** 發光圓的半徑（px）。 */
const GLOW_RADIUS = TILE_SIZE * 0.75;
/** 平常脈動的 alpha 範圍。 */
const GLOW_ALPHA_MIN = 0.15;
const GLOW_ALPHA_MAX = 0.35;
/** 靠近時固定的 alpha。 */
const GLOW_ALPHA_NEARBY = 0.5;
/** 脈動單程時間（ms），yoyo 一來一回共兩倍。 */
const GLOW_PULSE_DURATION = 900;

/** 「按 E」提示在終端機中心上方的距離（px）。 */
const HINT_OFFSET_Y = 28;

/**
 * 深度配置（與 LightMask 的深度表一起看）：
 * 發光圓在地板之上、角色之下；提示文字要在黑色遮罩（深度 50）之上，不然會被蓋黑。
 */
const GLOW_DEPTH = 5;
const HINT_DEPTH = 60;

/** 一台終端機的發光效果。 */
interface TerminalGlow {
	terminalId: string;
	graphics: Phaser.GameObjects.Graphics;
	pulse: Phaser.Tweens.Tween;
}

/**
 * 管理場景內所有終端機的互動區：發光指引、靠近提示、按 E 開啟。
 *
 * 整合方式：Station 的 `create()` 建立一次，`update()` 每幀傳入玩家座標；
 * 場景 shutdown 時呼叫 `destroy()`。
 */
export class TerminalZones {
	private readonly scene: Phaser.Scene;
	private readonly terminals: readonly TerminalMarker[];

	private glows: TerminalGlow[] = [];
	private hintText!: Phaser.GameObjects.Text;
	private eKey!: Phaser.Input.Keyboard.Key;

	private currentTerminalId: string | null = null;
	private isDestroyed = false;

	constructor(scene: Phaser.Scene, terminals: TerminalMarker[]) {
		this.scene = scene;
		this.terminals = terminals;

		// 所有需要 scene 的呼叫都集中在這三個方法，除錯時從這裡下手
		this.createGlows();
		this.createHintText();
		this.createKey();
	}

	/** 目前靠近的終端機 id，沒有靠近任何一台為 null。 */
	get nearbyTerminalId(): string | null {
		return this.currentTerminalId;
	}

	/** 每幀呼叫：更新靠近狀態。按 E 的處理走按鍵事件（見 `handleInteract`），不在這裡輪詢。 */
	update(playerX: number, playerY: number): void {
		if (this.isDestroyed) {
			return;
		}

		const nearest = findNearestTerminal(playerX, playerY, this.terminals, TERMINAL_INTERACT_RADIUS);
		const nextTerminalId = nearest ? nearest.terminalId : null;

		if (nextTerminalId !== this.currentTerminalId) {
			this.currentTerminalId = nextTerminalId;
			this.applyNearbyState(nearest);
			emitGameEvent("terminal:nearby", { terminalId: nextTerminalId });
		}
	}

	/**
	 * E 鍵按下：有靠近的終端機就發 `terminal:open` 並暫停場景。
	 * 用事件而不是每幀 `JustDown`：`Key.onUp` 會清掉 justDown 旗標，
	 * keydown 與 keyup 落在同一幀時（例如自動化測試的 press）輪詢會漏掉。
	 * 場景暫停後鍵盤事件不會再被處理，恢復由 Station 的 `terminal:close` handler 負責。
	 */
	private handleInteract(): void {
		if (this.isDestroyed || this.currentTerminalId === null) {
			return;
		}
		if (!this.scene.scene.isActive()) {
			return;
		}
		emitGameEvent("terminal:open", { terminalId: this.currentTerminalId });
		this.scene.scene.pause();
	}

	/** 清掉 graphics、text、tween 與按鍵。可重複呼叫。 */
	destroy(): void {
		if (this.isDestroyed) {
			return;
		}
		this.isDestroyed = true;

		for (const glow of this.glows) {
			glow.pulse.stop();
			glow.graphics.destroy();
		}
		this.glows = [];

		this.hintText.destroy();
		this.eKey.off(Phaser.Input.Keyboard.Events.DOWN, this.handleInteract, this);
		// 第三個參數 true：連 addKey 時註冊的 capture 一起移除
		this.scene.input.keyboard?.removeKey(this.eKey, true, true);
		this.currentTerminalId = null;
	}

	// -----------------------------------------------------------------------
	// 建構子用：所有 scene 相關呼叫
	// -----------------------------------------------------------------------

	/** 每台終端機一個半透明全息藍圓，alpha 用 tween 脈動。斷電時它是唯一的方向指引，所以一直亮著。 */
	private createGlows(): void {
		this.glows = this.terminals.map((terminal) => {
			const graphics = this.scene.add.graphics({ x: terminal.x, y: terminal.y });
			graphics.fillStyle(HOLOGRAM_BLUE, 1);
			graphics.fillCircle(0, 0, GLOW_RADIUS);
			graphics.setDepth(GLOW_DEPTH);
			graphics.setAlpha(GLOW_ALPHA_MIN);

			const pulse = this.scene.tweens.add({
				targets: graphics,
				alpha: { from: GLOW_ALPHA_MIN, to: GLOW_ALPHA_MAX },
				duration: GLOW_PULSE_DURATION,
				ease: "Sine.easeInOut",
				yoyo: true,
				repeat: -1,
			});

			return { terminalId: terminal.terminalId, graphics, pulse };
		});
	}

	/** 「按 E」提示，全場景共用一個 Text，靠近時搬到該終端機上方。先用系統 monospace，之後再換 bitmap 字型。 */
	private createHintText(): void {
		this.hintText = this.scene.add.text(0, 0, "按 E", {
			fontFamily: "monospace",
			fontSize: "10px",
			color: "#5fb3e8",
		});
		this.hintText.setOrigin(0.5, 0.5);
		this.hintText.setResolution(1);
		this.hintText.setDepth(HINT_DEPTH);
		this.hintText.setVisible(false);
	}

	/**
	 * 註冊 E 鍵。第二個參數 false：不要 preventDefault，
	 * 否則終端機彈窗裡的輸入框打不出字母 e。
	 */
	private createKey(): void {
		const keyboard = this.scene.input.keyboard;
		if (!keyboard) {
			throw new Error("[TerminalZones] 鍵盤輸入未啟用，無法註冊 E 鍵");
		}
		this.eKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E, false);
		this.eKey.on(Phaser.Input.Keyboard.Events.DOWN, this.handleInteract, this);
	}

	// -----------------------------------------------------------------------
	// 狀態切換
	// -----------------------------------------------------------------------

	/**
	 * 靠近對象改變時更新視覺：
	 * 離開的終端機恢復脈動，新靠近的終端機停止脈動、alpha 固定，並把提示移過去。
	 */
	private applyNearbyState(nearest: TerminalMarker | null): void {
		for (const glow of this.glows) {
			const isNearest = nearest !== null && glow.terminalId === nearest.terminalId;
			if (isNearest) {
				glow.pulse.pause();
				glow.graphics.setAlpha(GLOW_ALPHA_NEARBY);
			} else if (glow.pulse.isPaused()) {
				glow.pulse.resume();
			}
		}

		if (nearest === null) {
			this.hintText.setVisible(false);
			return;
		}
		this.hintText.setPosition(nearest.x, nearest.y - HINT_OFFSET_Y);
		this.hintText.setVisible(true);
	}
}
