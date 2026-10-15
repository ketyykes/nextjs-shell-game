/**
 * Phaser 端的音效（設計文件 4.10、4.25）。
 *
 * `AudioManager` 是唯一的出口：React 透過 EventBus 發 `sfx:play`，由 `attachAudioEvents` 轉成 `manager.play`；
 * 低氧心跳走 `audio:heartbeat`，轉成 `manager.setHeartbeat`。
 * 全域音量與靜音交給 Phaser 的 SoundManager（`scene.sound.volume`、`scene.sound.mute`），不自己乘係數；
 * 每個 sound 自己的音量（環境音壓低、心跳隨氧氣變大、低語極小聲）會再乘上全域音量，所以設定選單照樣生效。
 * 第一版五種來自 Kenney「Sci-Fi Sounds」與「Interface Sounds」（CC0），授權聲明在 `public/audio/LICENSE-kenney.txt`；
 * 第二批心跳與低語是 `scripts/synth-audio.mjs` 合成的（CC0），聲明在 `public/audio/LICENSE-synth.txt`。
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
	heartbeat: "sfx-heartbeat",
	whisper: "sfx-whisper",
};

/** 每種音效的檔案路徑（相對於 public/），ogg 在前、mp3 墊底給不支援 ogg 的瀏覽器（例如 Safari）。 */
export const AUDIO_PATHS: Record<SfxName, string[]> = {
	ambient: ["/audio/ambient.ogg", "/audio/ambient.mp3"],
	key: ["/audio/key.ogg", "/audio/key.mp3"],
	door: ["/audio/door.ogg", "/audio/door.mp3"],
	power: ["/audio/power.ogg", "/audio/power.mp3"],
	"nova-blip": ["/audio/nova-blip.ogg", "/audio/nova-blip.mp3"],
	heartbeat: ["/audio/heartbeat.ogg", "/audio/heartbeat.mp3"],
	whisper: ["/audio/whisper.ogg", "/audio/whisper.mp3"],
};

/** 環境音的音量，站體嗡鳴要壓低，不蓋過其他音效。 */
const AMBIENT_VOLUME = 0.35;
const SFX_VOLUME = 1;
/** 心跳剛出現（氧氣 19%）時的音量：聽得到但比環境音小。 */
export const HEARTBEAT_VOLUME_MIN = 0.25;
/** 氧氣到最低（5%）時的音量。 */
export const HEARTBEAT_VOLUME_MAX = 0.85;
/** NOVA 低語極小聲，聽得出有人在說話、聽不出說什麼。 */
export const WHISPER_VOLUME = 0.3;

/** 會循環、要等瀏覽器解鎖才開始播的兩種。 */
type LoopName = "ambient" | "heartbeat";

/** 心跳這種 sound 要能在播放中改音量；Phaser 的三種實作都有 `setVolume`，只是 `BaseSound` 的型別沒宣告。 */
type VolumeSound = Phaser.Sound.BaseSound & { setVolume: (value: number) => unknown };

export interface AudioManagerOptions {
	/** 全域音量，0 到 1。 */
	volume: number;
	muted: boolean;
}

function clampVolume(volume: number): number {
	return Math.min(1, Math.max(0, volume));
}

/** 心跳強度（0 到 1，`components/game/lowOxygen.ts` 的 `heartbeatFor`）換算成這個 sound 的音量，線性、夾在範圍內。 */
export function heartbeatVolume(intensity: number): number {
	const clamped = Math.min(1, Math.max(0, intensity));
	return HEARTBEAT_VOLUME_MIN + (HEARTBEAT_VOLUME_MAX - HEARTBEAT_VOLUME_MIN) * clamped;
}

export class AudioManager {
	private readonly scene: Phaser.Scene;
	/** 載入失敗（例如 headless 瀏覽器解碼不了、檔案 404）的音效會是 undefined，播放時略過，不讓整個場景炸掉。 */
	private readonly sounds: Partial<Record<SfxName, Phaser.Sound.BaseSound>>;
	/** 正在等瀏覽器解鎖後才播的循環音效，記下要取消用的函式。 */
	private readonly pendingUnlock: Partial<Record<LoopName, () => void>> = {};
	/** 心跳目前該不該響、該多大聲；等解鎖期間變了，解鎖時照最新的播。 */
	private heartbeat = { active: false, volume: HEARTBEAT_VOLUME_MIN };
	private destroyed = false;

	constructor(scene: Phaser.Scene, options: AudioManagerOptions) {
		this.scene = scene;
		this.sounds = {
			ambient: this.addSound("ambient", { loop: true, volume: AMBIENT_VOLUME }),
			key: this.addSound("key", { volume: SFX_VOLUME }),
			door: this.addSound("door", { volume: SFX_VOLUME }),
			power: this.addSound("power", { volume: SFX_VOLUME }),
			"nova-blip": this.addSound("nova-blip", { volume: SFX_VOLUME }),
			heartbeat: this.addSound("heartbeat", { loop: true, volume: HEARTBEAT_VOLUME_MIN }),
			whisper: this.addSound("whisper", { volume: WHISPER_VOLUME }),
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
	 * 心跳只聽 `setHeartbeat`，這裡不播，免得疊出兩層循環。
	 * 其他音效在鎖住時直接略過（沒有使用者互動前出不了聲，補播也已經過時）。
	 */
	play(name: SfxName): void {
		if (this.destroyed) {
			return;
		}
		if (name === "ambient") {
			this.playLoop("ambient");
			return;
		}
		if (name === "heartbeat") {
			return;
		}
		if (this.scene.sound.locked) {
			return;
		}
		this.sounds[name]?.play();
	}

	/** 停掉環境音，也取消還在等解鎖的待播。 */
	stopAmbient(): void {
		this.cancelPendingUnlock("ambient");
		this.sounds.ambient?.stop();
	}

	/**
	 * 低氧心跳（4.25）：`active` 時以 `heartbeatVolume(intensity)` 循環播放，播放中只調音量不重播；
	 * 關掉就停（也取消等解鎖的待播）。場景暫停（終端機開著）不影響 sound，照樣在響。
	 */
	setHeartbeat(active: boolean, intensity: number): void {
		if (this.destroyed) {
			return;
		}
		this.heartbeat = { active, volume: heartbeatVolume(intensity) };
		const sound = this.sounds.heartbeat as VolumeSound | undefined;
		if (!active) {
			this.cancelPendingUnlock("heartbeat");
			sound?.stop();
			return;
		}
		if (sound !== undefined && sound.isPlaying) {
			sound.setVolume(this.heartbeat.volume);
			return;
		}
		this.playLoop("heartbeat");
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
		this.cancelPendingUnlock("ambient");
		this.cancelPendingUnlock("heartbeat");
		const names = Object.keys(this.sounds) as SfxName[];
		for (const name of names) {
			this.sounds[name]?.destroy();
		}
	}

	/** 開始播循環音效；瀏覽器還沒解鎖時掛一個 `UNLOCKED` 監聽，解鎖時再確認一次該不該播。 */
	private playLoop(name: LoopName): void {
		const sound = this.sounds[name];
		if (sound === undefined || sound.isPlaying) {
			return;
		}
		if (!this.scene.sound.locked) {
			this.startLoop(name, sound);
			return;
		}
		// 已經在等了就不要重複掛 listener
		if (this.pendingUnlock[name] !== undefined) {
			return;
		}
		const onUnlocked = (): void => {
			this.pendingUnlock[name] = undefined;
			// 等的期間 sound 可能被 SoundManager 銷毀，重新從清單拿
			const current = this.sounds[name];
			if (this.destroyed || current === undefined || current.isPlaying) {
				return;
			}
			if (name === "heartbeat" && !this.heartbeat.active) {
				return;
			}
			this.startLoop(name, current);
		};
		this.scene.sound.once(Phaser.Sound.Events.UNLOCKED, onUnlocked);
		this.pendingUnlock[name] = () => {
			this.scene.sound.off(Phaser.Sound.Events.UNLOCKED, onUnlocked);
			this.pendingUnlock[name] = undefined;
		};
	}

	/** 心跳在 `play` 時帶音量：Phaser 的 play 會把音量重設回 add 當下的設定，先 setVolume 沒用。 */
	private startLoop(name: LoopName, sound: Phaser.Sound.BaseSound): void {
		if (name === "heartbeat") {
			sound.play({ volume: this.heartbeat.volume });
			return;
		}
		sound.play();
	}

	private cancelPendingUnlock(name: LoopName): void {
		this.pendingUnlock[name]?.();
	}
}

/**
 * 訂閱 EventBus 的 `sfx:play` 與 `audio:heartbeat`，轉給 manager。
 *
 * 回傳取消訂閱函式，場景關閉時要呼叫（Station 在 SHUTDOWN 與 DESTROY 都會清）。
 */
export function attachAudioEvents(_scene: Phaser.Scene, manager: AudioManager): () => void {
	const unsubscribers = [
		onGameEvent("sfx:play", ({ sound }) => {
			manager.play(sound);
		}),
		onGameEvent("audio:heartbeat", ({ active, intensity }) => {
			manager.setHeartbeat(active, intensity);
		}),
	];
	return () => {
		for (const unsubscribe of unsubscribers) {
			unsubscribe();
		}
	};
}
