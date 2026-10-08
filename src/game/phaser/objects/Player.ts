import Phaser from "phaser";
import {
	ASSET_KEYS,
	PLAYER_SPEED,
	SPRITE_FRAMES_PER_ROW,
	SPRITE_ROW_BY_DIRECTION,
	type Direction,
} from "../constants";
import { walkAnimationKey } from "../scenes/Preloader";
import { resolveMovement, type MovementInput } from "./movement";

/**
 * 碰撞盒（設計文件 6.2：格子 32x48，角色寬 20 到 28 px，腳底在第 47 列）。
 *
 * 俯視角只讓「腳」碰牆：盒子放在 sprite 下半部，上半身可以蓋在牆的下緣，看起來像站在牆前。
 * x 偏移 (32 - 20) / 2 = 6 讓盒子水平置中；y 偏移 48 - 14 = 34 讓盒子底邊貼齊格子底邊（第 47 列腳底）。
 */
const BODY_WIDTH = 20;
const BODY_HEIGHT = 14;
const BODY_OFFSET_X = 6;
const BODY_OFFSET_Y = 34;

/** 角色在燈光遮罩之下、地圖之上。 */
const PLAYER_DEPTH = 10;

/** 初始幀：面向下的站立幀。 */
const INITIAL_FRAME = 0;

/** 方向鍵與 WASD 各自的 Key 物件，同一個方向任一組按著就算按下。 */
interface MovementKeys {
	up: Phaser.Input.Keyboard.Key;
	down: Phaser.Input.Keyboard.Key;
	left: Phaser.Input.Keyboard.Key;
	right: Phaser.Input.Keyboard.Key;
}

/**
 * 玩家角色：arcade sprite，WASD 或方向鍵移動，四方向走路動畫。
 *
 * 終端機開著時由 Station 呼叫 `setInputEnabled(false)` 停住角色。
 * E 鍵（互動）不在這裡註冊，由終端機互動邏輯自己處理。
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
	private readonly arrowKeys: MovementKeys;
	private readonly wasdKeys: MovementKeys;
	private currentFacing: Direction = "down";
	private inputEnabled = true;

	constructor(scene: Phaser.Scene, x: number, y: number) {
		super(scene, x, y, ASSET_KEYS.player, INITIAL_FRAME);

		scene.add.existing(this);
		scene.physics.add.existing(this);

		// setBodySize 第三個參數 false：不要自動置中，改用下面的 offset 放到腳的位置
		this.setBodySize(BODY_WIDTH, BODY_HEIGHT, false);
		this.setOffset(BODY_OFFSET_X, BODY_OFFSET_Y);
		this.setCollideWorldBounds(true);
		this.setDepth(PLAYER_DEPTH);

		const keyboard = scene.input.keyboard;
		if (!keyboard) {
			throw new Error("[Player] 場景沒有啟用鍵盤輸入，請確認遊戲設定沒有關掉 input.keyboard");
		}

		// 不用 createCursorKeys：它會連 SPACE 一起註冊並全域 capture（preventDefault），
		// 終端機輸入框就打不出空白。這裡只註冊四個方向鍵。
		// 方向鍵要 capture，避免按下時捲動頁面；WASD 不 capture，字母本來就不會捲頁面，
		// 也不會擋到頁面上其他輸入框打字。
		const keyCodes = Phaser.Input.Keyboard.KeyCodes;
		this.arrowKeys = keyboard.addKeys(
			{ up: keyCodes.UP, down: keyCodes.DOWN, left: keyCodes.LEFT, right: keyCodes.RIGHT },
			true,
		) as MovementKeys;
		this.wasdKeys = keyboard.addKeys(
			{ up: keyCodes.W, down: keyCodes.S, left: keyCodes.A, right: keyCodes.D },
			false,
		) as MovementKeys;
	}

	/** 目前面向，終端機互動或燈光判定可以用。 */
	get facing(): Direction {
		return this.currentFacing;
	}

	/** 鍵盤控制是否開著（終端機或暫停選單開著時為 false），開發模式的座標鉤子會讀。 */
	get isInputEnabled(): boolean {
		return this.inputEnabled;
	}

	/**
	 * 每幀呼叫，依鍵盤設速度與動畫。inputEnabled 為 false 時停住並播站立幀。
	 *
	 * 不是 Phaser 自動呼叫的（Sprite 只自動跑 preUpdate），由 Station 的 `update()` 呼叫。
	 */
	update(): void {
		if (!this.inputEnabled) {
			this.stopMoving();
			return;
		}

		const movement = resolveMovement(this.readInput(), PLAYER_SPEED, this.currentFacing);

		if (!movement.moving || movement.direction === null) {
			this.stopMoving();
			return;
		}

		this.setVelocity(movement.vx, movement.vy);
		this.currentFacing = movement.direction;
		// ignoreIfPlaying：同方向持續走時不要每幀從第 0 幀重播
		this.anims.play(walkAnimationKey(movement.direction), true);
	}

	/**
	 * 開關鍵盤控制。關閉時立刻停住並顯示站立幀。
	 *
	 * 同時切換全域的按鍵 capture：方向鍵的 preventDefault 是整個遊戲共用、掛在 window 上的，
	 * 終端機開著時若不關掉，shell 裡的 ↑ ↓ 歷史與游標移動會被吃掉。
	 */
	setInputEnabled(enabled: boolean): void {
		this.inputEnabled = enabled;

		const keyboard = this.scene.input.keyboard;
		if (keyboard) {
			if (enabled) {
				keyboard.enableGlobalCapture();
			} else {
				keyboard.disableGlobalCapture();
			}
		}

		if (!enabled) {
			this.stopMoving();
		}
	}

	/** 合併方向鍵與 WASD。 */
	private readInput(): MovementInput {
		return {
			up: this.arrowKeys.up.isDown || this.wasdKeys.up.isDown,
			down: this.arrowKeys.down.isDown || this.wasdKeys.down.isDown,
			left: this.arrowKeys.left.isDown || this.wasdKeys.left.isDown,
			right: this.arrowKeys.right.isDown || this.wasdKeys.right.isDown,
		};
	}

	/** 速度歸零、停動畫，顯示目前面向的站立幀（每列第 0 幀）。 */
	private stopMoving(): void {
		this.setVelocity(0, 0);
		if (this.anims.isPlaying) {
			this.anims.stop();
		}
		this.setFrame(SPRITE_ROW_BY_DIRECTION[this.currentFacing] * SPRITE_FRAMES_PER_ROW);
	}
}
