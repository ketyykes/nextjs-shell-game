import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialSaveData, useGameStore } from "@/game/store";
import { ClearRecordPanel } from "./ClearRecordPanel";

beforeEach(() => {
	useGameStore.setState(createInitialSaveData());
});

// vitest 未啟用 globals，需手動在每個測試後卸載畫面
afterEach(() => {
	cleanup();
	localStorage.clear();
});

const RECORD = { chapters: [{ number: 1, label: "第一章 冷凍艙" }], stats: {} };

describe("ClearRecordPanel", () => {
	it("表格下面多一行「阿彬的留言 n/8」，數字來自存檔", () => {
		useGameStore.setState({ abinNotes: { found: ["ch1-jokes", "ch2-vault", "ch3-hold"], reply: null } });
		render(<ClearRecordPanel record={RECORD} onBack={vi.fn()} />);

		expect(screen.getByTestId("clear-record-abin-notes").textContent).toBe("阿彬的留言 3/8");
	});
});
