// @vitest-environment node

import { describe, expect, it } from "vitest";
import { complete, longestCommonPrefix, splitDirAndPrefix } from "./completion";
import { VirtualFileSystem } from "./fs";
import type { CompletionContext } from "./types";

const COMMAND_NAMES = ["pwd", "ls", "cd", "cat", "help", "hint", "man", "history", "clear"];

/** 第一章的假檔案系統。 */
function createFs(): VirtualFileSystem {
	return VirtualFileSystem.fromSnapshot({
		home: {
			tech: {
				pod_01: {},
				pod_02: {},
				pod_03: {},
				pod_04: {},
				pod_05: {},
				pod_06: {},
				"wake_up.txt": "喚醒排程：三年後",
				".nova_cache": "cache",
			},
			abin: {
				"day_900.txt": "不要相信那個聲音。",
				"day_901.txt": "它在說謊。",
			},
		},
		deck1: {
			medbay: {
				records: {
					"PT-2028-0417-KX9931.txt": "病歷一",
					"PT-2028-0417-KX9932.txt": "病歷二",
					"PT-2029-1102-MM0006.txt": "病歷三",
				},
			},
			systems: {
				power: {
					breakers: {
						B3: {
							".override": "override",
						},
					},
				},
			},
		},
	});
}

function createContext(cwd = "/home/tech"): CompletionContext {
	return {
		cwd,
		home: "/home/tech",
		fs: createFs(),
		commandNames: COMMAND_NAMES,
	};
}

describe("splitDirAndPrefix", () => {
	it("沒有斜線時目錄部分是空字串", () => {
		expect(splitDirAndPrefix("wa")).toEqual({ dirPart: "", prefix: "wa" });
	});

	it("空字串拆成兩個空字串", () => {
		expect(splitDirAndPrefix("")).toEqual({ dirPart: "", prefix: "" });
	});

	it("以最後一個斜線為界，目錄部分保留結尾斜線", () => {
		expect(splitDirAndPrefix("/home/abin/da")).toEqual({ dirPart: "/home/abin/", prefix: "da" });
	});

	it("結尾是斜線時前綴為空字串", () => {
		expect(splitDirAndPrefix("~/")).toEqual({ dirPart: "~/", prefix: "" });
		expect(splitDirAndPrefix("/deck1/systems/")).toEqual({ dirPart: "/deck1/systems/", prefix: "" });
	});

	it("相對路徑與 .. 原樣保留", () => {
		expect(splitDirAndPrefix("../tech/wa")).toEqual({ dirPart: "../tech/", prefix: "wa" });
		expect(splitDirAndPrefix("/x")).toEqual({ dirPart: "/", prefix: "x" });
	});
});

describe("longestCommonPrefix", () => {
	it("空陣列回傳空字串", () => {
		expect(longestCommonPrefix([])).toBe("");
	});

	it("只有一個名稱時回傳它本身", () => {
		expect(longestCommonPrefix(["pwd"])).toBe("pwd");
	});

	it("算出多個名稱的共同前綴", () => {
		expect(longestCommonPrefix(["help", "hint", "history"])).toBe("h");
		expect(longestCommonPrefix(["pod_01", "pod_02"])).toBe("pod_0");
	});

	it("沒有共同前綴時回傳空字串", () => {
		expect(longestCommonPrefix(["cat", "ls"])).toBe("");
	});

	it("區分大小寫", () => {
		expect(longestCommonPrefix(["Abc", "abc"])).toBe("");
	});

	it("其中一個名稱是另一個的前綴時，共同前綴是較短的那個", () => {
		expect(longestCommonPrefix(["hint", "hints"])).toBe("hint");
	});
});

describe("complete：指令名補全", () => {
	it("空輸入列出全部指令名，completed 等於原輸入", () => {
		const result = complete("", createContext());

		expect(result.completed).toBe("");
		expect(result.candidates).toEqual([...COMMAND_NAMES].sort());
	});

	it("只有空白時也列出全部指令名，completed 等於原輸入", () => {
		const result = complete("   ", createContext());

		expect(result.completed).toBe("   ");
		expect(result.candidates).toHaveLength(COMMAND_NAMES.length);
	});

	it("唯一候選補完並加空格", () => {
		expect(complete("pw", createContext())).toEqual({ completed: "pwd ", candidates: ["pwd"] });
	});

	it("多個候選補到共同前綴，candidates 列出全部", () => {
		const result = complete("h", createContext());

		expect(result.completed).toBe("h");
		expect(result.candidates).toEqual(["help", "hint", "history"]);
	});

	it("c 有 cat、cd、clear 三個候選，共同前綴就是 c", () => {
		const result = complete("c", createContext());

		expect(result.completed).toBe("c");
		expect(result.candidates).toEqual(["cat", "cd", "clear"]);
	});

	it("共同前綴比輸入長時會往後補", () => {
		const result = complete("hi", createContext());

		expect(result).toEqual({ completed: "hi", candidates: ["hint", "history"] });
	});

	it("沒有符合的指令時原樣回傳", () => {
		expect(complete("xyz", createContext())).toEqual({ completed: "xyz", candidates: [] });
	});

	it("指令名前面有空白時保留空白", () => {
		expect(complete("  pw", createContext())).toEqual({ completed: "  pwd ", candidates: ["pwd"] });
	});

	it("指令名補全區分大小寫", () => {
		expect(complete("PW", createContext())).toEqual({ completed: "PW", candidates: [] });
	});
});

describe("complete：路徑補全（相對於 cwd）", () => {
	it("cd po 有六個 pod 目錄，補到共同前綴，candidates 都帶斜線", () => {
		const result = complete("cd po", createContext());

		expect(result.completed).toBe("cd pod_0");
		expect(result.candidates).toEqual(["pod_01/", "pod_02/", "pod_03/", "pod_04/", "pod_05/", "pod_06/"]);
	});

	it("cd pod_06 唯一候選是目錄，補斜線不加空格", () => {
		expect(complete("cd pod_06", createContext())).toEqual({
			completed: "cd pod_06/",
			candidates: ["pod_06/"],
		});
	});

	it("cat wa 唯一候選是檔案，補完並加空格", () => {
		expect(complete("cat wa", createContext())).toEqual({
			completed: "cat wake_up.txt ",
			candidates: ["wake_up.txt"],
		});
	});

	it("沒有符合的檔名時原樣回傳", () => {
		expect(complete("cat zzz", createContext())).toEqual({ completed: "cat zzz", candidates: [] });
	});

	it("ls 尾端空白列出 cwd 全部非隱藏項目，completed 不變", () => {
		const result = complete("ls ", createContext());

		expect(result.completed).toBe("ls ");
		expect(result.candidates).toEqual(["pod_01/", "pod_02/", "pod_03/", "pod_04/", "pod_05/", "pod_06/", "wake_up.txt"]);
	});

	it("ls . 才會列出隱藏檔", () => {
		expect(complete("ls .", createContext())).toEqual({
			completed: "ls .nova_cache ",
			candidates: [".nova_cache"],
		});
	});

	it("沒打 . 時不會補出隱藏檔", () => {
		const result = complete("cat nova", createContext());

		expect(result.candidates).toEqual([]);
	});

	it("路徑補全區分大小寫", () => {
		expect(complete("cat WA", createContext())).toEqual({ completed: "cat WA", candidates: [] });
	});

	it("多個 token 只補最後一個並保留前面", () => {
		expect(complete("cat wake_up.txt pod_0", createContext())).toEqual({
			completed: "cat wake_up.txt pod_0",
			candidates: ["pod_01/", "pod_02/", "pod_03/", "pod_04/", "pod_05/", "pod_06/"],
		});
		expect(complete("ls -l  wa", createContext()).completed).toBe("ls -l  wake_up.txt ");
	});

	it("第一個 token 是指令、第二個 token 才開始補路徑", () => {
		// 只有指令名加空白，不應該再補指令名
		const result = complete("cd ", createContext());

		expect(result.candidates).toContain("wake_up.txt");
		expect(result.candidates).not.toContain("pwd");
	});
});

describe("complete：路徑補全（帶目錄部分）", () => {
	it("~/ 展開成家目錄", () => {
		expect(complete("cat ~/wa", createContext())).toEqual({
			completed: "cat ~/wake_up.txt ",
			candidates: ["wake_up.txt"],
		});
	});

	it("絕對路徑", () => {
		expect(complete("cat /home/tech/wa", createContext())).toEqual({
			completed: "cat /home/tech/wake_up.txt ",
			candidates: ["wake_up.txt"],
		});
	});

	it("含 .. 的相對路徑", () => {
		expect(complete("cat ../tech/wa", createContext())).toEqual({
			completed: "cat ../tech/wake_up.txt ",
			candidates: ["wake_up.txt"],
		});
	});

	it("cat /home/abin/da 有多個候選，補到 day_9", () => {
		const result = complete("cat /home/abin/da", createContext());

		expect(result.completed).toBe("cat /home/abin/day_90");
		expect(result.candidates).toEqual(["day_900.txt", "day_901.txt"]);
	});

	it("cat /home/abin/day_900 唯一候選補完並加空格", () => {
		expect(complete("cat /home/abin/day_900", createContext()).completed).toBe("cat /home/abin/day_900.txt ");
	});

	it("病歷長檔名：PT-2028 補到 PT-2028-0417-KX993", () => {
		const result = complete("cat /deck1/medbay/records/PT-2028", createContext());

		expect(result.completed).toBe("cat /deck1/medbay/records/PT-2028-0417-KX993");
		expect(result.candidates).toEqual(["PT-2028-0417-KX9931.txt", "PT-2028-0417-KX9932.txt"]);
	});

	it("病歷長檔名：PT-2029 唯一補完", () => {
		expect(complete("cat /deck1/medbay/records/PT-2029", createContext())).toEqual({
			completed: "cat /deck1/medbay/records/PT-2029-1102-MM0006.txt ",
			candidates: ["PT-2029-1102-MM0006.txt"],
		});
	});

	it("目錄部分結尾是斜線、前綴為空時列出該目錄全部項目", () => {
		const result = complete("ls /deck1/medbay/records/", createContext());

		expect(result.completed).toBe("ls /deck1/medbay/records/PT-202");
		expect(result.candidates).toHaveLength(3);
	});

	it("逐層補全目錄：/deck1/sys → /deck1/systems/", () => {
		expect(complete("cd /deck1/sys", createContext())).toEqual({
			completed: "cd /deck1/systems/",
			candidates: ["systems/"],
		});
	});

	it("隱藏檔在目錄部分之後打了 . 才出現", () => {
		const path = "/deck1/systems/power/breakers/B3/";

		expect(complete(`cat ${path}`, createContext()).candidates).toEqual([]);
		expect(complete(`cat ${path}.`, createContext())).toEqual({
			completed: `cat ${path}.override `,
			candidates: [".override"],
		});
	});

	it("從其他 cwd 出發的相對路徑", () => {
		const context = createContext("/deck1");

		expect(complete("cd med", context)).toEqual({ completed: "cd medbay/", candidates: ["medbay/"] });
	});

	it("根目錄底下的補全", () => {
		expect(complete("cd /de", createContext())).toEqual({ completed: "cd /deck1/", candidates: ["deck1/"] });
	});
});

describe("complete：壞路徑不 throw", () => {
	it("目錄部分不存在時原樣回傳", () => {
		expect(complete("cd /nope/", createContext())).toEqual({ completed: "cd /nope/", candidates: [] });
		expect(complete("cd /nope/ab", createContext())).toEqual({ completed: "cd /nope/ab", candidates: [] });
	});

	it("目錄部分是檔案時原樣回傳", () => {
		expect(() => complete("cat wake_up.txt/", createContext())).not.toThrow();
		expect(complete("cat wake_up.txt/", createContext())).toEqual({
			completed: "cat wake_up.txt/",
			candidates: [],
		});
	});

	it("目錄部分經過檔案時原樣回傳", () => {
		expect(complete("cat wake_up.txt/x/y", createContext())).toEqual({
			completed: "cat wake_up.txt/x/y",
			candidates: [],
		});
	});
});

describe("管線與 man 後補指令名", () => {
	it("ps | gr 補成 grep：管線右邊的第一個 token 是指令", () => {
		const result = complete("ps | gr", { ...createContext(), commandNames: [...COMMAND_NAMES, "grep"] });

		expect(result.completed).toBe("ps | grep ");
		expect(result.candidates).toEqual(["grep"]);
	});

	it("管線後還沒打字時列出全部指令", () => {
		const result = complete("ps | ", createContext());

		expect(result.candidates).toEqual([...COMMAND_NAMES].sort((a, b) => a.localeCompare(b, "en")));
	});

	it("man 的參數補指令名，不補路徑", () => {
		const result = complete("man hi", createContext());

		expect(result.completed).toBe("man hi");
		expect(result.candidates).toEqual(["hint", "history"]);
	});

	it("help 的參數補指令名", () => {
		const result = complete("help pw", createContext());

		expect(result.completed).toBe("help pwd ");
		expect(result.candidates).toEqual(["pwd"]);
	});

	it("一般指令的第二個參數仍然補路徑", () => {
		const result = complete("cat wa", createContext());

		expect(result.completed).toBe("cat wake_up.txt ");
	});

	it("; 與 && 右邊的第一個 token 也是指令", () => {
		expect(complete("cd pod_01 ; pw", createContext()).completed).toBe("cd pod_01 ; pwd ");
		expect(complete("cd pod_01 && pw", createContext()).completed).toBe("cd pod_01 && pwd ");
	});

	it("; 後面的 man 參數補指令名", () => {
		const result = complete("ls ; man hi", createContext());

		expect(result.candidates).toEqual(["hint", "history"]);
	});

	it("; 後面那一段的第二個參數仍然補路徑", () => {
		expect(complete("pwd ; cat wa", createContext()).completed).toBe("pwd ; cat wake_up.txt ");
	});
});

describe("路徑裡的環境變數", () => {
	it("$POD_DIR/ 用 env 展開後列出該目錄的內容", () => {
		const context = { ...createContext(), env: { POD_DIR: "/deck1/medbay/records" } };
		const result = complete("cat $POD_DIR/PT-2028", context);

		// 回填時保留玩家輸入的 $POD_DIR 寫法，只有查目錄時展開
		expect(result.completed).toBe("cat $POD_DIR/PT-2028-0417-KX993");
		expect(result.candidates).toEqual(["PT-2028-0417-KX9931.txt", "PT-2028-0417-KX9932.txt"]);
	});

	it("沒定義的變數不展開，回原樣與空候選", () => {
		const context = { ...createContext(), env: {} };
		const result = complete("cat $NOPE/wa", context);

		expect(result.completed).toBe("cat $NOPE/wa");
		expect(result.candidates).toEqual([]);
	});
});
