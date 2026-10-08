import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { onGameEvent } from "@/game/phaser/EventBus";
import { usePauseMenu } from "./usePauseMenu";

const events: string[] = [];
const unsubscribers: (() => void)[] = [];

function setup(terminalOpen = false) {
	return renderHook((props: { terminalOpen: boolean }) => usePauseMenu(props), { initialProps: { terminalOpen } });
}

function pressEscape(init: KeyboardEventInit = {}): void {
	act(() => {
		fireEvent.keyDown(window, { key: "Escape", ...init });
	});
}

beforeEach(() => {
	events.length = 0;
	unsubscribers.push(onGameEvent("game:pause", () => events.push("pause")));
	unsubscribers.push(onGameEvent("game:resume", () => events.push("resume")));
});

// vitest 未啟用 globals，需手動在每個測試後卸載
afterEach(() => {
	cleanup();
	for (const unsubscribe of unsubscribers.splice(0)) {
		unsubscribe();
	}
});

describe("usePauseMenu", () => {
	it("Esc 開暫停選單並發 game:pause，繼續後發 game:resume", () => {
		const { result } = setup();
		pressEscape();
		expect(result.current.paused).toBe(true);
		expect(result.current.menuOpen).toBe(true);
		expect(events).toEqual(["pause"]);

		act(() => {
			result.current.resume();
		});
		expect(result.current.paused).toBe(false);
		expect(events).toEqual(["pause", "resume"]);
	});

	it("按住 Esc 的重複事件與其他按鍵都不開", () => {
		const { result } = setup();
		pressEscape({ repeat: true });
		act(() => {
			fireEvent.keyDown(window, { key: "Enter" });
		});
		expect(result.current.paused).toBe(false);
		expect(events).toEqual([]);
	});

	it("終端機開著時不接 Esc，關掉後恢復", () => {
		const { result, rerender } = setup(true);
		pressEscape();
		expect(result.current.paused).toBe(false);

		rerender({ terminalOpen: false });
		pressEscape();
		expect(result.current.paused).toBe(true);
	});

	it("從暫停開設定：設定開著時 Phaser 仍停住、不再重發 pause；關設定回到暫停選單", () => {
		const { result } = setup();
		pressEscape();
		act(() => {
			result.current.openSettings();
		});
		expect(result.current.settingsOpen).toBe(true);
		expect(result.current.paused).toBe(true);
		expect(events).toEqual(["pause"]);

		act(() => {
			result.current.closeSettings();
		});
		expect(result.current.settingsOpen).toBe(false);
		expect(result.current.paused).toBe(true);
		expect(events).toEqual(["pause"]);
	});

	it("暫停中再按 Esc 不會被這裡處理（交給 PauseMenu 自己當「繼續」）", () => {
		const { result } = setup();
		pressEscape();
		pressEscape();
		expect(result.current.paused).toBe(true);
		expect(events).toEqual(["pause"]);
	});

	it("選單開著時卸載也會發 game:resume，Phaser 不會卡在暫停", () => {
		const { unmount } = setup();
		pressEscape();
		unmount();
		expect(events).toEqual(["pause", "resume"]);
	});
});
