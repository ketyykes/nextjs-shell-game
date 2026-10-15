// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 隨網站散佈的授權全文（設計文件 4.20、審計 A53）：public/licenses 底下的檔案跟原始授權檔要一字不差，
 * 改了原檔（例如換新版字型）沒同步這裡就會紅。
 */

function read(relativePath: string): string {
	return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("public/licenses", () => {
	it("Fusion Pixel 的授權檔跟字型旁邊那份一樣", () => {
		expect(read("public/licenses/LICENSE-fusion-pixel.txt")).toBe(read("src/app/fonts/LICENSE-fusion-pixel.txt"));
	});

	it("Kenney 的授權檔跟音效旁邊那份一樣", () => {
		expect(read("public/licenses/LICENSE-kenney.txt")).toBe(read("public/audio/LICENSE-kenney.txt"));
	});

	it("OFL 1.1 是標準全文：從版本標頭到免責聲明，跟 Fusion Pixel 授權檔附的那份逐字相同", () => {
		const ofl = read("public/licenses/OFL-1.1.txt");
		expect(ofl.startsWith("-----------------------------------------------------------\nSIL OPEN FONT LICENSE Version 1.1 - 26 February 2007\n")).toBe(true);
		expect(ofl).toContain("PERMISSION & CONDITIONS");
		expect(ofl.trimEnd().endsWith("OTHER DEALINGS IN THE FONT SOFTWARE.")).toBe(true);
		expect(read("src/app/fonts/LICENSE-fusion-pixel.txt").endsWith(ofl)).toBe(true);
	});
});
