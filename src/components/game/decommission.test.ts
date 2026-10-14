// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getChapter } from "@/game/chapters";
import type { PlayStats } from "@/game/store/types";
import {
	COUNTDOWN_LABELS,
	DECOMMISSION_AT,
	WAKE_AT,
	countdownPhase,
	elapsedPlayTimeMs,
	formatCountdown,
	remainingMs,
} from "./decommission";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 喚醒到除役的精確間隔：81 天 20 小時 25 分。 */
const FULL_COUNTDOWN_MS = 81 * DAY + 20 * HOUR + 25 * MINUTE;

function stats(entries: Record<string, number>): PlayStats {
	const result: PlayStats = {};
	for (const [chapter, playTimeMs] of Object.entries(entries)) {
		result[chapter] = { playTimeMs, errors: 0, hints: 0 };
	}
	return result;
}

describe("時間軸常數", () => {
	it("除役時間跟第五章艦橋登錄台的 DECOMMISSION_AT 一致", () => {
		const entry = getChapter(5).terminals[0];
		expect(entry.env?.DECOMMISSION_AT).toBeDefined();
		expect(DECOMMISSION_AT).toBe(Date.parse(entry.env?.DECOMMISSION_AT ?? ""));
	});

	it("喚醒是 2031-03-12 08:15 UTC，到除役精確是 81 天 20 小時 25 分", () => {
		expect(WAKE_AT).toBe(Date.parse("2031-03-12T08:15:00Z"));
		expect(DECOMMISSION_AT - WAKE_AT).toBe(FULL_COUNTDOWN_MS);
	});

	it("劇本的「82 天」是日期相減：喚醒那天到除役那天相差 82 個日曆日", () => {
		const wakeDay = Date.UTC(2031, 2, 12);
		const decommissionDay = Date.UTC(2031, 5, 2);
		expect((decommissionDay - wakeDay) / DAY).toBe(82);
		// 第六章 T4 的 banner 與 core_status.txt 都寫 82 天
		const core = getChapter(6).terminals[3];
		expect(core.banner?.join("\n")).toContain("遠端除役倒數：82 天");
	});
});

describe("remainingMs", () => {
	it("還沒玩是完整的倒數，玩多久就少多久", () => {
		expect(remainingMs(0)).toBe(FULL_COUNTDOWN_MS);
		expect(remainingMs(90 * MINUTE)).toBe(FULL_COUNTDOWN_MS - 90 * MINUTE);
	});

	it("負數與非數字當沒玩；最低停在 0，不會變負", () => {
		expect(remainingMs(-5000)).toBe(FULL_COUNTDOWN_MS);
		expect(remainingMs(Number.NaN)).toBe(FULL_COUNTDOWN_MS);
		expect(remainingMs(FULL_COUNTDOWN_MS + DAY)).toBe(0);
	});
});

describe("formatCountdown", () => {
	it("天數不補零，時分秒補兩位", () => {
		expect(formatCountdown(FULL_COUNTDOWN_MS)).toBe("T-81d 20:25:00");
		expect(formatCountdown(9 * DAY + 3 * HOUR + 4 * MINUTE + 5 * SECOND)).toBe("T-9d 03:04:05");
	});

	it("不足一秒的部分無條件進位：玩了 0.5 秒還是 20:25:00，滿 1 秒才跳 20:24:59", () => {
		expect(formatCountdown(remainingMs(500))).toBe("T-81d 20:25:00");
		expect(formatCountdown(remainingMs(1000))).toBe("T-81d 20:24:59");
		expect(formatCountdown(remainingMs(1500))).toBe("T-81d 20:24:59");
	});

	it("跨過整點與整天", () => {
		expect(formatCountdown(remainingMs(20 * HOUR + 25 * MINUTE))).toBe("T-81d 00:00:00");
		expect(formatCountdown(remainingMs(20 * HOUR + 25 * MINUTE + SECOND))).toBe("T-80d 23:59:59");
	});

	it("0 與負數顯示全零", () => {
		expect(formatCountdown(0)).toBe("T-0d 00:00:00");
		expect(formatCountdown(-1000)).toBe("T-0d 00:00:00");
	});
});

describe("elapsedPlayTimeMs", () => {
	it("加總第一章到目前章節的遊玩時間", () => {
		expect(elapsedPlayTimeMs(stats({ "1": 10 * MINUTE, "2": 20 * MINUTE, "3": 5 * MINUTE }), 3)).toBe(35 * MINUTE);
	});

	it("目前章節之後的統計不算：重玩前面的章節時倒數回到那一章的時間點", () => {
		expect(elapsedPlayTimeMs(stats({ "1": 10 * MINUTE, "2": 20 * MINUTE, "5": HOUR }), 2)).toBe(30 * MINUTE);
	});

	it("沒有統計的章節當 0；壞掉的數字不算", () => {
		expect(elapsedPlayTimeMs({}, 4)).toBe(0);
		expect(elapsedPlayTimeMs(stats({ "1": Number.NaN, "2": -100, "3": 7 * SECOND }), 3)).toBe(7 * SECOND);
	});
});

describe("countdownPhase", () => {
	const base = { solvedTerminals: [] as string[], finished: false };

	it("第一到四章一律是中性的站務排程，就算存檔裡第五章 T1 已過關（重玩前面章節）", () => {
		for (const chapter of [1, 2, 3, 4]) {
			expect(countdownPhase({ ...base, chapter })).toBe("schedule");
			expect(countdownPhase({ ...base, chapter, solvedTerminals: ["ch5-t1", "ch6-t4"] })).toBe("schedule");
		}
	});

	it("第五章 T1 過關前是站務排程，過關後改成遠端除役", () => {
		expect(countdownPhase({ ...base, chapter: 5 })).toBe("schedule");
		expect(countdownPhase({ ...base, chapter: 5, solvedTerminals: ["ch5-t2"] })).toBe("schedule");
		expect(countdownPhase({ ...base, chapter: 5, solvedTerminals: ["ch5-t1"] })).toBe("decommission");
	});

	it("第六章一開始就是遠端除役，T4 終止 NOVA 之後變成目標無回應", () => {
		expect(countdownPhase({ ...base, chapter: 6 })).toBe("decommission");
		expect(countdownPhase({ ...base, chapter: 6, solvedTerminals: ["ch6-t1", "ch6-t2", "ch6-t3"] })).toBe(
			"decommission",
		);
		expect(countdownPhase({ ...base, chapter: 6, solvedTerminals: ["ch6-t4"] })).toBe("unresponsive");
	});

	it("已逃離（停在片尾之後）不顯示", () => {
		expect(countdownPhase({ chapter: 6, solvedTerminals: ["ch6-t4"], finished: true })).toBe("hidden");
	});

	it("每個看得到的階段都有標籤，前四章的標籤不提除役", () => {
		expect(COUNTDOWN_LABELS.schedule).toBe("站務排程");
		expect(COUNTDOWN_LABELS.decommission).toBe("遠端除役");
		expect(COUNTDOWN_LABELS.unresponsive).toBe("遠端除役 · 目標無回應");
		expect(COUNTDOWN_LABELS.schedule).not.toContain("除役");
	});
});
