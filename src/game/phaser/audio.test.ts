// @vitest-environment node
/**
 * 音效測試：Phaser 無法在 jsdom 跑，所以資料部分只驗 key、路徑與檔案是否齊全，
 * AudioManager 的行為用假的 scene 與 sound 驗。
 */

import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emitGameEvent } from "./EventBus";
import type { SfxName } from "./events";

/** 假 Phaser 的事件名，跟真的一樣是字串就好。 */
const SOUND_EVENTS = { UNLOCKED: "unlocked", DESTROY: "destroy" } as const;

// audio.ts 會 import Phaser，Phaser 4 載入時讀 window，node 環境下改用 mock 擋掉
vi.mock("phaser", () => ({ default: { Sound: { Events: SOUND_EVENTS } } }));

const {
	AUDIO_KEYS,
	AUDIO_PATHS,
	AudioManager,
	attachAudioEvents,
	HEARTBEAT_VOLUME_MAX,
	HEARTBEAT_VOLUME_MIN,
	heartbeatVolume,
	WHISPER_VOLUME,
} = await import("./audio");

/** 第一版五種（4.10）加第二批兩種（4.25）。 */
const ALL_SFX: SfxName[] = ["ambient", "key", "door", "power", "nova-blip", "heartbeat", "whisper"];
const PUBLIC_DIR = path.resolve(__dirname, "../../../public");

describe("音效資料", () => {
	it.each(ALL_SFX)("%s 有 key 與至少一個路徑", (name) => {
		expect(AUDIO_KEYS[name]).toBeTruthy();
		expect(AUDIO_PATHS[name].length).toBeGreaterThan(0);
	});

	it("AUDIO_KEYS 剛好是這七種，沒有漏掉也沒有多", () => {
		expect(Object.keys(AUDIO_KEYS).sort()).toEqual([...ALL_SFX].sort());
	});

	it("附有自產音效（心跳、低語）的 CC0 授權聲明", () => {
		const licensePath = path.join(PUBLIC_DIR, "audio", "LICENSE-synth.txt");
		expect(fs.existsSync(licensePath)).toBe(true);
		const license = fs.readFileSync(licensePath, "utf8");
		expect(license).toContain("CC0");
		expect(license).toContain("heartbeat");
		expect(license).toContain("whisper");
	});

	it("每個 key 不重複", () => {
		const keys = ALL_SFX.map((name) => AUDIO_KEYS[name]);
		expect(new Set(keys).size).toBe(ALL_SFX.length);
	});

	it.each(ALL_SFX)("%s 的每個路徑都對應 public/ 下真實存在的檔案", (name) => {
		for (const audioPath of AUDIO_PATHS[name]) {
			expect(audioPath.startsWith("/audio/")).toBe(true);
			expect(fs.existsSync(path.join(PUBLIC_DIR, audioPath))).toBe(true);
		}
	});

	it("每種音效都有 ogg 與 mp3 兩種格式", () => {
		for (const name of ALL_SFX) {
			const extensions = AUDIO_PATHS[name].map((audioPath) => path.extname(audioPath));
			expect(extensions).toContain(".ogg");
			expect(extensions).toContain(".mp3");
		}
	});

	it("附有 Kenney 的 CC0 授權聲明", () => {
		const licensePath = path.join(PUBLIC_DIR, "audio", "LICENSE-kenney.txt");
		expect(fs.existsSync(licensePath)).toBe(true);
		expect(fs.readFileSync(licensePath, "utf8")).toContain("CC0");
	});
});

// ---- AudioManager 行為 ----

type Listener = () => void;

interface FakeSoundConfig {
	loop?: boolean;
	volume?: number;
}

/**
 * 模仿 Phaser BaseSound：destroy 後 currentConfig 變 null，再 play 就會像真的 Phaser 一樣炸。
 * 跟真的一樣，play 時音量回到 add 當下的設定再套 play 給的設定（所以要改音量得在 play 帶，或 play 之後 setVolume）。
 */
class FakeSound {
	isPlaying = false;
	volume: number;
	readonly config: FakeSoundConfig;
	private currentConfig: { seek: number } | null = { seek: 0 };
	private listeners = new Map<string, Listener[]>();
	constructor(config: FakeSoundConfig = {}) {
		this.config = config;
		this.volume = config.volume ?? 1;
	}
	readonly play = vi.fn((config?: FakeSoundConfig) => {
		if (this.currentConfig === null) {
			throw new TypeError("Cannot set properties of null (setting 'seek')");
		}
		this.currentConfig.seek = 0;
		this.volume = config?.volume ?? this.config.volume ?? 1;
		this.isPlaying = true;
		return true;
	});
	readonly stop = vi.fn(() => {
		this.isPlaying = false;
		return true;
	});
	readonly setVolume = vi.fn((volume: number) => {
		if (this.currentConfig === null) {
			throw new TypeError("Cannot set properties of null (setting 'volume')");
		}
		this.volume = volume;
		return this;
	});
	once(event: string, listener: Listener): this {
		const list = this.listeners.get(event) ?? [];
		list.push(listener);
		this.listeners.set(event, list);
		return this;
	}
	/** 模仿 SoundManager.removeAll 走到的 BaseSound.destroy：發 DESTROY 再把設定清掉。 */
	destroy(): void {
		this.stop();
		const list = this.listeners.get(SOUND_EVENTS.DESTROY) ?? [];
		this.listeners.delete(SOUND_EVENTS.DESTROY);
		for (const listener of list) {
			listener();
		}
		this.currentConfig = null;
	}
}

interface FakeScene {
	cache: { audio: { exists: (key: string) => boolean } };
	sound: {
		locked: boolean;
		volume: number;
		mute: boolean;
		add: (key: string, config?: FakeSoundConfig) => FakeSound;
		once: (event: string, listener: Listener) => void;
		off: (event: string, listener: Listener) => void;
		/** 模仿 game.destroy 時 SoundManager.destroy → removeAll。 */
		destroyAll: () => void;
		/** 模仿使用者第一次互動後瀏覽器解鎖音訊：發 UNLOCKED。 */
		unlock: () => void;
	};
}

function createFakeScene(options: { locked?: boolean; missing?: string[] } = {}): {
	scene: FakeScene;
	sounds: Map<string, FakeSound>;
} {
	const sounds = new Map<string, FakeSound>();
	const unlockListeners: Listener[] = [];
	const missing = new Set(options.missing ?? []);
	const scene: FakeScene = {
		cache: { audio: { exists: (key) => !missing.has(key) } },
		sound: {
			locked: options.locked ?? false,
			volume: 1,
			mute: false,
			add: (key, config) => {
				const sound = new FakeSound(config);
				sounds.set(key, sound);
				return sound;
			},
			once: (_event, listener) => {
				unlockListeners.push(listener);
			},
			off: (_event, listener) => {
				const index = unlockListeners.indexOf(listener);
				if (index >= 0) {
					unlockListeners.splice(index, 1);
				}
			},
			destroyAll: () => {
				for (const sound of sounds.values()) {
					sound.destroy();
				}
			},
			unlock: () => {
				scene.sound.locked = false;
				const listeners = unlockListeners.splice(0, unlockListeners.length);
				for (const listener of listeners) {
					listener();
				}
			},
		},
	};
	return { scene, sounds };
}

/** AudioManager 只用到 scene 的 cache 與 sound，這裡用假物件代替 Phaser.Scene。 */
function createManager(options: { locked?: boolean; missing?: string[] } = {}) {
	const { scene, sounds } = createFakeScene(options);
	const manager = new AudioManager(scene as never, { volume: 0.5, muted: false });
	return { manager, scene, sounds };
}

describe("AudioManager", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("建立時依 AUDIO_KEYS 每種建一個 sound，並套用音量與靜音", () => {
		const { scene, sounds } = createManager();
		expect([...sounds.keys()].sort()).toEqual(Object.values(AUDIO_KEYS).sort());
		expect(scene.sound.volume).toBe(0.5);
		expect(scene.sound.mute).toBe(false);
	});

	it("play 會播對應的 sound", () => {
		const { manager, sounds } = createManager();
		manager.play("key");
		expect(sounds.get(AUDIO_KEYS.key)?.play).toHaveBeenCalledTimes(1);
	});

	it("瀏覽器還沒解鎖時一般音效直接略過", () => {
		const { manager, sounds } = createManager({ locked: true });
		manager.play("door");
		expect(sounds.get(AUDIO_KEYS.door)?.play).not.toHaveBeenCalled();
	});

	it("cache 裡沒有的音效印 warn 並略過，不會炸", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { manager, sounds } = createManager({ missing: [AUDIO_KEYS.power] });
		expect(sounds.has(AUDIO_KEYS.power)).toBe(false);
		expect(() => manager.play("power")).not.toThrow();
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it("destroy 後 play 不再碰任何 sound", () => {
		const { manager, sounds } = createManager();
		manager.destroy();
		manager.play("key");
		expect(sounds.get(AUDIO_KEYS.key)?.play).not.toHaveBeenCalled();
	});

	it("SoundManager 先把 sound 全部銷毀（game.destroy）後，再 play 不會炸", () => {
		// 重現 Fast Refresh / 換頁重建遊戲時的順序：sound 先被 Phaser 銷毀，AudioManager 之後才收到 sfx:play
		const { manager, scene, sounds } = createManager();
		scene.sound.destroyAll();
		expect(() => manager.play("key")).not.toThrow();
		expect(() => manager.play("ambient")).not.toThrow();
		expect(sounds.get(AUDIO_KEYS.key)?.play).not.toHaveBeenCalled();
	});

	it("attachAudioEvents 把 sfx:play 轉給 manager，取消訂閱後不再轉", () => {
		const { manager, sounds } = createManager();
		const detach = attachAudioEvents(undefined as never, manager);
		emitGameEvent("sfx:play", { sound: "nova-blip" });
		expect(sounds.get(AUDIO_KEYS["nova-blip"])?.play).toHaveBeenCalledTimes(1);
		detach();
		emitGameEvent("sfx:play", { sound: "nova-blip" });
		expect(sounds.get(AUDIO_KEYS["nova-blip"])?.play).toHaveBeenCalledTimes(1);
	});
});

describe("heartbeatVolume（心跳強度換算成音量）", () => {
	it("強度 0 是最小音量、1 是最大音量，越強越大聲", () => {
		expect(heartbeatVolume(0)).toBeCloseTo(HEARTBEAT_VOLUME_MIN);
		expect(heartbeatVolume(1)).toBeCloseTo(HEARTBEAT_VOLUME_MAX);
		expect(heartbeatVolume(0.5)).toBeGreaterThan(heartbeatVolume(0.2));
		expect(HEARTBEAT_VOLUME_MIN).toBeGreaterThan(0);
		expect(HEARTBEAT_VOLUME_MAX).toBeLessThanOrEqual(1);
	});

	it("超出 0 到 1 的強度夾住", () => {
		expect(heartbeatVolume(-1)).toBeCloseTo(HEARTBEAT_VOLUME_MIN);
		expect(heartbeatVolume(5)).toBeCloseTo(HEARTBEAT_VOLUME_MAX);
	});
});

describe("AudioManager 的心跳與低語（4.25）", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function heartbeatOf(sounds: Map<string, FakeSound>): FakeSound {
		const sound = sounds.get(AUDIO_KEYS.heartbeat);
		if (sound === undefined) {
			throw new Error("沒有建心跳的 sound");
		}
		return sound;
	}

	it("心跳是循環音效", () => {
		const { sounds } = createManager();
		expect(heartbeatOf(sounds).config.loop).toBe(true);
	});

	it("開始時以強度換算的音量循環播放；只改每個 sound 自己的音量，全域音量與靜音交給 SoundManager", () => {
		const { manager, scene, sounds } = createManager();
		manager.setHeartbeat(true, 0.5);
		const heartbeat = heartbeatOf(sounds);
		expect(heartbeat.play).toHaveBeenCalledTimes(1);
		expect(heartbeat.volume).toBeCloseTo(heartbeatVolume(0.5));
		expect(scene.sound.volume).toBe(0.5);
	});

	it("播放中強度變了只調音量，不重頭播", () => {
		const { manager, sounds } = createManager();
		manager.setHeartbeat(true, 0);
		manager.setHeartbeat(true, 1);
		const heartbeat = heartbeatOf(sounds);
		expect(heartbeat.play).toHaveBeenCalledTimes(1);
		expect(heartbeat.volume).toBeCloseTo(heartbeatVolume(1));
	});

	it("關掉就停，再開又從頭播", () => {
		const { manager, sounds } = createManager();
		manager.setHeartbeat(true, 0.2);
		manager.setHeartbeat(false, 0);
		const heartbeat = heartbeatOf(sounds);
		expect(heartbeat.stop).toHaveBeenCalled();
		expect(heartbeat.isPlaying).toBe(false);
		manager.setHeartbeat(true, 0.2);
		expect(heartbeat.play).toHaveBeenCalledTimes(2);
	});

	it("瀏覽器還沒解鎖時等解鎖才播；解鎖前已經回到 20% 以上就不播", () => {
		const first = createManager({ locked: true });
		first.manager.setHeartbeat(true, 0.3);
		expect(heartbeatOf(first.sounds).play).not.toHaveBeenCalled();
		first.scene.sound.unlock();
		expect(heartbeatOf(first.sounds).play).toHaveBeenCalledTimes(1);
		expect(heartbeatOf(first.sounds).volume).toBeCloseTo(heartbeatVolume(0.3));

		const second = createManager({ locked: true });
		second.manager.setHeartbeat(true, 0.3);
		second.manager.setHeartbeat(false, 0);
		second.scene.sound.unlock();
		expect(heartbeatOf(second.sounds).play).not.toHaveBeenCalled();
	});

	it("等解鎖時強度又變了，解鎖後用最新的音量", () => {
		const { manager, scene, sounds } = createManager({ locked: true });
		manager.setHeartbeat(true, 0);
		manager.setHeartbeat(true, 1);
		scene.sound.unlock();
		expect(heartbeatOf(sounds).play).toHaveBeenCalledTimes(1);
		expect(heartbeatOf(sounds).volume).toBeCloseTo(heartbeatVolume(1));
	});

	it("等解鎖的環境音與心跳互不干擾，解鎖後兩個都播", () => {
		const { manager, scene, sounds } = createManager({ locked: true });
		manager.play("ambient");
		manager.setHeartbeat(true, 0.5);
		scene.sound.unlock();
		expect(sounds.get(AUDIO_KEYS.ambient)?.play).toHaveBeenCalledTimes(1);
		expect(heartbeatOf(sounds).play).toHaveBeenCalledTimes(1);
	});

	it("sfx:play 不能播心跳（只走 audio:heartbeat，免得疊兩層循環）", () => {
		const { manager, sounds } = createManager();
		manager.play("heartbeat");
		expect(heartbeatOf(sounds).play).not.toHaveBeenCalled();
	});

	it("destroy（回標題、換章）後心跳停掉，之後的 setHeartbeat 不再碰 sound", () => {
		const { manager, sounds } = createManager();
		manager.setHeartbeat(true, 0.5);
		manager.destroy();
		const heartbeat = heartbeatOf(sounds);
		expect(heartbeat.isPlaying).toBe(false);
		manager.setHeartbeat(true, 1);
		expect(heartbeat.play).toHaveBeenCalledTimes(1);
	});

	it("destroy 時取消還在等解鎖的心跳", () => {
		const { manager, scene, sounds } = createManager({ locked: true });
		manager.setHeartbeat(true, 0.5);
		manager.destroy();
		scene.sound.unlock();
		expect(heartbeatOf(sounds).play).not.toHaveBeenCalled();
	});

	it("SoundManager 先把 sound 全部銷毀後，setHeartbeat 不會炸", () => {
		const { manager, scene } = createManager();
		manager.setHeartbeat(true, 0.5);
		scene.sound.destroyAll();
		expect(() => manager.setHeartbeat(true, 1)).not.toThrow();
		expect(() => manager.setHeartbeat(false, 0)).not.toThrow();
	});

	it("低語用 sfx:play 播一次，音量壓得很低", () => {
		const { manager, sounds } = createManager();
		manager.play("whisper");
		const whisper = sounds.get(AUDIO_KEYS.whisper);
		expect(whisper?.play).toHaveBeenCalledTimes(1);
		expect(whisper?.config.volume).toBe(WHISPER_VOLUME);
		expect(WHISPER_VOLUME).toBeLessThan(0.5);
	});

	it("attachAudioEvents 把 audio:heartbeat 轉給 manager，取消訂閱後不再轉", () => {
		const { manager, sounds } = createManager();
		const detach = attachAudioEvents(undefined as never, manager);
		emitGameEvent("audio:heartbeat", { active: true, intensity: 0.4 });
		const heartbeat = heartbeatOf(sounds);
		expect(heartbeat.play).toHaveBeenCalledTimes(1);
		expect(heartbeat.volume).toBeCloseTo(heartbeatVolume(0.4));
		detach();
		emitGameEvent("audio:heartbeat", { active: false, intensity: 0 });
		expect(heartbeat.isPlaying).toBe(true);
	});
});
