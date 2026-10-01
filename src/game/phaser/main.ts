/**
 * Phaser 遊戲進入點。
 *
 * 只能在 client 端呼叫（Phaser 會碰 `window`），React 端由 `next/dynamic` 加 `ssr: false` 載入的元件呼叫 `startGame`。
 */

import Phaser from "phaser";
import type { CharacterId } from "@/game/store/types";
import { GAME_HEIGHT, GAME_WIDTH } from "./constants";
import { Boot } from "./scenes/Boot";
import { REGISTRY_KEYS, SCENE_KEYS } from "./scenes/keys";
import { Preloader } from "./scenes/Preloader";
import { Station } from "./scenes/Station";

export { SCENE_KEYS, REGISTRY_KEYS };
export type { SceneKey } from "./scenes/keys";

/** 畫布底色：近黑深藍。 */
const BACKGROUND_COLOR = "#0b1020";

export interface StartGameOptions {
	character: CharacterId;
}

/** 建立遊戲並掛到 parent 底下；呼叫端負責在卸載時 `game.destroy(true)`。 */
export function startGame(parent: HTMLElement, options: StartGameOptions): Phaser.Game {
	const config: Phaser.Types.Core.GameConfig = {
		type: Phaser.AUTO,
		parent,
		width: GAME_WIDTH,
		height: GAME_HEIGHT,
		// 關掉抗鋸齒並開 roundPixels，像素放大不糊
		pixelArt: true,
		backgroundColor: BACKGROUND_COLOR,
		scale: {
			mode: Phaser.Scale.FIT,
			autoCenter: Phaser.Scale.CENTER_BOTH,
		},
		physics: {
			default: "arcade",
			arcade: {
				debug: false,
			},
		},
		scene: [Boot, Preloader, Station],
		callbacks: {
			// preBoot 在任何場景啟動前執行，選角在這裡寫進 registry，Preloader 用 `this.registry.get("character")` 讀
			preBoot: (game) => {
				game.registry.set(REGISTRY_KEYS.character, options.character);
			},
		},
	};

	return new Phaser.Game(config);
}
