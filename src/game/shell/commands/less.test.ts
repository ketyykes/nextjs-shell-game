// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fsError, noInput, unknownOption } from "../messages";
import { lessCommand } from "./less";
import { createFilterContext, DOOR_EVENTS_LINES, NOVA_CORE_LINES } from "./filterFixtures";

describe("less 分頁請求", () => {
	it("指令名稱是 less", () => {
		expect(lessCommand.name).toBe("less");
	});

	it("一個檔案：要求分頁，lines 是不在終端機時的輸出（等同 cat）", () => {
		const result = lessCommand.run(["door_events.log"], createFilterContext());

		expect(result).toEqual({
			ok: true,
			lines: DOOR_EVENTS_LINES,
			pager: {
				request: { files: [{ name: "door_events.log", lines: DOOR_EVENTS_LINES }], lineNumbers: false },
				lines: [],
			},
		});
	});

	it("多個檔案依序放進同一個請求", () => {
		const result = lessCommand.run(["door_events.log", "nova_core.log"], createFilterContext());

		expect(result.pager?.request.files.map((file) => file.name)).toEqual(["door_events.log", "nova_core.log"]);
		expect(result.lines).toEqual([...DOOR_EVENTS_LINES, ...NOVA_CORE_LINES]);
	});

	it("沒給檔名時翻管線輸入，名稱是 null", () => {
		const result = lessCommand.run([], createFilterContext({ stdin: ["a", "b"] }));

		expect(result).toEqual({
			ok: true,
			lines: ["a", "b"],
			pager: { request: { files: [{ name: null, lines: ["a", "b"] }], lineNumbers: false }, lines: [] },
		});
	});

	it("-N 要求顯示行號", () => {
		const result = lessCommand.run(["-N", "nova_core.log"], createFilterContext());

		expect(result.pager?.request.lineNumbers).toBe(true);
		expect(result.lines).toEqual(NOVA_CORE_LINES);
	});

	it("空檔案也照樣分頁", () => {
		const result = lessCommand.run(["empty.log"], createFilterContext());

		expect(result.pager?.request.files).toEqual([{ name: "empty.log", lines: [] }]);
	});
});

describe("less 錯誤", () => {
	it("沒給檔名也不在管線裡時提示要給輸入", () => {
		expect(lessCommand.run([], createFilterContext())).toEqual({
			ok: false,
			lines: noInput("less", "less door_events.log"),
		});
	});

	it("全部讀不到時不分頁", () => {
		expect(lessCommand.run(["nope.log", "archive"], createFilterContext())).toEqual({
			ok: false,
			lines: [...fsError("ENOENT", "nope.log"), ...fsError("EISDIR", "archive")],
		});
	});

	it("有的讀得到時照樣分頁，讀不到的錯誤訊息印在輸出區，整體算失敗", () => {
		const result = lessCommand.run(["nope.log", "nova_core.log"], createFilterContext());

		expect(result).toEqual({
			ok: false,
			lines: [...fsError("ENOENT", "nope.log"), ...NOVA_CORE_LINES],
			pager: {
				request: { files: [{ name: "nova_core.log", lines: NOVA_CORE_LINES }], lineNumbers: false },
				lines: fsError("ENOENT", "nope.log"),
			},
		});
	});

	it("不認得的選項", () => {
		expect(lessCommand.run(["-S", "nova_core.log"], createFilterContext())).toEqual({
			ok: false,
			lines: unknownOption("less", "-S"),
		});
	});
});
