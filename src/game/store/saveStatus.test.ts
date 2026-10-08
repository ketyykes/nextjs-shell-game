import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSaveIssue, setSaveIssue, subscribeSaveIssue, useSaveIssue } from "./saveStatus";

beforeEach(() => {
	setSaveIssue(null);
});

afterEach(cleanup);

describe("saveStatus", () => {
	it("一開始沒有問題", () => {
		expect(getSaveIssue()).toBeNull();
	});

	it("狀態改變時通知訂閱者，取消訂閱後不再通知", () => {
		const listener = vi.fn();
		const unsubscribe = subscribeSaveIssue(listener);

		setSaveIssue("write-failed");
		expect(getSaveIssue()).toBe("write-failed");
		expect(listener).toHaveBeenCalledTimes(1);

		unsubscribe();
		setSaveIssue(null);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("設成同一個狀態不重複通知，每次寫入失敗都回報也不會一直觸發重新 render", () => {
		const listener = vi.fn();
		subscribeSaveIssue(listener);

		setSaveIssue("write-failed");
		setSaveIssue("write-failed");

		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("useSaveIssue 跟著狀態更新", () => {
		const { result } = renderHook(() => useSaveIssue());
		expect(result.current).toBeNull();

		act(() => {
			setSaveIssue("newer-version");
		});
		expect(result.current).toBe("newer-version");
	});
});
