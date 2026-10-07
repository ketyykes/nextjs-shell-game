// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 守護字型子集：`fonts.ts` 載的是 `pnpm font:subset` 切出的子集檔，
 * 劇本或 UI 新增了子集沒有的字時這裡會紅，提醒重跑 `pnpm font:subset`。
 */

const FONT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(FONT_DIR, "../..");

/** 遞迴收集 src 底下所有非測試 ts/tsx 檔。 */
function sourceFiles(dir: string): string[] {
	const result: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			result.push(...sourceFiles(full));
			continue;
		}
		if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) {
			result.push(full);
		}
	}
	return result;
}

describe("Fusion Pixel 子集", () => {
	it("子集檔與字元清單都存在", () => {
		expect(fs.existsSync(path.join(FONT_DIR, "fusion-pixel-12px-proportional-zh_hant.subset.woff2"))).toBe(true);
		expect(fs.existsSync(path.join(FONT_DIR, "subset-chars.txt"))).toBe(true);
	});

	it("src 用到的每個非 ASCII 字元都在子集裡（紅了就跑 pnpm font:subset）", () => {
		const subset = new Set(fs.readFileSync(path.join(FONT_DIR, "subset-chars.txt"), "utf8"));
		const missing = new Set<string>();

		for (const file of sourceFiles(SRC_DIR)) {
			for (const char of fs.readFileSync(file, "utf8")) {
				if (char.charCodeAt(0) > 0x7e && !subset.has(char)) {
					missing.add(char);
				}
			}
		}

		expect([...missing]).toEqual([]);
	});
});
