// @vitest-environment node
/**
 * Phaser 建置版本的守門測試（M12-3）：遊戲只用 arcade 物理，打包時要換成不含 Matter.js 的建置。
 *
 * 換版靠 `next.config.ts` 的 `turbopack.resolveAlias`，被測的是專案根目錄的設定檔，
 * 但 Vitest 只掃 `src/`，所以放在 Phaser 模組旁邊。Phaser 升版若改了 dist 檔名，這裡會先紅燈。
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

const PROJECT_ROOT = path.resolve(__dirname, "../../..");

/** 讀出 `phaser` 的別名目標，沒有設定時回傳 undefined。 */
function readPhaserAlias(): unknown {
	return nextConfig.turbopack?.resolveAlias?.phaser;
}

describe("Phaser 建置版本", () => {
	it("Turbopack 把 phaser 指到 node_modules 裡真實存在的 arcade 物理版", () => {
		const alias = readPhaserAlias();

		expect(typeof alias).toBe("string");
		const target = path.resolve(PROJECT_ROOT, alias as string);
		expect(target.startsWith(path.join(PROJECT_ROOT, "node_modules", "phaser", "dist"))).toBe(true);
		expect(path.basename(target)).toMatch(/^phaser-arcade-physics/);
		expect(fs.existsSync(target)).toBe(true);
	});

	it("別名指到的檔案不含 Matter.js，但有 Arcade 物理", () => {
		const alias = readPhaserAlias();
		expect(typeof alias).toBe("string");

		const source = fs.readFileSync(path.resolve(PROJECT_ROOT, alias as string), "utf8");
		expect(source).not.toContain("Matter");
		expect(source).toContain("ArcadePhysics");
	});
});
