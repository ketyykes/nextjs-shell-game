import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SolvedEffect } from "@/game/phaser/events";
import { startGame } from "@/game/phaser/main";
import { PhaserGame } from "./PhaserGame";

vi.mock("@/game/phaser/main", () => ({
	startGame: vi.fn(() => ({ destroy: vi.fn() })),
}));

const startGameMock = vi.mocked(startGame);

/** 取出第 index 次 startGame 回傳的假 game 的 destroy mock */
function getDestroyMock(index: number) {
	const game = startGameMock.mock.results[index].value as { destroy: ReturnType<typeof vi.fn> };
	return game.destroy;
}

/** 遊戲是延後一幀建立的，等到 startGame 被呼叫指定次數為止 */
async function waitForGames(count: number): Promise<void> {
	await waitFor(() => {
		expect(startGameMock).toHaveBeenCalledTimes(count);
	});
}

beforeEach(() => {
	startGameMock.mockClear();
});

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(cleanup);

describe("PhaserGame", () => {
	it("掛載後下一幀以容器與選角呼叫 startGame 一次", async () => {
		render(<PhaserGame character="a" chapter={1} />);
		// 同步階段還沒建立
		expect(startGameMock).not.toHaveBeenCalled();

		await waitForGames(1);
		expect(startGameMock.mock.calls[0][0]).toBe(screen.getByTestId("phaser-container"));
		expect(startGameMock.mock.calls[0][1]).toEqual({
			character: "a",
			chapter: 1,
			startDark: false,
			terminalEffects: {},
			solvedTerminals: [],
			volume: undefined,
			muted: undefined,
			spawnPoint: null,
			flickerEnabled: true,
		});
	});

	it("onGameCreated 會收到 startGame 的回傳值", async () => {
		const onGameCreated = vi.fn();
		render(<PhaserGame character="a" chapter={1} onGameCreated={onGameCreated} />);

		await waitForGames(1);
		expect(onGameCreated).toHaveBeenCalledTimes(1);
		expect(onGameCreated).toHaveBeenCalledWith(startGameMock.mock.results[0].value);
	});

	it("onGameCreated 換成新函式時不會重建遊戲", async () => {
		const { rerender } = render(<PhaserGame character="a" chapter={1} onGameCreated={vi.fn()} />);
		await waitForGames(1);
		rerender(<PhaserGame character="a" chapter={1} onGameCreated={vi.fn()} />);
		await new Promise((resolve) => window.requestAnimationFrame(resolve));

		expect(startGameMock).toHaveBeenCalledTimes(1);
		expect(getDestroyMock(0)).not.toHaveBeenCalled();
	});

	it("卸載時呼叫 destroy(true)", async () => {
		const { unmount } = render(<PhaserGame character="a" chapter={1} />);
		await waitForGames(1);
		unmount();

		expect(getDestroyMock(0)).toHaveBeenCalledTimes(1);
		expect(getDestroyMock(0)).toHaveBeenCalledWith(true);
	});

	it("建立前就卸載時不會建立遊戲", async () => {
		const { unmount } = render(<PhaserGame character="a" chapter={1} />);
		unmount();
		await new Promise((resolve) => window.requestAnimationFrame(resolve));

		expect(startGameMock).not.toHaveBeenCalled();
	});

	it("選角從 a 改成 d 時先銷毀舊遊戲，再用新選角重建", async () => {
		const { rerender } = render(<PhaserGame character="a" chapter={1} />);
		await waitForGames(1);
		rerender(<PhaserGame character="d" chapter={1} />);
		await waitForGames(2);

		expect(getDestroyMock(0)).toHaveBeenCalledWith(true);
		expect(getDestroyMock(1)).not.toHaveBeenCalled();
		expect(startGameMock.mock.calls[1][1]).toEqual({
			character: "d",
			chapter: 1,
			startDark: false,
			terminalEffects: {},
			solvedTerminals: [],
			volume: undefined,
			muted: undefined,
			spawnPoint: null,
			flickerEnabled: true,
		});
		expect(getDestroyMock(0).mock.invocationCallOrder[0]).toBeLessThan(startGameMock.mock.invocationCallOrder[1]);
	});

	it("把章節、開場斷電、過關演出表、存檔位置與閃爍設定傳給 startGame", async () => {
		const terminalEffects: Record<string, SolvedEffect> = {
			"ch2-t4": { kind: "powerRestored" },
			"ch2-t6": { kind: "openDoor", doorId: "airlock" },
		};
		render(
			<PhaserGame
				character="c"
				chapter={2}
				startDark
				terminalEffects={terminalEffects}
				solvedTerminals={["ch2-t1"]}
				volume={0.5}
				muted
				spawnPoint={{ x: 640, y: 352 }}
				flickerEnabled={false}
			/>,
		);
		await waitForGames(1);

		expect(startGameMock.mock.calls[0][1]).toEqual({
			character: "c",
			chapter: 2,
			startDark: true,
			terminalEffects,
			solvedTerminals: ["ch2-t1"],
			volume: 0.5,
			muted: true,
			spawnPoint: { x: 640, y: 352 },
			flickerEnabled: false,
		});
	});

	it("章節從 1 改成 2 時先銷毀舊遊戲，再用新章節重建", async () => {
		const { rerender } = render(<PhaserGame character="a" chapter={1} />);
		await waitForGames(1);
		rerender(<PhaserGame character="a" chapter={2} startDark />);
		await waitForGames(2);

		expect(getDestroyMock(0)).toHaveBeenCalledWith(true);
		expect(getDestroyMock(1)).not.toHaveBeenCalled();
		expect(startGameMock.mock.calls[1][1]).toMatchObject({ character: "a", chapter: 2, startDark: true });
		expect(getDestroyMock(0).mock.invocationCallOrder[0]).toBeLessThan(startGameMock.mock.invocationCallOrder[1]);
	});

	it("開場斷電、演出表、過關清單變動時不會重建遊戲", async () => {
		const { rerender } = render(<PhaserGame character="a" chapter={1} startDark terminalEffects={{}} />);
		await waitForGames(1);
		rerender(
			<PhaserGame
				character="a"
				chapter={1}
				startDark={false}
				terminalEffects={{ "ch1-t4": { kind: "powerRestored" } }}
				solvedTerminals={["ch1-t4"]}
			/>,
		);
		await new Promise((resolve) => window.requestAnimationFrame(resolve));

		expect(startGameMock).toHaveBeenCalledTimes(1);
		expect(getDestroyMock(0)).not.toHaveBeenCalled();
	});

	it("StrictMode 下只會建立一個遊戲", async () => {
		render(
			<StrictMode>
				<PhaserGame character="a" chapter={1} />
			</StrictMode>,
		);
		await waitForGames(1);
		await new Promise((resolve) => window.requestAnimationFrame(resolve));

		expect(startGameMock).toHaveBeenCalledTimes(1);
		expect(getDestroyMock(0)).not.toHaveBeenCalled();
	});
});
