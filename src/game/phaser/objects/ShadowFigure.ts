import Phaser from "phaser";
import { ASSET_KEYS } from "../constants";

/** 面向下的站立幀，與玩家初始幀相同：人影看起來就是「另一個你」。 */
const STANDING_FRAME = 0;

/** 全黑剪影，alpha 不到 1 讓背後的地板隱約透出來。 */
const SHADOW_TINT = 0x000000;
const SHADOW_ALPHA = 0.85;

/**
 * 深度：燈光遮罩（50）之上，終端機「按 E」提示（60）之下。
 * 放在遮罩之上，就算那一格還沒亮也看得到剪影。
 */
const SHADOW_DEPTH = 55;

/** 閃現持續時間（ms），大約一幀多一點，看得到但來不及確認。 */
const FLASH_DURATION = 120;

/** 關閉閃爍時改用的淡入與淡出各自長度（ms），慢到不構成閃光。 */
const FADE_LEG_DURATION = 700;

/** 閃現時鏡頭的輕微震動。 */
const SHAKE_DURATION = 150;
const SHAKE_INTENSITY = 0.002;

/**
 * 走廊盡頭的人影（設計文件 4.4 第 4 列、4.5 恐怖手法第 2 種）。
 *
 * 用玩家同一張 spritesheet 的站立幀染黑，平時隱藏；`flashAt` 顯示約 120ms 後隱藏。
 * 場景 shutdown 時由 Station 呼叫 `destroy()`。
 */
export class ShadowFigure {
	private readonly scene: Phaser.Scene;
	private readonly sprite: Phaser.GameObjects.Sprite;

	private hideTimer: Phaser.Time.TimerEvent | null = null;
	private fadeTween: Phaser.Tweens.Tween | null = null;
	/** 正在等待的 flashAt Promise，destroy 時要放行，避免呼叫端永遠卡住。 */
	private pendingResolve: (() => void) | null = null;
	private isDestroyed = false;

	constructor(scene: Phaser.Scene) {
		this.scene = scene;
		this.sprite = scene.add.sprite(0, 0, ASSET_KEYS.player, STANDING_FRAME);
		this.sprite.setTint(SHADOW_TINT);
		this.sprite.setAlpha(SHADOW_ALPHA);
		this.sprite.setDepth(SHADOW_DEPTH);
		this.sprite.setVisible(false);
	}

	/**
	 * 在指定位置閃現一幀（約 120ms）後消失，回傳 Promise。
	 *
	 * `style: "fade"`（設定關閉閃爍時）改成慢慢浮現再淡出，`shake: false` 時鏡頭不震。
	 */
	flashAt(
		x: number,
		y: number,
		options: { style: "flash" | "fade"; shake: boolean } = { style: "flash", shake: true },
	): Promise<void> {
		if (this.isDestroyed) {
			return Promise.resolve();
		}

		// 前一次還沒結束就先收掉，避免兩個計時器搶著隱藏
		this.finishFlash();

		this.sprite.setPosition(Math.round(x), Math.round(y));
		this.sprite.setVisible(true);
		if (options.shake) {
			this.scene.cameras.main.shake(SHAKE_DURATION, SHAKE_INTENSITY);
		}

		return new Promise<void>((resolve) => {
			this.pendingResolve = resolve;
			if (options.style === "fade") {
				this.sprite.setAlpha(0);
				this.fadeTween = this.scene.tweens.add({
					targets: this.sprite,
					alpha: SHADOW_ALPHA,
					duration: FADE_LEG_DURATION,
					yoyo: true,
					onComplete: () => {
						this.fadeTween = null;
						this.finishFlash();
					},
				});
				return;
			}
			this.hideTimer = this.scene.time.delayedCall(FLASH_DURATION, () => {
				this.hideTimer = null;
				this.finishFlash();
			});
		});
	}

	destroy(): void {
		if (this.isDestroyed) {
			return;
		}
		this.isDestroyed = true;
		this.finishFlash();
		this.sprite.destroy();
	}

	/** 隱藏剪影、取消計時器並放行等待中的 Promise。 */
	private finishFlash(): void {
		this.hideTimer?.remove(false);
		this.hideTimer = null;
		this.fadeTween?.stop();
		this.fadeTween = null;
		this.sprite.setVisible(false);
		this.sprite.setAlpha(SHADOW_ALPHA);

		const resolve = this.pendingResolve;
		this.pendingResolve = null;
		resolve?.();
	}
}
