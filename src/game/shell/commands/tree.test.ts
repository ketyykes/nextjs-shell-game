// @vitest-environment node
import { describe, expect, it } from "vitest";
import { VirtualFileSystem } from "../fs";
import { fsError, invalidTreeLevel, missingOperand, treeUnreadableMark, unknownOption } from "../messages";
import type { FsSnapshot } from "../types";
import { treeCommand } from "./tree";
import { createFilterContext } from "./filterFixtures";

/** 讀不到的目錄與空目錄，獨立一份快照避免影響其他測試的完整輸出。 */
const SEALED_SNAPSHOT: FsSnapshot = {
	deck5: {
		"bridge.log": "ok\n",
		empty: {},
		vault: { $type: "dir", mode: "---------", children: { "secret.txt": "x\n" } },
	},
};

function createSealedContext() {
	return createFilterContext({ cwd: "/deck5", fs: VirtualFileSystem.fromSnapshot(SEALED_SNAPSHOT) });
}

describe("tree 基本輸出", () => {
	it("指令名稱是 tree", () => {
		expect(treeCommand.name).toBe("tree");
	});

	it("不給路徑時從目前目錄畫起，根是 .，目錄結尾加 /，隱藏檔不列，結尾是統計", () => {
		const result = treeCommand.run([], createFilterContext());

		expect(result).toEqual({
			ok: true,
			lines: [
				".",
				"├── archive/",
				"│   └── old.log",
				"├── door_events.log",
				"├── empty.log",
				"├── evac_2028-06-02.log",
				"└── nova_core.log",
				"",
				"2 directories, 5 files",
			],
		});
	});

	it("給路徑時根照玩家打的字顯示，子目錄用 └── 收尾、縮排用空白", () => {
		const result = treeCommand.run(["/deck2"], createFilterContext());

		expect(result.lines).toEqual([
			"/deck2",
			"├── logs/",
			"│   ├── archive/",
			"│   │   └── old.log",
			"│   ├── door_events.log",
			"│   ├── empty.log",
			"│   ├── evac_2028-06-02.log",
			"│   └── nova_core.log",
			"└── readme.txt",
			"",
			"3 directories, 6 files",
		]);
	});

	it("只有一個目錄或一個檔案時用單數", () => {
		const result = treeCommand.run(["archive"], createFilterContext());

		expect(result.lines).toEqual(["archive", "└── old.log", "", "1 directory, 1 file"]);
	});

	it("空目錄當根時不算進目錄數（照 tree 2.x）", () => {
		const result = treeCommand.run(["empty"], createSealedContext());

		expect(result).toEqual({ ok: true, lines: ["empty", "", "0 directories, 0 files"] });
	});

	it("路徑是檔案時只印檔名並算一個檔案", () => {
		const result = treeCommand.run(["nova_core.log"], createFilterContext());

		expect(result).toEqual({ ok: true, lines: ["nova_core.log", "", "0 directories, 1 file"] });
	});

	it("多個路徑依序畫，統計加總在最後", () => {
		const result = treeCommand.run(["archive", "nova_core.log"], createFilterContext());

		expect(result.lines).toEqual(["archive", "└── old.log", "nova_core.log", "", "1 directory, 2 files"]);
	});
});

describe("tree 選項", () => {
	it("-a 連隱藏檔一起列", () => {
		const result = treeCommand.run(["-a", "archive"], createFilterContext());

		expect(result.lines).toEqual(["archive", "├── .purged.log", "└── old.log", "", "1 directory, 2 files"]);
	});

	it("-d 只列目錄，統計只有目錄數", () => {
		const result = treeCommand.run(["-d", "/deck2"], createFilterContext());

		expect(result.lines).toEqual(["/deck2", "└── logs/", "    └── archive/", "", "3 directories"]);
	});

	it("-L 1 只往下畫一層，第一層的目錄照樣算進統計", () => {
		const result = treeCommand.run(["-L", "1", "/deck2"], createFilterContext());

		expect(result.lines).toEqual(["/deck2", "├── logs/", "└── readme.txt", "", "2 directories, 1 file"]);
	});

	it("-L2 黏在一起也可以，選項可以放在路徑後面、可以合併成 -ad", () => {
		const glued = treeCommand.run(["/deck2", "-L2"], createFilterContext());
		const combined = treeCommand.run(["-ad", "/deck2"], createFilterContext());

		expect(glued.lines.slice(0, 3)).toEqual(["/deck2", "├── logs/", "│   ├── archive/"]);
		expect(glued.lines).toContain("│   └── nova_core.log");
		expect(glued.lines).not.toContain("│   │   └── old.log");
		expect(combined.lines).toEqual(["/deck2", "└── logs/", "    └── archive/", "", "3 directories"]);
	});

	it("-L 後面不是正整數時報錯", () => {
		expect(treeCommand.run(["-L", "0"], createFilterContext())).toEqual({ ok: false, lines: invalidTreeLevel("0") });
		expect(treeCommand.run(["-L", "abc"], createFilterContext())).toEqual({
			ok: false,
			lines: invalidTreeLevel("abc"),
		});
	});

	it("-L 後面沒有東西時提示要接層數", () => {
		const result = treeCommand.run(["-L"], createFilterContext());

		expect(result).toEqual({ ok: false, lines: missingOperand("tree", "在 -L 後面接要往下畫幾層，例如 tree -L 2") });
	});

	it("不認得的選項報錯", () => {
		expect(treeCommand.run(["-z"], createFilterContext())).toEqual({ ok: false, lines: unknownOption("tree", "-z") });
		expect(treeCommand.run(["--all"], createFilterContext())).toEqual({
			ok: false,
			lines: unknownOption("tree", "--all"),
		});
	});
});

describe("tree 錯誤", () => {
	it("路徑不存在時印錯誤訊息，其他路徑照畫，整體算失敗", () => {
		const result = treeCommand.run(["nope", "archive"], createFilterContext());

		expect(result).toEqual({
			ok: false,
			lines: [...fsError("ENOENT", "nope"), "archive", "└── old.log", "", "1 directory, 1 file"],
		});
	});

	it("讀不到的子目錄照列但不往下畫，名稱後面標出沒有權限，整體算失敗", () => {
		const result = treeCommand.run([], createSealedContext());

		expect(result).toEqual({
			ok: false,
			lines: [
				".",
				"├── bridge.log",
				"├── empty/",
				`└── vault/  ${treeUnreadableMark()}`,
				"",
				"3 directories, 1 file",
			],
		});
	});
});

describe("tree 選項切分的邊界", () => {
	it("-L 可以接在合併旗標的最後，值放在下一個參數", () => {
		const result = treeCommand.run(["-dL", "1", "/deck2"], createFilterContext());

		expect(result.lines).toEqual(["/deck2", "└── logs/", "", "2 directories"]);
	});

	it("-L 後面黏著的字一律當層數，-La 的 a 不是選項", () => {
		expect(treeCommand.run(["-La"], createFilterContext())).toEqual({ ok: false, lines: invalidTreeLevel("a") });
	});

	it("-L 後面的參數一律當層數，即使它是 --", () => {
		expect(treeCommand.run(["-L", "--"], createFilterContext())).toEqual({ ok: false, lines: invalidTreeLevel("--") });
	});

	it("-- 之後的 -a 當成路徑", () => {
		const result = treeCommand.run(["--", "-a"], createFilterContext());

		expect(result.ok).toBe(false);
		expect(result.lines).toEqual(expect.arrayContaining(fsError("ENOENT", "-a")));
	});
});
