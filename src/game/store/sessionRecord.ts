/**
 * 終端機 session 存檔的檢查（M12-5、審計 A16）。
 *
 * 存檔只擋得住「不是合法 JSON」，JSON 合法但某台 `terminals` 的內容壞掉時（手動改存檔、
 * 之後改了序列化格式卻漏寫 migrate），還原 Shell 會丟例外或在畫面 render 時炸掉。
 * 這裡先用 schema 判斷能不能用，壞掉的由呼叫端丟掉重建。
 *
 * - 物件用 `z.looseObject`：多出來的欄位不算壞，之後加欄位不會讓舊程式把新存檔整台丟掉。
 * - 檔案系統序列化的 `version` 只檢查是數字，支不支援交給 `VirtualFileSystem.fromSerialized` 判斷。
 * - 這個檔案會帶進 zod，只給 /play 用；標題畫面不需要，別從 `./index` 匯出。
 */

import * as z from "zod";
import type { TerminalSessionRecord } from "./types";

const fsFileNodeSchema = z.looseObject({
	type: z.literal("file"),
	name: z.string(),
	content: z.string(),
	mtime: z.string(),
	owner: z.string(),
	mode: z.string(),
});

/** 目錄的子項可以是檔案或目錄，用 `z.lazy` 遞迴。 */
const fsNodeSchema: z.ZodType<unknown> = z.lazy(() => z.discriminatedUnion("type", [fsFileNodeSchema, fsDirNodeSchema]));

const fsDirNodeSchema = z.looseObject({
	type: z.literal("dir"),
	name: z.string(),
	children: z.record(z.string(), fsNodeSchema),
	mtime: z.string(),
	owner: z.string(),
	mode: z.string(),
});

const processSchema = z.looseObject({
	pid: z.number(),
	user: z.string(),
	cpu: z.number(),
	mem: z.number(),
	started: z.string(),
	command: z.string(),
	ignoresTerm: z.boolean().optional(),
	protected: z.boolean().optional(),
});

const shellSessionStateSchema = z.looseObject({
	terminalId: z.string(),
	cwd: z.string(),
	history: z.array(z.string()),
	hintCount: z.number(),
	learnedCommands: z.array(z.string()),
	fs: z.looseObject({ version: z.number(), root: fsDirNodeSchema }),
	env: z.record(z.string(), z.string()).optional(),
	processes: z.array(processSchema).optional(),
});

const outputEntrySchema = z.discriminatedUnion("kind", [
	z.looseObject({
		kind: z.literal("command"),
		id: z.string(),
		prompt: z.string(),
		input: z.string(),
		lines: z.array(z.string()),
		isError: z.boolean(),
	}),
	z.looseObject({ kind: z.literal("system"), id: z.string(), lines: z.array(z.string()) }),
	z.looseObject({ kind: z.literal("dialogue"), id: z.string(), speaker: z.literal("NOVA"), text: z.string() }),
]);

const terminalSessionRecordSchema = z.looseObject({
	shell: shellSessionStateSchema,
	transcript: z.array(outputEntrySchema),
	errorCount: z.number().optional(),
	scriptHash: z.string().optional(),
});

/** 存檔裡的這筆 session 形狀對不對得上 `TerminalSessionRecord`，對得上才拿去還原 Shell。 */
export function isTerminalSessionRecord(value: unknown): value is TerminalSessionRecord {
	return terminalSessionRecordSchema.safeParse(value).success;
}
