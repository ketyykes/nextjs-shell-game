import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChapter } from "@/game/chapters";
import { emitGameEvent, onGameEvent } from "@/game/phaser/EventBus";
import type { GameEventName } from "@/game/phaser/events";
import { collectTerminalEffects, usePhaserBridge, type UsePhaserBridgeOptions } from "./usePhaserBridge";

vi.mock("@/game/phaser/EventBus", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/game/phaser/EventBus")>();
	return { ...actual, onGameEvent: vi.fn(actual.onGameEvent) };
});

const DEFAULT_SETTINGS: UsePhaserBridgeOptions["settings"] = { volume: 0.8, muted: false, flickerEnabled: true };

function createHandlers() {
	return {
		onTerminalOpen: vi.fn<(terminalId: string) => void>(),
		onTerminalNearby: vi.fn<(terminalId: string | null) => void>(),
		onSceneReady: vi.fn<() => void>(),
		onPlayerStopped: vi.fn<UsePhaserBridgeOptions["onPlayerStopped"]>(),
		onRoomEnter: vi.fn<UsePhaserBridgeOptions["onRoomEnter"]>(),
	};
}

function setup(options: Partial<UsePhaserBridgeOptions> = {}) {
	const initialProps: UsePhaserBridgeOptions = { settings: DEFAULT_SETTINGS, ...createHandlers(), ...options };
	return renderHook((props: UsePhaserBridgeOptions) => usePhaserBridge(props), { initialProps });
}

function subscribedEvents(): GameEventName[] {
	return vi.mocked(onGameEvent).mock.calls.map(([name]) => name);
}

const settingsEvents: { name: GameEventName; payload: unknown }[] = [];
let unsubscribeSettings: (() => void)[] = [];

beforeEach(() => {
	settingsEvents.length = 0;
	unsubscribeSettings = (["audio:settings", "effects:settings"] as const).map((name) =>
		onGameEvent(name, (payload) => settingsEvents.push({ name, payload })),
	);
	vi.mocked(onGameEvent).mockClear();
});

// vitest 未啟用 globals，需手動在每個測試後卸載
afterEach(() => {
	cleanup();
	for (const unsubscribe of unsubscribeSettings) {
		unsubscribe();
	}
});

describe("usePhaserBridge 訂閱", () => {
	it("掛載時訂閱五個 Phaser 事件，各一次", () => {
		setup();
		expect(subscribedEvents().sort()).toEqual(
			["player:stopped", "room:enter", "scene:ready", "terminal:nearby", "terminal:open"].sort(),
		);
	});

	it("每個事件轉給對應的 handler", () => {
		const handlers = createHandlers();
		setup(handlers);
		act(() => {
			emitGameEvent("terminal:open", { terminalId: "ch1-t1" });
			emitGameEvent("terminal:nearby", { terminalId: null });
			emitGameEvent("scene:ready", { sceneKey: "Station" });
			emitGameEvent("player:stopped", { x: 1, y: 2, roomId: "cryo" });
			emitGameEvent("room:enter", { roomId: "medbay" });
		});

		expect(handlers.onTerminalOpen).toHaveBeenCalledExactlyOnceWith("ch1-t1");
		expect(handlers.onTerminalNearby).toHaveBeenCalledExactlyOnceWith(null);
		expect(handlers.onSceneReady).toHaveBeenCalledTimes(1);
		expect(handlers.onPlayerStopped).toHaveBeenCalledExactlyOnceWith({ x: 1, y: 2, roomId: "cryo" });
		expect(handlers.onRoomEnter).toHaveBeenCalledExactlyOnceWith("medbay");
	});

	it("handler 換成新函式時不重新訂閱，事件交給最新的 handler（A4）", () => {
		const first = createHandlers();
		const { rerender } = setup(first);
		const second = createHandlers();
		rerender({ settings: DEFAULT_SETTINGS, ...second });
		rerender({ settings: DEFAULT_SETTINGS, ...second });

		act(() => {
			emitGameEvent("room:enter", { roomId: "cryo" });
		});
		expect(subscribedEvents()).toHaveLength(5);
		expect(first.onRoomEnter).not.toHaveBeenCalled();
		expect(second.onRoomEnter).toHaveBeenCalledExactlyOnceWith("cryo");
	});

	it("卸載後退訂，事件不再進來", () => {
		const handlers = createHandlers();
		const { unmount } = setup(handlers);
		unmount();
		act(() => {
			emitGameEvent("terminal:open", { terminalId: "ch1-t1" });
		});
		expect(handlers.onTerminalOpen).not.toHaveBeenCalled();
	});
});

describe("usePhaserBridge 設定同步", () => {
	it("掛載時發一次音量與閃爍設定", () => {
		setup();
		expect(settingsEvents).toEqual([
			{ name: "audio:settings", payload: { volume: 0.8, muted: false } },
			{ name: "effects:settings", payload: { flickerEnabled: true } },
		]);
	});

	it("只有變動的那一項重發", () => {
		const handlers = createHandlers();
		const { rerender } = setup(handlers);
		settingsEvents.length = 0;

		rerender({ ...handlers, settings: { ...DEFAULT_SETTINGS, muted: true } });
		expect(settingsEvents).toEqual([{ name: "audio:settings", payload: { volume: 0.8, muted: true } }]);

		rerender({ ...handlers, settings: { ...DEFAULT_SETTINGS, muted: true, flickerEnabled: false } });
		expect(settingsEvents.at(-1)).toEqual({ name: "effects:settings", payload: { flickerEnabled: false } });
		expect(settingsEvents).toHaveLength(2);
	});
});

describe("usePhaserBridge 除錯鉤子", () => {
	it("開發模式掛 window.__kepler9.emit，卸載時拿掉", () => {
		const { unmount } = setup();
		const devWindow = window as Window & { __kepler9?: { emit: unknown } };
		expect(devWindow.__kepler9?.emit).toBe(emitGameEvent);
		unmount();
		expect(devWindow.__kepler9).toBeUndefined();
	});
});

describe("collectTerminalEffects", () => {
	it("只收有演出的終端機", () => {
		const chapter = getChapter(1);
		const effects = collectTerminalEffects(chapter);
		const expected = chapter.terminals.filter((terminal) => terminal.effect !== undefined);

		expect(Object.keys(effects)).toEqual(expected.map((terminal) => terminal.id));
		for (const terminal of expected) {
			expect(effects[terminal.id]).toEqual(terminal.effect);
		}
	});
});
