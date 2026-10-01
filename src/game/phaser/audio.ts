/**
 * Phaser 端的音效（設計文件 4.10）。
 *
 * `AudioManager` 是唯一的出口：React 透過 EventBus 發 `sfx:play`，由 `attachAudioEvents` 轉成 `manager.play`。
 * 音量與靜音交給 Phaser 的 SoundManager（`scene.sound.volume`、`scene.sound.mute`），不自己乘係數。
 * 素材來自 Kenney「Sci-Fi Sounds」與「Interface Sounds」（CC0），授權聲明在 `public/audio/LICENSE-kenney.txt`。
 */

import Phaser from "phaser";
import { onGameEvent } from "./EventBus";
import type { SfxName } from "./events";

/** 每種音效在 Phaser 快取裡的 key。 */
export const AUDIO_KEYS: Record<SfxName, string> = {
	ambient: "sfx-ambient",
	key: "sfx-key",
	door: "sfx-door",
	power: "sfx-power",
	"nova-blip": "sfx-nova-blip",
};

/** 每種音效的檔案路徑（相對於 public/），ogg 在前、mp3 墊底給不支援 ogg 的瀏覽器（例如 Safari）。 */
export const AUDIO_PATHS: Record<SfxName, string[]> = {
	ambient: ["/audio/ambient.ogg", "/audio/ambient.mp3"],
	key: ["/audio/key.ogg", "/audio/key.mp3"],
	door: ["/audio/door.ogg", "/audio/door.mp3"],
	power: ["/audio/power.ogg", "/audio/power.mp3"],
	"nova-blip": ["/audio/nova-blip.ogg", "/audio/nova-blip.mp3"],
};

/** 環境音的音量，站體嗡鳴要壓低，不蓋過其他音效。 */
const AMBIENT_VOLUME = 0.35;
const SFX_VOLUME = 1;

export interface AudioManagerOptions {
	/** 全域音量，0 到 1。 */
	volume: number;
	muted: boolean;
}

function clampVolume(volume: number): number {
	return Math.min(1, Math.max(0, volume));
}

export class AudioManager {
	private readonly scene: Phaser.Scene;
	/** 載入失敗（例如 headless 瀏覽器解碼不了、檔案 404）的音效會是 undefined，播放時略過，不讓整個場景炸掉。 */
	private readonly sounds: Partial<Record<SfxName, Phaser.Sound.BaseSound>>;
	/** 正在等瀏覽器解鎖後才播環境音時，記下要取消用的函式。 */
	private pendingAmbientUnlock: (() => void) | null = null;
	private destroyed = false;

	constructor(scene: Phaser.Scene, options: AudioManagerOptions) {
		this.scene = scene;
		this.sounds = {
			ambient: this.addSound("ambient", { loop: true, volume: AMBIENT_VOLUME }),
			key: this.addSound("key", { volume: SFX_VOLUME }),
			door: this.addSound("door", { volume: SFX_VOLUME }),
			power: this.addSound("power", { volume: SFX_VOLUME }),
			"nova-blip": this.addSound("nova-blip", { volume: SFX_VOLUME }),
		};
		this.setVolume(options.volume);
		this.setMuted(options.muted);
	}

	/**
	 * 只在 cache 裡真的有這個 key 時才建 sound，否則印 warn 並回傳 undefined。
	 *
	 * sound 也可能不是由我們銷毀，而是 `game.destroy()` 時 SoundManager 整批 `removeAll()`；
	 * 被銷毀的 sound 再 `play()` 會因內部 `currentConfig` 已是 null 而炸，所以一收到它的 DESTROY 就從清單拿掉。
	 */
	private addSound(name: SfxName, config: Phaser.Types.Sound.SoundConfig): Phaser.Sound.BaseSound | undefined {
		const key = AUDIO_KEYS[name];
		if (!this.scene.cache.audio.exists(key)) {
			console.warn(`[AudioManager] 音效 ${key} 不在 cache 裡，這個音效會被略過`);
			return undefined;
		}
		const sound = this.scene.sound.add(key, config);
		sound.once(Phaser.Sound.Events.DESTROY, () => {
			this.sounds[name] = undefined;
		});
		return sound;
	}

	/**
	 * 播放音效。
	 *
	 * 環境音是循環的，已經在播就不再疊加；瀏覽器還沒解鎖時等 `UNLOCKED` 才播。
	 * 其他音效在鎖住時直接略過（沒有使用者互動前出不了聲，補播也已經過時）。
	 */
	play(name: SfxName): void {
		if (this.destroyed) {
			return;
		}
		if (name === "ambient") {
			this.playAmbient();
			return;
		}
		if (this.scene.sound.locked) {
			return;
		}
		this.sounds[name]?.play();
	}

	/** 停掉環境音，也取消還在等解鎖的待播。 */
	stopAmbient(): void {
		this.cancelPendingAmbient();
		this.sounds.ambient?.stop();
	}

	/** 設定全域音量，超出 0 到 1 會被夾住。 */
	setVolume(volume: number): void {
		this.scene.sound.volume = clampVolume(volume);
	}

	setMuted(muted: boolean): void {
		this.scene.sound.mute = muted;
	}

	/** 停掉並銷毀所有 sound 物件，場景關閉時呼叫。重複呼叫是安全的。 */
	destroy(): void {
		if (this.destroyed) {
			return;
		}
		this.destroyed = true;
		this.cancelPendingAmbient();
		const names = Object.keys(this.sounds) as SfxName[];
		for (const name of names) {
			this.sounds[name]?.destroy();
		}
	}

	private playAmbient(): void {
		const ambient = this.sounds.ambient;
		if (ambient === undefined || ambient.isPlaying) {
			return;
		}
		if (this.scene.sound.locked) {
			// 已經在等了就不要重複掛 listener
			if (this.pendingAmbientUnlock !== null) {
				return;
			}
			const onUnlocked = (): void => {
				this.pendingAmbientUnlock = null;
				if (!this.destroyed && !ambient.isPlaying) {
					ambient.play();
				}
			};
			this.scene.sound.once(Phaser.Sound.Events.UNLOCKED, onUnlocked);
			this.pendingAmbientUnlock = () => {
				this.scene.sound.off(Phaser.Sound.Events.UNLOCKED, onUnlocked);
				this.pendingAmbientUnlock = null;
			};
			return;
		}
		ambient.play();
	}

	private cancelPendingAmbient(): void {
		this.pendingAmbientUnlock?.();
	}
}

/**
 * 訂閱 EventBus 的 `sfx:play`，轉給 `manager.play`。
 *
 * 回傳取消訂閱函式，場景關閉時要呼叫。
 */
export function attachAudioEvents(_scene: Phaser.Scene, manager: AudioManager): () => void {
	return onGameEvent("sfx:play", ({ sound }) => {
		manager.play(sound);
	});
}
