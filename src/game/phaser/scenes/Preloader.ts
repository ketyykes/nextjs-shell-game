import Phaser from "phaser";
import type { CharacterId } from "@/game/store/types";
import type { SfxName } from "../events";
import {
	ASSET_KEYS,
	ASSET_PATHS,
	SPRITE_FRAME_HEIGHT,
	SPRITE_FRAME_WIDTH,
	SPRITE_FRAMES_PER_ROW,
	SPRITE_ROW_BY_DIRECTION,
	type Direction,
} from "../constants";
import { AUDIO_KEYS, AUDIO_PATHS } from "../audio";
import { REGISTRY_KEYS, SCENE_KEYS } from "./keys";

/** 載入條配色：全息藍。 */
const PROGRESS_BAR_COLOR = 0x5fb3e8;
const PROGRESS_FRAME_COLOR = 0x1d3a52;
const PROGRESS_BAR_WIDTH = 320;
const PROGRESS_BAR_HEIGHT = 12;

const WALK_FRAME_RATE = 8;

/** 走路動畫的 key，Player 播動畫時用。 */
export function walkAnimationKey(direction: Direction): string {
	return `walk-${direction}`;
}

/** Next.js 的 `public/` 對應網站根目錄，路徑前補 `/`。 */
function toPublicUrl(path: string): string {
	if (path.startsWith("/")) {
		return path;
	}
	return `/${path}`;
}

/**
 * 載入第一章所有資源並建立全域動畫，完成後進 Station。
 *
 * 動畫放這裡建立而不是 Station，Station 重啟時才不會重複建立。
 */
export class Preloader extends Phaser.Scene {
	constructor() {
		super({ key: SCENE_KEYS.preloader });
	}

	preload(): void {
		this.createProgressBar();

		const character = this.readCharacter();

		this.load.image(ASSET_KEYS.tileset, toPublicUrl(ASSET_PATHS.tileset));
		this.load.tilemapTiledJSON(ASSET_KEYS.map, toPublicUrl(ASSET_PATHS.map));
		this.load.spritesheet(ASSET_KEYS.player, toPublicUrl(ASSET_PATHS.playerSprite(character)), {
			frameWidth: SPRITE_FRAME_WIDTH,
			frameHeight: SPRITE_FRAME_HEIGHT,
		});
		this.loadAudio();
	}

	create(): void {
		this.createWalkAnimations();
		this.scene.start(SCENE_KEYS.station);
	}

	/** 載入五種音效，同時給 ogg 與 mp3，Phaser 會挑瀏覽器支援的格式。 */
	private loadAudio(): void {
		const names = Object.keys(AUDIO_KEYS) as SfxName[];
		for (const name of names) {
			this.load.audio(AUDIO_KEYS[name], AUDIO_PATHS[name]);
		}
	}

	/** 從 registry 讀選角，`startGame` 一定會寫入，讀不到代表呼叫端漏傳。 */
	private readCharacter(): CharacterId {
		const character = this.registry.get(REGISTRY_KEYS.character) as CharacterId | undefined;
		if (!character) {
			throw new Error("[Preloader] registry 裡沒有 character，請透過 startGame 啟動遊戲");
		}
		return character;
	}

	/** 畫面中央的簡單載入條，載完自動清掉。 */
	private createProgressBar(): void {
		const centerX = this.scale.width / 2;
		const centerY = this.scale.height / 2;
		const left = centerX - PROGRESS_BAR_WIDTH / 2;
		const top = centerY - PROGRESS_BAR_HEIGHT / 2;

		const frame = this.add.graphics();
		frame.lineStyle(2, PROGRESS_FRAME_COLOR, 1);
		frame.strokeRect(left - 4, top - 4, PROGRESS_BAR_WIDTH + 8, PROGRESS_BAR_HEIGHT + 8);

		const bar = this.add.graphics();

		this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) => {
			bar.clear();
			bar.fillStyle(PROGRESS_BAR_COLOR, 1);
			bar.fillRect(left, top, PROGRESS_BAR_WIDTH * progress, PROGRESS_BAR_HEIGHT);
		});

		this.load.once(Phaser.Loader.Events.COMPLETE, () => {
			bar.destroy();
			frame.destroy();
		});
	}

	/** 四方向走路動畫，每列 4 幀，列順序見 `SPRITE_ROW_BY_DIRECTION`。 */
	private createWalkAnimations(): void {
		const directions = Object.keys(SPRITE_ROW_BY_DIRECTION) as Direction[];

		for (const direction of directions) {
			const key = walkAnimationKey(direction);
			// 動畫是全域的，重複建立會警告，所以先檢查
			if (this.anims.exists(key)) {
				continue;
			}

			const row = SPRITE_ROW_BY_DIRECTION[direction];
			const start = row * SPRITE_FRAMES_PER_ROW;
			this.anims.create({
				key,
				frames: this.anims.generateFrameNumbers(ASSET_KEYS.player, {
					start,
					end: start + SPRITE_FRAMES_PER_ROW - 1,
				}),
				frameRate: WALK_FRAME_RATE,
				repeat: -1,
			});
		}
	}
}
