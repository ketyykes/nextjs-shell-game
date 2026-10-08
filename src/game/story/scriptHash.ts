/**
 * 劇本內容雜湊（M12-4、審計 G1）：偵測某台終端機的劇本在玩家開過之後有沒有改版。
 *
 * 玩家第一次開某台終端機時，整份檔案系統、工作目錄、env、程序清單都會存進 localStorage，
 * 之後還原一律用存檔裡的；劇本潤稿或修謎題後，存檔裡的舊內容就跟新版 hint 對不上。
 * 存檔時一起記這個雜湊，開啟時跟最新劇本比對，不同而且還沒過關就用新版重建（見 `terminalSession.ts`）。
 *
 * 只算「會影響 Shell 初始狀態、而且會被存進存檔」的欄位：`fs`、`banner`、`initialCwd`、`env`、`processes`。
 * hint、NOVA 台詞、目標、教的指令、標題每次都從最新劇本讀，改了不必重建，所以不算進來。
 *
 * 純函式、零相依；演算法是標準 FNV-1a 64 位元（輸入是 UTF-8 位元組），同內容在任何瀏覽器、任何時間都同結果。
 * 這不是安全用途的雜湊，只拿來比對「一不一樣」。
 */

import type { TerminalDefinition } from "./types";

/** FNV-1a 64 位元的起始值與質數，拆成高低兩個 32 位元。質數是 2^40 + 0x1b3。 */
const OFFSET_HIGH = 0xcbf29ce4;
const OFFSET_LOW = 0x84222325;
const PRIME_LOW_PART = 0x1b3;
const TWO_POW_32 = 0x100000000;

function toHex32(value: number): string {
	return value.toString(16).padStart(8, "0");
}

/**
 * 對一串位元組算 FNV-1a 64 位元，回傳 16 個十六進位字元。
 *
 * JavaScript 的 number 只有 53 位元精度，所以拆成高低兩半各 32 位元算：
 * 乘以質數 = 乘以 0x1b3 再加上「左移 40 位」，低半部左移 40 位後只剩 `low << 8` 落在高半部。
 */
export function fnv1a64Bytes(bytes: ArrayLike<number>): string {
	let high = OFFSET_HIGH;
	let low = OFFSET_LOW;

	for (let index = 0; index < bytes.length; index += 1) {
		low = (low ^ bytes[index]) >>> 0;

		const lowProduct = low * PRIME_LOW_PART;
		const carry = Math.floor(lowProduct / TWO_POW_32);
		const shiftedLow = (low << 8) >>> 0;
		high = (high * PRIME_LOW_PART + carry + shiftedLow) >>> 0;
		low = lowProduct >>> 0;
	}

	return toHex32(high) + toHex32(low);
}

/** 對字串的 UTF-8 位元組算 FNV-1a 64 位元。 */
export function fnv1a64(text: string): string {
	return fnv1a64Bytes(new TextEncoder().encode(text));
}

/**
 * 物件 key 依字典序排好再轉 JSON，同內容不管 key 寫的順序都得到同一個字串。
 * 值是 undefined 的欄位略過（跟 `JSON.stringify` 一樣），所以「沒寫」與「寫 undefined」等價。
 */
export function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item === undefined ? null : item)).join(",")}]`;
	}
	if (typeof value === "object" && value !== null) {
		const record = value as Record<string, unknown>;
		const parts: string[] = [];
		for (const key of Object.keys(record).sort()) {
			const item = record[key];
			if (item === undefined || typeof item === "function") {
				continue;
			}
			parts.push(`${JSON.stringify(key)}:${stableStringify(item)}`);
		}
		return `{${parts.join(",")}}`;
	}
	return JSON.stringify(value);
}

/** 某台終端機劇本的內容雜湊，存進 `TerminalSessionRecord.scriptHash`。 */
export function terminalScriptHash(definition: TerminalDefinition): string {
	const content = {
		fs: definition.fs,
		banner: definition.banner,
		initialCwd: definition.initialCwd,
		env: definition.env,
		processes: definition.processes,
	};
	return fnv1a64(stableStringify(content));
}
