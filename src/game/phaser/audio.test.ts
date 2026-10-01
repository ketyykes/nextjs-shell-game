// @vitest-environment node
/**
 * 音效資料測試：Phaser 無法在 jsdom 跑，所以只驗 key、路徑與檔案是否齊全。
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SfxName } from "./events";

// audio.ts 會 import Phaser，Phaser 4 載入時讀 window，node 環境下改用 mock 擋掉
vi.mock("phaser", () => ({ default: {} }));

const { AUDIO_KEYS, AUDIO_PATHS } = await import("./audio");

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
