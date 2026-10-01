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

const { AUDIO_KEYS, AUDIO_PATHS, AudioManager, attachAudioEvents } = await import("./audio");

const ALL_SFX: SfxName[] = ["ambient", "key", "door", "power", "nova-blip"];
const PUBLIC_DIR = path.resolve(__dirname, "../../../public");

describe("音效資料", () => {
	it.each(ALL_SFX)("%s 有 key 與至少一個路徑", (name) => {
		expect(AUDIO_KEYS[name]).toBeTruthy();
		expect(AUDIO_PATHS[name].length).toBeGreaterThan(0);
	});

	it("五個 key 不重複", () => {
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

/** 模仿 Phaser BaseSound：destroy 後 currentConfig 變 null，再 play 就會像真的 Phaser 一樣炸。 */
class FakeSound {
	isPlaying = false;
	private currentConfig: { seek: number } | null = { seek: 0 };
	private listeners = new Map<string, Listener[]>();
	readonly play = vi.fn(() => {
		if (this.currentConfig === null) {
			throw new TypeError("Cannot set properties of null (setting 'seek')");
		}
		this.currentConfig.seek = 0;
		this.isPlaying = true;
		return true;
	});
	readonly stop = vi.fn(() => {
		this.isPlaying = false;
		return true;
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
		add: (key: string) => FakeSound;
		once: (event: string, listener: Listener) => void;
		off: (event: string, listener: Listener) => void;
		/** 模仿 game.destroy 時 SoundManager.destroy → removeAll。 */
		destroyAll: () => void;
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
			add: (key) => {
				const sound = new FakeSound();
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

	it("建立時依 AUDIO_KEYS 建五個 sound，並套用音量與靜音", () => {
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
