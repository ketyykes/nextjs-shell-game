/**
 * 低氧氣時 NOVA 台詞的斷句（設計文件 4.25），純函式，不碰 React 與 store。
 *
 * NOVA 的台詞每隔幾個字插一個「……」，打字動畫在那裡多停一下。只改畫面，對話紀錄存原文。
 * 第十九場原本還有「終端機輸出亂碼」，收尾後 Danny 決定拿掉（會壞掉錯誤訊息與要照抄的值，
 * 正好打到最需要讀清楚的新手，見 notes/decisions.md #150），低氧只剩斷句、心跳聲與 HUD 的「缺氧：顯示不穩」。
 *
 * 要不要斷句由呼叫端決定（`DisplayInstabilityContext`），這裡只管怎麼斷。
 */

/** 終端機與 NOVA 對話框目前有多不穩，由主線依氧氣決定（`components/game/lowOxygen.ts`），沙盒永遠穩定。 */
export interface DisplayInstability {
	/** NOVA 台詞要不要斷句。 */
	stutter: boolean;
}

export const STABLE_DISPLAY: DisplayInstability = { stutter: false };

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
