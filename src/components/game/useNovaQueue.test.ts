import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useNovaQueue } from "./useNovaQueue";

// vitest 未啟用 globals，需手動在每個測試後卸載
afterEach(cleanup);

describe("useNovaQueue", () => {
	it("初始佇列為空", () => {
		const { result } = renderHook(() => useNovaQueue());
		expect(result.current.queue).toEqual([]);
	});

	it("enqueue 兩句會產生兩則，id 為 prefix 加序號", () => {
		const { result } = renderHook(() => useNovaQueue());
		act(() => {
			result.current.enqueue("intro", ["第一句", "第二句"]);
		});
		expect(result.current.queue).toEqual([
			{ id: "intro-0", text: "第一句" },
			{ id: "intro-1", text: "第二句" },
		]);
	});

	it("同一個 prefix 再 enqueue 會被略過", () => {
		const { result } = renderHook(() => useNovaQueue());
		act(() => {
			result.current.enqueue("intro", ["第一句", "第二句"]);
		});
		act(() => {
			result.current.enqueue("intro", ["不該出現"]);
		});
		expect(result.current.queue).toHaveLength(2);
	});

	it("已顯示過（已被 dismiss 掉）的 prefix 也不會重新排入", () => {
		const { result } = renderHook(() => useNovaQueue());
		act(() => {
			result.current.enqueue("intro", ["只有一句"]);
		});
		act(() => {
			result.current.dismiss("intro-0");
		});
		act(() => {
			result.current.enqueue("intro", ["只有一句"]);
		});
		expect(result.current.queue).toEqual([]);
	});

	it("不同 prefix 會接在佇列後面", () => {
		const { result } = renderHook(() => useNovaQueue());
		act(() => {
			result.current.enqueue("a", ["甲"]);
			result.current.enqueue("b", ["乙"]);
		});
		expect(result.current.queue.map((message) => message.id)).toEqual(["a-0", "b-0"]);
	});

	it("空陣列不會佔用 prefix", () => {
		const { result } = renderHook(() => useNovaQueue());
		act(() => {
			result.current.enqueue("a", []);
		});
		act(() => {
			result.current.enqueue("a", ["之後才有內容"]);
		});
		expect(result.current.queue).toHaveLength(1);
	});

	it("dismiss 會移掉對應 id 的那則", () => {
		const { result } = renderHook(() => useNovaQueue());
		act(() => {
			result.current.enqueue("intro", ["第一句", "第二句"]);
		});
		act(() => {
			result.current.dismiss("intro-0");
		});
		expect(result.current.queue).toEqual([{ id: "intro-1", text: "第二句" }]);
	});

	it("clear 會清空佇列", () => {
		const { result } = renderHook(() => useNovaQueue());
		act(() => {
			result.current.enqueue("intro", ["第一句", "第二句"]);
		});
		act(() => {
			result.current.clear();
		});
		expect(result.current.queue).toEqual([]);
	});
});

describe("dropStaleRoomMessages", () => {
	it("丟掉佇列裡其他艙區的未播進房台詞，保留正在顯示的第一則", () => {
		const { result } = renderHook(() => useNovaQueue());
		act(() => {
			result.current.enqueue("room-cryo", ["冷凍艙第一句", "冷凍艙第二句"]);
			result.current.enqueue("room-corridor", ["走廊的台詞"]);
		});
		act(() => {
			result.current.dropStaleRoomMessages("corridor");
		});
		// 正在顯示的 room-cryo-0 播完它，之後的 room-cryo-1 不用再播；走廊的留著
		expect(result.current.queue.map((message) => message.id)).toEqual(["room-cryo-0", "room-corridor-0"]);
	});

	it("intro 與過關台詞不是進房台詞，不會被丟", () => {
		const { result } = renderHook(() => useNovaQueue());
		act(() => {
			result.current.enqueue("intro-2", ["開場一", "開場二"]);
			result.current.enqueue("room-cryo", ["冷凍艙台詞"]);
			result.current.enqueue("solved-ch1-t1", ["過關台詞"]);
		});
		act(() => {
			result.current.dropStaleRoomMessages("corridor");
		});
		expect(result.current.queue.map((message) => message.id)).toEqual([
			"intro-2-0",
			"intro-2-1",
			"solved-ch1-t1-0",
		]);
	});
});

describe("history（對話紀錄）", () => {
	it("一開始沒有紀錄，排進佇列但還沒播完的也不算", () => {
		const { result } = renderHook(() => useNovaQueue());
		expect(result.current.history).toEqual([]);
		act(() => {
			result.current.enqueue("intro", ["第一句", "第二句"]);
		});
		expect(result.current.history).toEqual([]);
	});

	it("播完（dismiss）的台詞依序記進紀錄，標成已播出", () => {
		const { result } = renderHook(() => useNovaQueue());
		act(() => {
			result.current.enqueue("intro", ["第一句", "第二句"]);
		});
		act(() => {
			result.current.dismiss("intro-0");
		});
		act(() => {
			result.current.dismiss("intro-1");
		});
		expect(result.current.history).toEqual([
			{ id: "intro-0", text: "第一句", status: "shown" },
			{ id: "intro-1", text: "第二句", status: "shown" },
		]);
	});

	it("同一則 dismiss 兩次只記一筆，不在佇列裡的 id 不記", () => {
		const { result } = renderHook(() => useNovaQueue());
		act(() => {
			result.current.enqueue("intro", ["第一句"]);
		});
		act(() => {
			result.current.dismiss("intro-0");
			result.current.dismiss("intro-0");
			result.current.dismiss("not-queued-0");
		});
		expect(result.current.history.map((entry) => entry.id)).toEqual(["intro-0"]);
	});

	it("換艙區被丟掉的進房台詞也記進紀錄，標成未播出", () => {
		const { result } = renderHook(() => useNovaQueue());
		act(() => {
			result.current.enqueue("room-cryo", ["冷凍艙第一句", "冷凍艙第二句"]);
		});
		act(() => {
			result.current.dropStaleRoomMessages("corridor");
		});
		expect(result.current.history).toEqual([{ id: "room-cryo-1", text: "冷凍艙第二句", status: "missed" }]);
	});

	it("紀錄照排進佇列的順序：正在顯示的那則比被丟掉的晚播完，仍排在它們前面", () => {
		const { result } = renderHook(() => useNovaQueue());
		act(() => {
			result.current.enqueue("room-cryo", ["冷凍艙第一句", "冷凍艙第二句", "冷凍艙第三句"]);
			result.current.enqueue("room-corridor", ["走廊的台詞"]);
		});
		act(() => {
			result.current.dropStaleRoomMessages("corridor");
		});
		act(() => {
			result.current.dismiss("room-cryo-0");
		});
		act(() => {
			result.current.dismiss("room-corridor-0");
		});
		expect(result.current.history).toEqual([
			{ id: "room-cryo-0", text: "冷凍艙第一句", status: "shown" },
			{ id: "room-cryo-1", text: "冷凍艙第二句", status: "missed" },
			{ id: "room-cryo-2", text: "冷凍艙第三句", status: "missed" },
			{ id: "room-corridor-0", text: "走廊的台詞", status: "shown" },
		]);
	});
});
