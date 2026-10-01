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
