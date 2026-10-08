/**
 * 存檔匯入的檢查（M14-2、審計 A45、A49）：玩家選的檔案能不能當存檔用。
 *
 * 流程：JSON 解析 → 外層要是 persist 的 `{ state, version }` → 版本比程式新就拒絕 → 舊版走 `migrateSaveData`
 * 升到目前版本 → 整份用 zod 檢查。全部過了才回傳要寫進 localStorage 的字串（已升到目前版本）。
 *
 * - 跟 persist 讀檔不同，這裡**整份**檢查，任何一台終端機壞掉就拒絕，不靜悄悄丟掉：
 *   玩家是主動拿這份檔案來覆蓋存檔的，壞檔不該蓋掉好的存檔。
 * - 物件用 `z.looseObject`：多出來的欄位不算壞（跟 `sessionRecord.ts` 一樣）。
 * - 設定欄位都是選填，缺的讀檔時 `mergeSaveData` 會用預設值補。
 * - 這個檔案會帶進 zod，標題頁只在玩家選了檔案後才動態 import。
 */

import * as z from "zod";
import { isRoomId } from "@/game/story/rooms";
import { migrateSaveData } from "./migrate";
import { terminalSessionRecordSchema } from "./sessionRecord";
import { SAVE_VERSION } from "./types";
import type { SaveData } from "./types";

export interface SaveImportSummary {
	/** 這份存檔目前在第幾章，確認訊息用。 */
	chapter: number;
	/** 是否已通關。 */
	cleared: boolean;
}

export type SaveImportFailure = "invalid-json" | "not-a-save" | "newer-version" | "invalid-content";

export type SaveImportResult =
	| { ok: true; data: SaveData; json: string; summary: SaveImportSummary }
	| { ok: false; reason: SaveImportFailure; message: string };

const positionSchema = z.looseObject({
	chapter: z.number().int().min(1),
	x: z.number(),
	y: z.number(),
	roomId: z.string().refine(isRoomId),
});

const progressSchema = z.looseObject({
	chapter: z.number().int().min(1),
	furthestChapter: z.number().int().min(1),
	position: positionSchema.nullable(),
	character: z.enum(["a", "c", "d", "e"]).nullable(),
	solvedTerminals: z.array(z.string()),
	learnedCommands: z.array(z.string()),
	oxygen: z.number(),
	savedAt: z.string().nullable(),
	clearedAt: z.string().nullable(),
});

const settingsSchema = z.looseObject({
	textSpeed: z.enum(["slow", "normal", "fast", "instant"]).optional(),
	flickerEnabled: z.boolean().optional(),
	scanlinesEnabled: z.boolean().optional(),
	vignetteEnabled: z.boolean().optional(),
	volume: z.number().min(0).max(1).optional(),
	muted: z.boolean().optional(),
});

const chapterStatsSchema = z.looseObject({
	playTimeMs: z.number().min(0),
	errors: z.number().int().min(0),
	hints: z.number().int().min(0),
});

const saveDataSchema = z.looseObject({
	progress: progressSchema,
	settings: settingsSchema,
	terminals: z.record(z.string(), terminalSessionRecordSchema),
	storyFlags: z.record(z.string(), z.literal(true)),
	stats: z.record(z.string(), chapterStatsSchema),
});

const MESSAGES = {
	invalidJson: "這個檔案不是 JSON 格式，沒辦法當成存檔讀取。",
	notASave: "這不是 KEPLER-9 的存檔檔案。",
	invalidContent: "存檔內容有缺漏或格式錯誤，無法匯入。目前的存檔沒有變動。",
};

function newerVersionMessage(version: number): string {
	return `這份存檔來自較新版本的遊戲（格式 v${version}，目前只支援到 v${SAVE_VERSION}），無法匯入。`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 檢查玩家選的存檔檔案內容，通過時回傳升到目前版本、可直接寫進 localStorage 的字串。 */
export function parseSaveImport(text: string): SaveImportResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { ok: false, reason: "invalid-json", message: MESSAGES.invalidJson };
	}

	if (!isRecord(parsed) || !isRecord(parsed.state)) {
		return { ok: false, reason: "not-a-save", message: MESSAGES.notASave };
	}
	const version = parsed.version;
	if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
		return { ok: false, reason: "not-a-save", message: MESSAGES.notASave };
	}
	if (version > SAVE_VERSION) {
		return { ok: false, reason: "newer-version", message: newerVersionMessage(version) };
	}

	let state: unknown = parsed.state;
	if (version < SAVE_VERSION) {
		state = migrateSaveData(state, version);
	}

	const checked = saveDataSchema.safeParse(state);
	if (!checked.success) {
		return { ok: false, reason: "invalid-content", message: MESSAGES.invalidContent };
	}

	const data = state as SaveData;
	return {
		ok: true,
		data,
		json: JSON.stringify({ state: data, version: SAVE_VERSION }),
		summary: { chapter: data.progress.chapter, cleared: data.progress.clearedAt !== null },
	};
}
