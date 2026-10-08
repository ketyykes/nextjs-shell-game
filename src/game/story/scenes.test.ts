// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DECK_ROOMS } from "@/game/phaser/events";
import {
	AVAILABLE_SCENES,
	chapterSceneImages,
	endingImage,
	INTRO_SCENE_IMAGE,
	openingSceneImages,
	outroImageForChapter,
	sceneImageForRoom,
} from "./scenes";

const SCENES_DIR = path.resolve(process.cwd(), "public/scenes");

describe("場景插圖", () => {
	it("AVAILABLE_SCENES 列的每張圖都真的在 public/scenes 裡", () => {
		for (const name of AVAILABLE_SCENES) {
			expect(fs.existsSync(path.join(SCENES_DIR, `scene-${name}.png`)), name).toBe(true);
		}
	});

	it("public/scenes 裡的每張場景圖都有列進 AVAILABLE_SCENES（沒列的話插圖卡不會顯示）", () => {
		const onDisk = fs
			.readdirSync(SCENES_DIR)
			.filter((file) => file.startsWith("scene-") && file.endsWith(".png"))
			.map((file) => file.slice("scene-".length, -".png".length));
		expect([...onDisk].sort()).toEqual([...AVAILABLE_SCENES].sort());
	});

	it("走廊沒有插圖，有圖的艙區回傳路徑", () => {
		expect(sceneImageForRoom("corridor")).toBeUndefined();
		expect(sceneImageForRoom("cryo")).toBe("/scenes/scene-cryo.png");
		for (const chapter of [1, 2, 3, 4, 5, 6]) {
			expect(sceneImageForRoom(DECK_ROOMS[chapter].corridor)).toBeUndefined();
		}
	});

	it("第一章結尾沿用 scene-outro，其他章用 scene-ch<n>_outro，沒產出的回 undefined", () => {
		expect(outroImageForChapter(1)).toBe("/scenes/scene-outro.png");
		const chapterTwo = outroImageForChapter(2);
		expect(chapterTwo === undefined || chapterTwo === "/scenes/scene-ch2_outro.png").toBe(true);
		const ending = endingImage();
		expect(ending === undefined || ending === "/scenes/scene-ending.png").toBe(true);
	});

	it("本章預載清單：依 T1 到 T6 的艙區順序，最後是結尾過場", () => {
		expect(chapterSceneImages(1)).toEqual([
			"/scenes/scene-cryo.png",
			"/scenes/scene-lifesupport.png",
			"/scenes/scene-quarters.png",
			"/scenes/scene-power.png",
			"/scenes/scene-medbay.png",
			"/scenes/scene-airlock.png",
			"/scenes/scene-outro.png",
		]);
		expect(chapterSceneImages(2)[0]).toBe("/scenes/scene-dc_entry.png");
		expect(chapterSceneImages(2).at(-1)).toBe("/scenes/scene-ch2_outro.png");
	});

	it("本章預載清單不含走廊、只列真的存在的圖", () => {
		for (const chapter of [1, 2, 3, 4, 5, 6]) {
			const images = chapterSceneImages(chapter);
			expect(images.length, `第 ${chapter} 章`).toBeGreaterThan(0);
			expect(images).not.toContain(`/scenes/scene-${DECK_ROOMS[chapter].corridor}.png`);
			for (const src of images) {
				const name = src.slice("/scenes/scene-".length, -".png".length);
				expect(AVAILABLE_SCENES.has(name), src).toBe(true);
			}
		}
	});

	it("從標題進第一章時先載開場插圖（boot log 一結束就要顯示），其他章跟本章清單一樣", () => {
		expect(openingSceneImages(1)).toEqual([INTRO_SCENE_IMAGE, ...chapterSceneImages(1)]);
		expect(openingSceneImages(3)).toEqual(chapterSceneImages(3));
	});
});
