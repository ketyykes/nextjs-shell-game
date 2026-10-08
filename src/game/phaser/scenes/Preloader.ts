import Phaser from "phaser";
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
import { emitGameEvent } from "../EventBus";
import { readRegistryValue } from "../registry";
import { summarizeAssetFailure } from "./assetCheck";
import { SCENE_KEYS } from "./keys";

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
 * 載入目前章節的甲板地圖與共用資源、建立全域動畫，完成後進 Station。
 *
 * 動畫放這裡建立而不是 Station，Station 重啟時才不會重複建立。
 * 素材載不到時（M12-6）經 EventBus 發 `assets:error` 讓 React 顯示提示；關鍵素材缺了就停在這裡不進 Station。
 */
export class Preloader extends Phaser.Scene {
	/** 這次載入發過 `loaderror` 的檔案網址。 */
	private loadErrors: { url: string }[] = [];
	/** 這次載入的地圖與角色 sprite 網址，載完檢查 cache 時列進提示用。 */
	private mapUrl = "";
	private playerSpriteUrl = "";

	constructor() {
		super({ key: SCENE_KEYS.preloader });
	}

	preload(): void {
		this.createProgressBar();
		this.trackLoadErrors();

		// 選角讀不到代表沒透過 startGame 啟動，readRegistryValue 會直接丟錯
		const character = readRegistryValue(this.registry, "character");
		// 六個甲板共用 `ASSET_KEYS.map` 這個 key；換章時 React 會銷毀重建整個遊戲，cache 不會殘留上一章的圖
		const chapter = readRegistryValue(this.registry, "chapter");
		this.mapUrl = toPublicUrl(ASSET_PATHS.map(chapter));
		this.playerSpriteUrl = toPublicUrl(ASSET_PATHS.playerSprite(character));

		this.load.image(ASSET_KEYS.tileset, toPublicUrl(ASSET_PATHS.tileset));
		this.load.tilemapTiledJSON(ASSET_KEYS.map, this.mapUrl);
		this.load.spritesheet(ASSET_KEYS.player, this.playerSpriteUrl, {
			frameWidth: SPRITE_FRAME_WIDTH,
			frameHeight: SPRITE_FRAME_HEIGHT,
		});
		this.loadAudio();
	}

	create(): void {
		const failure = summarizeAssetFailure(this.loadErrors, [
			{ url: toPublicUrl(ASSET_PATHS.tileset), loaded: this.textures.exists(ASSET_KEYS.tileset) },
			{ url: this.mapUrl, loaded: this.cache.tilemap.exists(ASSET_KEYS.map) },
			{ url: this.playerSpriteUrl, loaded: this.textures.exists(ASSET_KEYS.player) },
		]);
		if (failure !== null) {
			emitGameEvent("assets:error", failure);
			// 少了地圖、tileset 或角色，Station.create 會在 Phaser 迴圈裡丟例外變黑畫面，乾脆停在這裡等玩家重新載入
			if (failure.fatal) {
				return;
			}
		}
		this.createWalkAnimations();
		this.scene.start(SCENE_KEYS.station);
	}

	/** 記下網路層載入失敗的檔案（404、離線）；監聽掛在這個場景自己的 loader 上，跟著場景一起銷毀。 */
	private trackLoadErrors(): void {
		this.loadErrors = [];
		this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
			const url = file.src !== "" ? file.src : String(file.url);
			console.warn(`[Preloader] 素材 ${file.key} 載入失敗：${url}`);
			this.loadErrors.push({ url });
		});
	}

	/** 載入五種音效，同時給 ogg 與 mp3，Phaser 會挑瀏覽器支援的格式。 */
	private loadAudio(): void {
		const names = Object.keys(AUDIO_KEYS) as SfxName[];
		for (const name of names) {
			this.load.audio(AUDIO_KEYS[name], AUDIO_PATHS[name]);
		}
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
