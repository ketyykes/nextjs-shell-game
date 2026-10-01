import Phaser from "phaser";
import { SCENE_KEYS } from "./keys";

/**
 * 第一個啟動的場景。
 *
 * 目前沒有東西要載，直接進 Preloader。
 * 之後做標題畫面時，標題 logo、載入條底圖這類「Preloader 自己要用的」小型靜態資源在這裡的 `preload()` 載入。
 */
export class Boot extends Phaser.Scene {
	constructor() {
		super({ key: SCENE_KEYS.boot });
	}

	create(): void {
		this.scene.start(SCENE_KEYS.preloader);
	}
}
