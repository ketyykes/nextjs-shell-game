import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REDUCED_MOTION_QUERY, usePrefersReducedMotion } from "./usePrefersReducedMotion";

/** jsdom 沒有 matchMedia，換成可控的假物件；只有減少動態的查詢會依 matches 回答。 */
function installMatchMedia(initialMatches: boolean): { setMatches: (matches: boolean) => void } {
	let matches = initialMatches;
	const listeners = new Set<() => void>();
	vi.stubGlobal(
		"matchMedia",
		vi.fn((query: string) => ({
			get matches() {
				return query === REDUCED_MOTION_QUERY && matches;
			},
			media: query,
			addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
			removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
		})),
	);
	return {
		setMatches(next: boolean) {
			matches = next;
			for (const listener of listeners) {
				listener();
			}
		},
	};
}

// vitest 未啟用 globals，需手動卸載並還原 stub
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("usePrefersReducedMotion", () => {
	it("系統設定了減少動態效果時回傳 true", () => {
		installMatchMedia(true);
		const { result } = renderHook(() => usePrefersReducedMotion());
		expect(result.current).toBe(true);
		expect(REDUCED_MOTION_QUERY).toBe("(prefers-reduced-motion: reduce)");
	});

	it("沒設定時回傳 false", () => {
		installMatchMedia(false);
		const { result } = renderHook(() => usePrefersReducedMotion());
		expect(result.current).toBe(false);
	});

	it("瀏覽器沒有 matchMedia 時回傳 false", () => {
		vi.stubGlobal("matchMedia", undefined);
		const { result } = renderHook(() => usePrefersReducedMotion());
		expect(result.current).toBe(false);
	});

	it("系統設定改變時跟著更新", () => {
		const media = installMatchMedia(false);
		const { result } = renderHook(() => usePrefersReducedMotion());
		act(() => {
			media.setMatches(true);
		});
		expect(result.current).toBe(true);
	});
});
