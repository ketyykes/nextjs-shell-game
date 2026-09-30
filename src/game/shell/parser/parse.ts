/**
 * 指令列解析入口。
 *
 * 流程：
 * 1. 先找全形字元，有就回 `FULLWIDTH_CHAR`（優先於其他錯誤，因為這是繁中玩家最常見的失誤）。
 * 2. tokenize，引號沒關回 `UNCLOSED_QUOTE`。
 * 3. 沒有任何 token（空輸入或全空白）回 `{ ok: true, command: null }`。
 * 4. 含管線或重導向回 `UNSUPPORTED_OPERATOR`，第一章還不支援。
 * 5. 第一個 word 是指令名，其餘是參數。
 */

import { findFullwidthChar } from "./fullwidth";
import { tokenize } from "./tokenizer";
import type { ParseResult } from "../types";

export function parseCommandLine(input: string): ParseResult {
	const fullwidthChar = findFullwidthChar(input);
	if (fullwidthChar !== null) {
		return { ok: false, error: { code: "FULLWIDTH_CHAR", detail: fullwidthChar } };
	}

	const tokenizeResult = tokenize(input);
	if (!tokenizeResult.ok) {
		return { ok: false, error: tokenizeResult.error };
	}

	const tokens = tokenizeResult.tokens;
	if (tokens.length === 0) {
		return { ok: true, command: null };
	}

	const operatorToken = tokens.find((token) => token.kind !== "word");
	if (operatorToken !== undefined) {
		return { ok: false, error: { code: "UNSUPPORTED_OPERATOR", detail: operatorToken.value } };
	}

	const [nameToken, ...argTokens] = tokens;
	return {
		ok: true,
		command: {
			name: nameToken.value,
			args: argTokens.map((token) => token.value),
		},
	};
}
