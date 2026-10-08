import { describe, expect, it, vi } from "vitest";
import { preloadPhaserGame } from "./preloadPhaserGame";

const { factory } = vi.hoisted(() => ({
	factory: vi.fn(() => ({ PhaserGame: () => null })),
}));

// 真的 PhaserGame 會帶進 Phaser（jsdom 沒有 canvas），換成計數用的假模組
vi.mock("./PhaserGame", factory);

describe("preloadPhaserGame", () => {
	it("載入 PhaserGame 模組（含 Phaser 引擎），重複呼叫只載一次", async () => {
		expect(factory).not.toHaveBeenCalled();
		await preloadPhaserGame();
		await preloadPhaserGame();
		expect(factory).toHaveBeenCalledTimes(1);
	});
});
