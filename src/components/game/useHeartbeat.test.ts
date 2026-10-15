import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emitGameEvent, onGameEvent } from "@/game/phaser/EventBus";
import type { GameEventMap } from "@/game/phaser/events";
import { heartbeatFor } from "./lowOxygen";
import { useHeartbeat } from "./useHeartbeat";

type Heartbeat = GameEventMap["audio:heartbeat"];

const received: Heartbeat[] = [];
let unsubscribe: () => void = () => {};

beforeEach(() => {
	received.length = 0;
	unsubscribe = onGameEvent("audio:heartbeat", (payload) => received.push(payload));
});

// vitest 未啟用 globals，需手動在每個測試後卸載
afterEach(() => {
	cleanup();
	unsubscribe();
});

function setup(oxygen: number) {
	return renderHook((props: { oxygen: number }) => useHeartbeat(props.oxygen), { initialProps: { oxygen } });
}

describe("useHeartbeat（低氧心跳，4.25）", () => {
	it("掛載時依氧氣發一次：100% 是不播", () => {
		setup(100);
		expect(received).toEqual([{ active: false, intensity: 0 }]);
	});

	it("掛載時氧氣已經低於 20%（讀存檔來的）就開始播", () => {
		setup(12);
		expect(received).toEqual([heartbeatFor(12)]);
		expect(received[0].active).toBe(true);
	});

	it("氧氣往下掉時跟著發，強度變大", () => {
		const { rerender } = setup(20);
		rerender({ oxygen: 19 });
		rerender({ oxygen: 18 });
		expect(received.slice(1)).toEqual([heartbeatFor(19), heartbeatFor(18)]);
		expect(received[2].intensity).toBeGreaterThan(received[1].intensity);
	});

	it("20% 以上的變動不重複發（一直都是不播）", () => {
		const { rerender } = setup(100);
		rerender({ oxygen: 99 });
		rerender({ oxygen: 35 });
		expect(received).toHaveLength(1);
	});

	it("過關回到 100% 立刻停", () => {
		const { rerender } = setup(8);
		rerender({ oxygen: 100 });
		expect(received.at(-1)).toEqual({ active: false, intensity: 0 });
	});

	it("Station 建好（scene:ready）時補發目前的狀態，Phaser 比 React 晚準備好也接得到", () => {
		const { rerender } = setup(15);
		rerender({ oxygen: 14 });
		received.length = 0;
		emitGameEvent("scene:ready", { sceneKey: "Station" });
		expect(received).toEqual([heartbeatFor(14)]);
	});

	it("卸載（回標題、換章）時發停止，之後的 scene:ready 不再補發", () => {
		const { unmount } = setup(10);
		received.length = 0;
		unmount();
		expect(received).toEqual([{ active: false, intensity: 0 }]);
		emitGameEvent("scene:ready", { sceneKey: "Station" });
		expect(received).toHaveLength(1);
	});
});
