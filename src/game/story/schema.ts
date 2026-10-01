/**
 * 劇本資料的 zod schema（設計文件 3.4：「寫劇本時欄位打錯會直接報錯」）。
 *
 * 物件一律用 `z.strictObject`，多出未知欄位（例如把 `hints` 打成 `hint`）也會報錯。
 * 函式（`objective.check`）與檔案系統快照（`fs`）用 `z.custom` 只做基本檢查，
 * `validateChapter` 成功時回傳原物件，不回傳 parse 後的拷貝，保留函式與快照的原參考。
 *
 * 這個檔案不 import React、Phaser 或 zustand。
 */

import * as z from "zod";
import zhTW from "zod/v4/locales/zh-TW.js";
import type { FsSnapshot } from "@/game/shell/types";
import { ROOM_IDS } from "./rooms";
import type { ChapterDefinition, ObjectiveCheck } from "./types";

/** 終端機 id 格式：`ch<章>-t<台>`，例如 `ch1-t4`。 */
export const TERMINAL_ID_PATTERN = /^ch\d+-t\d+$/;

/** 三段式提示的上限（4.6）。 */
export const MAX_HINTS = 3;

/** zod 內建訊息改用繁中；schema 上自訂的訊息優先權較高，不受影響。 */
const zhTwErrorMap = zhTW().localeError;

/** 一般物件（不是 null、不是陣列）。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const nonEmptyString = z.string().min(1, { error: "不能是空字串" });

/** 一串台詞或系統行，每行都不能是空字串。 */
const lineListSchema = z.array(nonEmptyString);

const fsSnapshotSchema = z.custom<FsSnapshot>((value) => isPlainObject(value), {
	error: "檔案系統快照必須是物件",
});

const objectiveCheckSchema = z.custom<ObjectiveCheck>((value) => typeof value === "function", {
	error: "目標判定 check 必須是函式",
});

const objectiveSchema = z.strictObject({
	title: nonEmptyString,
	description: z.string().optional(),
	check: objectiveCheckSchema,
});

const novaScriptSchema = z.strictObject({
	onEnterRoom: lineListSchema.optional(),
	onOpen: lineListSchema.optional(),
	onSolved: lineListSchema.optional(),
	onStuck: lineListSchema.optional(),
});

export const terminalDefinitionSchema = z.strictObject({
	id: z.string().regex(TERMINAL_ID_PATTERN, { error: "終端機 id 格式必須是 ch<數字>-t<數字>，例如 ch1-t1" }),
	title: nonEmptyString,
	roomId: z.enum(ROOM_IDS, { error: `roomId 必須是 ${ROOM_IDS.join("、")} 之一` }),
	teaches: z.array(nonEmptyString),
	fs: fsSnapshotSchema,
	initialCwd: z.string().startsWith("/", { error: "initialCwd 必須是絕對路徑" }).optional(),
	hints: z
		.array(nonEmptyString)
		.min(1, { error: "hints 至少要一段" })
		.max(MAX_HINTS, { error: `hints 最多 ${MAX_HINTS} 段` }),
	banner: lineListSchema.optional(),
	objective: objectiveSchema,
	nova: novaScriptSchema.optional(),
});

export const chapterDefinitionSchema = z
	.strictObject({
		chapter: z.number().int({ error: "chapter 必須是整數" }).positive({ error: "chapter 必須是正整數" }),
		title: nonEmptyString,
		intro: lineListSchema.optional(),
		outro: lineListSchema.optional(),
		novaErrorLines: lineListSchema.optional(),
		terminals: z.array(terminalDefinitionSchema).min(1, { error: "章節至少要有一台終端機" }),
	})
	.superRefine((chapter, ctx) => {
		const seen = new Set<string>();
		chapter.terminals.forEach((terminal, index) => {
			if (seen.has(terminal.id)) {
				ctx.addIssue({
					code: "custom",
					message: `終端機 id「${terminal.id}」重複`,
					path: ["terminals", index, "id"],
					input: terminal.id,
				});
			}
			seen.add(terminal.id);
		});
	});

/** 把 issue 路徑排成 `terminals[3].hints` 這種形式，根層級顯示「(根)」。 */
function formatIssuePath(path: readonly PropertyKey[]): string {
	if (path.length === 0) {
		return "(根)";
	}

	let result = "";
	for (const segment of path) {
		if (typeof segment === "number") {
			result += `[${segment}]`;
		} else if (result === "") {
			result = String(segment);
		} else {
			result += `.${String(segment)}`;
		}
	}
	return result;
}

/**
 * 驗證章節劇本，失敗時丟出列出每個問題路徑與說明的 Error。
 * 成功回傳傳入的同一個物件（不是拷貝），函式與檔案系統快照保留原參考。
 */
export function validateChapter(definition: ChapterDefinition): ChapterDefinition {
	const result = chapterDefinitionSchema.safeParse(definition, { error: zhTwErrorMap });
	if (result.success) {
		return definition;
	}

	const details = result.error.issues.map((issue) => `- ${formatIssuePath(issue.path)}：${issue.message}`);
	throw new Error(["劇本格式錯誤：", ...details].join("\n"));
}
