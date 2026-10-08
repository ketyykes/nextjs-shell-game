import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOUCH_PRIMARY_QUERY, TOUCH_WARNING_DISMISSED_KEY, useTouchWarning } from "./useTouchWarning";

interface FakeMediaQuery {
	/** 改變 matches 並通知訂閱者，模擬接上或拔掉滑鼠。 */
	setMatches: (matches: boolean) => void;
	/** 每次呼叫 matchMedia 收到的查詢字串。 */
	queries: string[];
}

/** jsdom 沒有 matchMedia，換成可控的假物件。 */
function installMatchMedia(initialMatches: boolean): FakeMediaQuery {
	let matches = initialMatches;
	const listeners = new Set<() => void>();
	const queries: string[] = [];
	const matchMedia = vi.fn((query: string) => {
		queries.push(query);
		return {
			get matches() {
				return matches;
			},
			media: query,
			addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
			removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
		};
	});
	vi.stubGlobal("matchMedia", matchMedia);
	return {
		setMatches(next: boolean) {
			matches = next;
			for (const listener of listeners) {
				listener();
			}
		},
		queries,
	};
}

beforeEach(() => {
	window.sessionStorage.clear();
});

// vitest 未啟用 globals，需手動卸載並還原 stub
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("useTouchWarning", () => {
	it("觸控為主的裝置（主要指標粗、不能懸停）要顯示提示", () => {
		const media = installMatchMedia(true);
		const { result } = renderHook(() => useTouchWarning());
		expect(result.current.visible).toBe(true);
		expect(media.queries).toContain(TOUCH_PRIMARY_QUERY);
		expect(TOUCH_PRIMARY_QUERY).toBe("(pointer: coarse) and (hover: none)");
	});

	it("桌機不顯示提示", () => {
		installMatchMedia(false);
		const { result } = renderHook(() => useTouchWarning());
		expect(result.current.visible).toBe(false);
	});

	it("瀏覽器沒有 matchMedia 時不顯示提示", () => {
		vi.stubGlobal("matchMedia", undefined);
		const { result } = renderHook(() => useTouchWarning());
		expect(result.current.visible).toBe(false);
	});

	it("略過後隱藏，同一個分頁重新掛載也不再出現", () => {
		installMatchMedia(true);
		const first = renderHook(() => useTouchWarning());
		act(() => {
			first.result.current.dismiss();
		});
		expect(first.result.current.visible).toBe(false);
		expect(window.sessionStorage.getItem(TOUCH_WARNING_DISMISSED_KEY)).toBe("1");

		first.unmount();
		const second = renderHook(() => useTouchWarning());
		expect(second.result.current.visible).toBe(false);
	});

	it("sessionStorage 不能用時，略過仍然有效", () => {
		installMatchMedia(true);
		const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("SecurityError");
		});
		const { result } = renderHook(() => useTouchWarning());
		act(() => {
			result.current.dismiss();
		});
		expect(result.current.visible).toBe(false);
		setItem.mockRestore();
	});

	it("指標條件改變時跟著更新，例如平板接上滑鼠", () => {
		const media = installMatchMedia(true);
		const { result } = renderHook(() => useTouchWarning());
		expect(result.current.visible).toBe(true);
		act(() => {
			media.setMatches(false);
		});
		expect(result.current.visible).toBe(false);
	});
});
