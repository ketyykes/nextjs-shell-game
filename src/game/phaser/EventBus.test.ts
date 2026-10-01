// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventBus, emitGameEvent, offGameEvent, onceGameEvent, onGameEvent } from "./EventBus";

afterEach(() => {
	EventBus.removeAllListeners();
});

describe("EventBus", () => {
	it("emit 後 handler 收到正確的 payload", () => {
		const handler = vi.fn();
		onGameEvent("terminal:open", handler);

		emitGameEvent("terminal:open", { terminalId: "ch1-t1" });

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith({ terminalId: "ch1-t1" });
	});

	it("onGameEvent 回傳的函式能取消訂閱", () => {
		const handler = vi.fn();
		const unsubscribe = onGameEvent("room:enter", handler);

		emitGameEvent("room:enter", { roomId: "cryo" });
		unsubscribe();
		emitGameEvent("room:enter", { roomId: "medbay" });

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith({ roomId: "cryo" });
	});

	it("offGameEvent 能移除指定的 handler，不影響其他 handler", () => {
		const removed = vi.fn();
		const kept = vi.fn();
		onGameEvent("puzzle:solved", removed);
		onGameEvent("puzzle:solved", kept);

		offGameEvent("puzzle:solved", removed);
		emitGameEvent("puzzle:solved", { terminalId: "ch1-t2" });

		expect(removed).not.toHaveBeenCalled();
		expect(kept).toHaveBeenCalledTimes(1);
	});

	it("onceGameEvent 只收一次", () => {
		const handler = vi.fn();
		onceGameEvent("scene:ready", handler);

		emitGameEvent("scene:ready", { sceneKey: "Station" });
		emitGameEvent("scene:ready", { sceneKey: "Station" });

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith({ sceneKey: "Station" });
	});

	it("onceGameEvent 回傳的函式能在觸發前取消", () => {
		const handler = vi.fn();
		const cancel = onceGameEvent("sfx:play", handler);

		cancel();
		emitGameEvent("sfx:play", { sound: "door" });

		expect(handler).not.toHaveBeenCalled();
	});

	it("不同事件名稱互不干擾", () => {
		const openHandler = vi.fn();
		const closeHandler = vi.fn();
		onGameEvent("terminal:open", openHandler);
		onGameEvent("terminal:close", closeHandler);

		emitGameEvent("terminal:close", { terminalId: "ch1-t3" });

		expect(openHandler).not.toHaveBeenCalled();
		expect(closeHandler).toHaveBeenCalledWith({ terminalId: "ch1-t3" });
	});

	it("terminal:nearby 可以傳 null 表示離開互動區", () => {
		const handler = vi.fn();
		onGameEvent("terminal:nearby", handler);

		emitGameEvent("terminal:nearby", { terminalId: null });

		expect(handler).toHaveBeenCalledWith({ terminalId: null });
	});
});

describe("EventBus 不依賴 Phaser", () => {
	it("handler 內取消自己不會跳過下一個 handler", () => {
		const second = vi.fn();
		const unsubscribeFirst = onGameEvent("terminal:close", () => {
			unsubscribeFirst();
		});
		onGameEvent("terminal:close", second);

		emitGameEvent("terminal:close", { terminalId: "ch1-t1" });

		expect(second).toHaveBeenCalledTimes(1);
		expect(EventBus.listenerCount("terminal:close")).toBe(1);
	});
});
