/**
 * 找不到指令時的建議。
 *
 * 當整串找不到指令時，shell 把第一個 token 丟進來，依序試：
 * - 「忘記空格」：新手常把指令和參數黏在一起，例如 `cdmedbay`、`catwake_up.txt`，
 *   拆成「已知指令 + 剩餘字串」，讓錯誤訊息能說「你是不是想打 `cd medbay`？」。
 * - 常見但這台站沒有的程式：`vim`、`apt`、`python`、`ssh`、Windows 的 `dir` 等，給專屬說明。
 * - 大小寫：`LS`、`Cd` 換成小寫就是指令。
 * - 打錯字：`gerp`、`sl`、`mkdri`，用 Damerau–Levenshtein 距離找最接近的指令。
 */

import type { MissingSpaceSuggestion, UnavailableProgram } from "../types";

/**
 * 在 `knownCommands` 裡找出是 `input` 前綴、且剩餘字串非空的指令。
 * 多個符合時取最長的前綴（例如 known 有 `ls` 與 `lsa` 時，`lsabc` 建議 `lsa` + `bc`）。
 * `input` 完全等於某個指令名時回傳 `null`，那不是忘記空格。
 * 找不到回傳 `null`。
 */
export function suggestMissingSpace(
	input: string,
	knownCommands: string[],
): MissingSpaceSuggestion | null {
	if (knownCommands.includes(input)) {
		return null;
	}

	let bestCommand: string | null = null;
	for (const command of knownCommands) {
		if (command.length === 0) {
			continue;
		}
		// 剩餘字串長度至少 1
		if (input.length <= command.length) {
			continue;
		}
		if (!input.startsWith(command)) {
			continue;
		}
		if (bestCommand === null || command.length > bestCommand.length) {
			bestCommand = command;
		}
	}

	if (bestCommand === null) {
		return null;
	}

	return {
		command: bestCommand,
		rest: input.slice(bestCommand.length),
	};
}


/**
 * Damerau–Levenshtein 距離（optimal string alignment 版）：插入、刪除、替換、相鄰兩個字對調各算一次。
 * 以字元（`Array.from`）計，中文一個字算一個。
 */
export function editDistance(a: string, b: string): number {
	const source = Array.from(a);
	const target = Array.from(b);
	// distances[i][j]：source 前 i 個字變成 target 前 j 個字的最少步數
	const distances: number[][] = [];
	for (let i = 0; i <= source.length; i += 1) {
		distances.push([i]);
	}
	for (let j = 1; j <= target.length; j += 1) {
		distances[0][j] = j;
	}

	for (let i = 1; i <= source.length; i += 1) {
		for (let j = 1; j <= target.length; j += 1) {
			const cost = source[i - 1] === target[j - 1] ? 0 : 1;
			let best = Math.min(
				distances[i - 1][j] + 1,
				distances[i][j - 1] + 1,
				distances[i - 1][j - 1] + cost,
			);
			const swapped = i > 1 && j > 1 && source[i - 1] === target[j - 2] && source[i - 2] === target[j - 1];
			if (swapped) {
				best = Math.min(best, distances[i - 2][j - 2] + 1);
			}
			distances[i][j] = best;
		}
	}

	return distances[source.length][target.length];
}

/** 拼字建議只處理全是英文字母的名稱；含路徑、萬用字元、底線、數字的多半不是打錯字。 */
const LETTERS_ONLY = /^[A-Za-z]+$/;

/**
 * 輸入長度能接受的最大距離：一個字不猜（什麼都像），
 * 二到五個字只接受 1（短名稱差兩個字已經是別的指令了），六個字以上接受 2。
 */
function maxTypoDistance(length: number): number {
	if (length <= 1) {
		return 0;
	}
	if (length <= 5) {
		return 1;
	}
	return 2;
}

/**
 * 找出跟 `input` 最接近的指令（打錯字的建議），比對前先轉小寫。
 * 距離超過門檻（見 `maxTypoDistance`）不猜；同分時已學的優先，再照 `knownCommands` 的順序（也就是註冊順序）。
 * 跟某個指令完全一樣、或不是全英文字母時回傳 null。
 */
export function suggestSimilarCommand(
	input: string,
	knownCommands: string[],
	learnedCommands: string[] = [],
): string | null {
	if (!LETTERS_ONLY.test(input)) {
		return null;
	}

	const lower = input.toLowerCase();
	const limit = maxTypoDistance(lower.length);
	let best: { command: string; distance: number; learned: boolean } | null = null;

	for (const command of knownCommands) {
		const distance = editDistance(lower, command);
		if (distance === 0) {
			return null;
		}
		if (distance > limit) {
			continue;
		}
		const learned = learnedCommands.includes(command);
		if (best === null || distance < best.distance) {
			best = { command, distance, learned };
			continue;
		}
		// 同分時只有「這個學過、目前的沒學過」才換掉，否則保留先註冊的
		if (distance === best.distance && learned && !best.learned) {
			best = { command, distance, learned };
		}
	}

	if (best === null) {
		return null;
	}
	return best.command;
}

/** 大小寫打錯（`LS`、`Cd`）：換成小寫就是指令時回傳小寫的名稱，否則回傳 null。 */
export function suggestLowercaseCommand(input: string, knownCommands: string[]): string | null {
	const lower = input.toLowerCase();
	if (lower === input || !knownCommands.includes(lower)) {
		return null;
	}
	return lower;
}

/** 常見但這台站沒有的程式。`sudo`、`exit` 是真的指令（彩蛋），`nano` 是真的編輯器（4.22），都不在這裡。 */
const UNAVAILABLE_PROGRAMS: Record<string, UnavailableProgram> = {
	vim: { kind: "editor" },
	vi: { kind: "editor" },
	nvim: { kind: "editor" },
	emacs: { kind: "editor" },
	apt: { kind: "package" },
	"apt-get": { kind: "package" },
	yum: { kind: "package" },
	dnf: { kind: "package" },
	brew: { kind: "package" },
	pip: { kind: "package" },
	npm: { kind: "package" },
	python: { kind: "language" },
	python3: { kind: "language" },
	node: { kind: "language" },
	perl: { kind: "language" },
	ruby: { kind: "language" },
	java: { kind: "language" },
	gcc: { kind: "language" },
	ssh: { kind: "network" },
	scp: { kind: "network" },
	ping: { kind: "network" },
	curl: { kind: "network" },
	wget: { kind: "network" },
	telnet: { kind: "network" },
	ftp: { kind: "network" },
	cls: { kind: "windows", equivalent: "clear" },
	dir: { kind: "windows", equivalent: "ls" },
	del: { kind: "windows", equivalent: "rm" },
	copy: { kind: "windows", equivalent: "cp" },
	move: { kind: "windows", equivalent: "mv" },
	ren: { kind: "windows", equivalent: "mv" },
	md: { kind: "windows", equivalent: "mkdir" },
};

/** 查 `input` 是不是常見但這台站沒有的程式，大小寫不分；不是的話回傳 null。 */
export function findUnavailableProgram(input: string): UnavailableProgram | null {
	const lower = input.toLowerCase();
	if (!Object.hasOwn(UNAVAILABLE_PROGRAMS, lower)) {
		return null;
	}
	return UNAVAILABLE_PROGRAMS[lower];
}
