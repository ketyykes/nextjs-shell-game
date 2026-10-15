/**
 * 低氧氣時終端機的「顯示不穩」（設計文件 4.25），純函式，不碰 React 與 store。
 *
 * - 亂碼：指令輸出的少數字元換成看得出壞掉的符號。用種子（輸出區塊 id 加行號）決定，同一行每次 render 一樣、
 *   不做定時重抽；新的輸出各自抽各自的，所以重打一次指令就是另一組壞字。只改畫面，store 與存檔都是原文。
 * - 斷句：NOVA 的台詞每隔幾個字插一個「……」，打字動畫在那裡多停一下。一樣只改畫面，對話紀錄存原文。
 *
 * 哪些區塊要套、比例多少由呼叫端決定（`DisplayInstabilityContext`），這裡只管怎麼換。
 */

import { parseCommandList } from "@/game/shell/parser";

/** 終端機與 NOVA 對話框目前有多不穩，由主線依氧氣決定（`components/game/lowOxygen.ts`），沙盒永遠穩定。 */
export interface DisplayInstability {
	/** 指令輸出每個可換的字被換成亂碼的機率，0 是不亂碼。 */
	glitchRate: number;
	/** NOVA 台詞要不要斷句。 */
	stutter: boolean;
}

export const STABLE_DISPLAY: DisplayInstability = { glitchRate: 0, stutter: false };

// ---------------------------------------------------------------------------
// 確定性亂數
// ---------------------------------------------------------------------------

/** FNV-1a 32 位元雜湊，把種子字串變成整數。 */
function hashSeed(seed: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < seed.length; index += 1) {
		hash ^= seed.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/** mulberry32：同一個種子產生同一串 0 到 1 之間的數。 */
function seededRandom(seed: string): () => number {
	let state = hashSeed(seed);
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

// ---------------------------------------------------------------------------
// 亂碼
// ---------------------------------------------------------------------------

/** 半形字元換成這些：都不是英數，玩家看得出是壞掉而不是另一個檔名。 */
const NARROW_GLITCH_CHARS = ["#", "%", "&", "@", "*", "?", "!", "$"];
/** 中文與全形字元換成全形符號，字寬不變（都已在 Fusion Pixel 子集裡）。 */
const WIDE_GLITCH_CHARS = ["＃", "％", "＆", "＠", "＊", "？", "！", "＄"];

/** 至少有這麼多個可換的字時，保證整筆輸出看得到一個壞字；太短的不強制，免得一個數字的輸出永遠讀不到。 */
export const GLITCH_FORCE_MIN_CHARS = 20;

type GlitchKind = "narrow" | "wide" | null;

/**
 * 這個字可以換成哪一種符號；null 是不換（空白、框線、箭頭這類排版字元）。
 * 半形：ASCII 可見字元。全形：漢字、全形標點與全形英數。
 */
function glitchKindOf(char: string): GlitchKind {
	const code = char.codePointAt(0) ?? 0;
	if (code > 0x20 && code < 0x7f) {
		return "narrow";
	}
	if (/\p{Script=Han}/u.test(char)) {
		return "wide";
	}
	if ((code >= 0x3000 && code <= 0x303f) || (code >= 0xff01 && code <= 0xff5e)) {
		if (code === 0x3000) {
			return null;
		}
		return "wide";
	}
	return null;
}

function pickGlitchChar(kind: Exclude<GlitchKind, null>, random: number): string {
	let pool = NARROW_GLITCH_CHARS;
	if (kind === "wide") {
		pool = WIDE_GLITCH_CHARS;
	}
	return pool[Math.floor(random * pool.length) % pool.length];
}

/**
 * 把一筆輸出的每一行換掉少數字元。
 *
 * - 每一行用 `${seed}:${行號}` 當種子，每個字固定抽兩個數（要不要換、換成哪個），
 *   所以比例變高時原本壞掉的字照樣壞、只是多壞幾個，不會整行重新洗牌。
 * - 整筆可換的字達 `GLITCH_FORCE_MIN_CHARS` 時，再用 `${seed}:force` 挑一個字一定換，畫面上一定看得到不穩。
 * - 比例是 0（或以下）時原樣回傳同一個陣列。
 *
 * @param lines 原始輸出行
 * @param seed 輸出區塊的 id
 * @param rate 每個可換的字被換掉的機率，0 到 1
 */
export function glitchLines(lines: readonly string[], seed: string, rate: number): readonly string[] {
	if (!(rate > 0)) {
		return lines;
	}

	const glitched = lines.map((line) => Array.from(line));
	const candidates: Array<{ line: number; index: number; kind: Exclude<GlitchKind, null> }> = [];

	glitched.forEach((chars, lineIndex) => {
		const random = seededRandom(`${seed}:${lineIndex}`);
		chars.forEach((char, index) => {
			const roll = random();
			const choice = random();
			const kind = glitchKindOf(char);
			if (kind === null) {
				return;
			}
			candidates.push({ line: lineIndex, index, kind });
			if (roll < rate) {
				chars[index] = pickGlitchChar(kind, choice);
			}
		});
	});

	if (candidates.length >= GLITCH_FORCE_MIN_CHARS) {
		const random = seededRandom(`${seed}:force`);
		const forced = candidates[Math.floor(random() * candidates.length) % candidates.length];
		glitched[forced.line][forced.index] = pickGlitchChar(forced.kind, random());
	}

	return glitched.map((chars) => chars.join(""));
}

/** 遊戲系統的求助指令（3.3「遊戲專用指令只有 hint 與 help」），它們的輸出不亂碼，新手才能照著打。 */
const SYSTEM_HELP_COMMANDS = new Set(["hint", "help"]);

/**
 * 這一行指令有沒有跑到 `hint` 或 `help`（含 `;`、`&&`、管線裡的任何一段）。
 * 在畫面上判斷而不是存旗標，舊存檔裡的輸出也適用；解析失敗（語法錯誤）的一定沒跑到。
 */
export function isSystemHelpInput(input: string): boolean {
	const parsed = parseCommandList(input);
	if (!parsed.ok) {
		return false;
	}
	return parsed.items.some((item) =>
		item.pipeline.commands.some((command) => SYSTEM_HELP_COMMANDS.has(command.name.value)),
	);
}

// ---------------------------------------------------------------------------
// 斷句
// ---------------------------------------------------------------------------

/** 斷句插入的停頓記號。 */
export const STUTTER_MARK = "……";
/** 打字動畫打到斷點時多停的毫秒數（換算成打字的拍數，至少一拍）。 */
export const STUTTER_PAUSE_MS = 360;
/** 兩個斷點之間至少、最多隔幾個字（實際落點會往後找到兩個中文字之間）。 */
const STUTTER_MIN_GAP = 5;
const STUTTER_MAX_GAP = 8;
/** 斷點後面至少要剩幾個字，不斷在句尾。 */
const STUTTER_TAIL = 2;

function isHan(char: string | undefined): boolean {
	if (char === undefined) {
		return false;
	}
	return /\p{Script=Han}/u.test(char);
}

/**
 * NOVA 台詞的斷點：回傳「打到第幾個字（code point）之後插……」，由小到大。
 *
 * 只斷在兩個中文字之間，所以不會斷在標點旁，也不會拆開台詞裡的指令與路徑（照抄還是對的）。
 * 間隔用原文當種子抽 5 到 8 個字，同一句每次一樣。
 */
export function stutterPoints(text: string): number[] {
	const chars = Array.from(text);
	const random = seededRandom(text);
	const nextGap = (): number => STUTTER_MIN_GAP + Math.floor(random() * (STUTTER_MAX_GAP - STUTTER_MIN_GAP + 1));
	const lastAllowed = chars.length - STUTTER_TAIL;

	const points: number[] = [];
	let candidate = nextGap();
	while (candidate <= lastAllowed) {
		let point = candidate;
		while (point <= lastAllowed && !(isHan(chars[point - 1]) && isHan(chars[point]))) {
			point += 1;
		}
		if (point > lastAllowed) {
			break;
		}
		points.push(point);
		candidate = point + nextGap();
	}
	return points;
}

/**
 * 在已經打出來的文字裡，把打到的斷點後面插上「……」。
 * 剛好打到斷點時就插（打字動畫接著在這裡停一下）；`typed` 是原文的前綴，`points` 來自 `stutterPoints(原文)`。
 */
export function applyStutter(typed: string, points: readonly number[]): string {
	if (points.length === 0) {
		return typed;
	}
	const chars = Array.from(typed);
	const pointSet = new Set(points);
	let result = "";
	chars.forEach((char, index) => {
		result += char;
		if (pointSet.has(index + 1)) {
			result += STUTTER_MARK;
		}
	});
	return result;
}
