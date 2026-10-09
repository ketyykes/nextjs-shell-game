#!/usr/bin/env node
/**
 * 把 codex 產的場景原圖（`docs/assets-draft/scenes/scene-*-original.png`，約 1672x941）
 * 縮成兩種尺寸：`public/scenes/scene-*.webp`（640x360，遊戲用，WebP 品質 85）與 `docs/assets-draft/scenes/scene-*.png`（256x144，預覽、進版控）。
 * 已經有輸出而且比原圖新的就跳過。
 *
 * 用法：
 *   node scripts/resize-scenes.mjs            # 全部
 *   node scripts/resize-scenes.mjs dc_entry   # 只處理 scene-dc_entry
 */

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/** @type {string} */
const ROOT = path.resolve(import.meta.dirname, "..");
/** @type {string} */
const DRAFT_DIR = path.join(ROOT, "docs", "assets-draft", "scenes");
/** @type {string} */
const PUBLIC_DIR = path.join(ROOT, "public", "scenes");

/** @type {{ dir: string, width: number, height: number, format: "webp" | "png" }[]} */
const OUTPUTS = [
	{ dir: PUBLIC_DIR, width: 640, height: 360, format: "webp" },
	{ dir: DRAFT_DIR, width: 256, height: 144, format: "png" },
];

/** @type {(source: string, target: string) => Promise<boolean>} */
const isUpToDate = async (source, target) => {
	try {
		const [sourceStat, targetStat] = await Promise.all([fs.stat(source), fs.stat(target)]);
		return targetStat.mtimeMs >= sourceStat.mtimeMs;
	} catch {
		return false;
	}
};

/** @type {(name: string) => Promise<void>} */
const resizeScene = async (name) => {
	const source = path.join(DRAFT_DIR, `scene-${name}-original.png`);
	for (const output of OUTPUTS) {
		const target = path.join(output.dir, `scene-${name}.${output.format}`);
		if (await isUpToDate(source, target)) {
			continue;
		}
		const resized = sharp(source).resize({ width: output.width, height: output.height, fit: "cover", kernel: "lanczos3" });
		// 遊戲用的走 WebP 省流量（8 MB 降到約 2.7 MB），預覽圖維持 PNG 方便在 GitHub 與編輯器直接看
		if (output.format === "webp") {
			await resized.webp({ quality: 85, effort: 6 }).toFile(target);
		} else {
			await resized.png().toFile(target);
		}
		console.log(`${path.relative(ROOT, target)} ← ${output.width}x${output.height}`);
	}
};

/** @type {() => Promise<void>} */
const main = async () => {
	const only = process.argv.slice(2);
	const entries = await fs.readdir(DRAFT_DIR);
	/** @type {string[]} */
	const names = entries
		.filter((entry) => /^scene-.+-original\.png$/.test(entry))
		.map((entry) => entry.replace(/^scene-/, "").replace(/-original\.png$/, ""))
		.filter((name) => only.length === 0 || only.includes(name));
	for (const name of names) {
		await resizeScene(name);
	}
	console.log(`處理 ${names.length} 張場景圖`);
};

await main();
