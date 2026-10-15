// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	applyStutter,
	GLITCH_FORCE_MIN_CHARS,
	glitchLines,
	isSystemHelpInput,
	STUTTER_MARK,
	stutterPoints,
} from "./displayGlitch";

/** 數兩行之間有幾個字不一樣（以 code point 計，長度一定相同）。 */
function countChanged(original: string, glitched: string): number {
	const a = Array.from(original);
	const b = Array.from(glitched);
	expect(b).toHaveLength(a.length);
	let changed = 0;
	for (let index = 0; index < a.length; index += 1) {
		if (a[index] !== b[index]) {
			changed += 1;
		}
	}
	return changed;
}

const LONG_LINE = "crew_manifest.txt  pod_01/  pod_02/  pod_03/  pod_04/  pod_05/  pod_06/  wake_up.txt";
const CHINESE_LINE = "冷凍艙喚醒排程：撤離後三年，修改者不明。備註：船員名單共五人。";

describe("glitchLines（低氧顯示不穩的亂碼）", () => {
	it("比例是 0 時原樣回傳同一個陣列", () => {
		const lines = [LONG_LINE];
		expect(glitchLines(lines, "entry-1", 0)).toBe(lines);
	});

	it("同一個種子、同一個比例每次結果都一樣（不跳動）", () => {
		const first = glitchLines([LONG_LINE, CHINESE_LINE], "entry-1", 0.05);
		const second = glitchLines([LONG_LINE, CHINESE_LINE], "entry-1", 0.05);
		expect(second).toEqual(first);
	});

	it("不同的種子各自抽，新的輸出不會跟舊的一模一樣", () => {
		const results = new Set<string>();
		for (let index = 0; index < 8; index += 1) {
			results.add(glitchLines([LONG_LINE], `entry-${index}`, 0.08)[0]);
		}
		expect(results.size).toBeGreaterThan(1);
	});

	it("只換少數字元：長度不變，換掉的比例接近設定值", () => {
		const lines: string[] = [];
		for (let index = 0; index < 40; index += 1) {
			lines.push(LONG_LINE);
		}
		const glitched = glitchLines(lines, "entry-ratio", 0.05);
		let changed = 0;
		let total = 0;
		for (let index = 0; index < lines.length; index += 1) {
			changed += countChanged(lines[index], glitched[index]);
			total += Array.from(lines[index].replace(/\s/g, "")).length;
		}
		const ratio = changed / total;
		expect(ratio).toBeGreaterThan(0.02);
		expect(ratio).toBeLessThan(0.09);
	});

	it("空白不換，保留字與字之間的分隔", () => {
		const glitched = glitchLines([LONG_LINE], "entry-space", 0.5)[0];
		const originalSpaces = [...LONG_LINE.matchAll(/ /g)].map((match) => match.index);
		const glitchedChars = Array.from(glitched);
		for (const index of originalSpaces) {
			expect(glitchedChars[index ?? -1]).toBe(" ");
		}
	});

	it("英數換成半形符號、中文換成全形符號，字寬不變", () => {
		const [ascii, chinese] = glitchLines(["abcdefghijklmnopqrstuvwxyz0123456789", CHINESE_LINE], "entry-width", 0.5);
		for (const char of ascii) {
			expect(char.codePointAt(0)).toBeLessThan(0x7f);
		}
		const originalChinese = Array.from(CHINESE_LINE);
		Array.from(chinese).forEach((char, index) => {
			if (char !== originalChinese[index]) {
				expect(char.codePointAt(0)).toBeGreaterThanOrEqual(0xff01);
				expect(char.codePointAt(0)).toBeLessThanOrEqual(0xff5e);
			}
		});
	});

	it("換上去的一定是看得出壞掉的符號，不是另一個字母或數字（免得讀成別的檔名）", () => {
		const glitched = glitchLines(["abcdefghijklmnopqrstuvwxyz0123456789"], "entry-symbol", 0.9)[0];
		const original = "abcdefghijklmnopqrstuvwxyz0123456789";
		Array.from(glitched).forEach((char, index) => {
			if (char !== original[index]) {
				expect(char).toMatch(/[^a-zA-Z0-9]/);
			}
		});
	});

	it("框線字元（tree 的 ├── └──）不換，排版不會歪", () => {
		const tree = "├── pod_01/\n└── pod_02/";
		const glitched = glitchLines(tree.split("\n"), "entry-tree", 0.9);
		expect(glitched[0].startsWith("├──")).toBe(true);
		expect(glitched[1].startsWith("└──")).toBe(true);
	});

	it("比例變高時，原本壞掉的字照樣壞掉，只是多壞幾個", () => {
		const low = glitchLines([LONG_LINE, CHINESE_LINE], "entry-mono", 0.02);
		const high = glitchLines([LONG_LINE, CHINESE_LINE], "entry-mono", 0.08);
		[LONG_LINE, CHINESE_LINE].forEach((line, lineIndex) => {
			const original = Array.from(line);
			const lowChars = Array.from(low[lineIndex]);
			const highChars = Array.from(high[lineIndex]);
			original.forEach((char, index) => {
				if (lowChars[index] !== char) {
					expect(highChars[index]).toBe(lowChars[index]);
				}
			});
		});
	});

	it(`夠長的輸出（至少 ${GLITCH_FORCE_MIN_CHARS} 個可換的字）一定看得到至少一個壞字`, () => {
		for (let index = 0; index < 30; index += 1) {
			const glitched = glitchLines([LONG_LINE], `entry-force-${index}`, 0.02)[0];
			expect(countChanged(LONG_LINE, glitched)).toBeGreaterThan(0);
		}
	});

	it("很短的輸出不強制壞字：一個數字的輸出多數時候讀得到，重打一次就換一組", () => {
		let readable = 0;
		for (let index = 0; index < 50; index += 1) {
			if (glitchLines(["5"], `entry-short-${index}`, 0.08)[0] === "5") {
				readable += 1;
			}
		}
		expect(readable).toBeGreaterThan(35);
	});
});

describe("isSystemHelpInput（hint、help 的輸出不亂碼）", () => {
	it.each(["hint", "  hint  ", "help", "hint | tail -n 1", "pwd ; hint", "ls && hint", "hint ;"])("%s 算", (input) => {
		expect(isSystemHelpInput(input)).toBe(true);
	});

	it.each(["ls", "echo hint", 'echo "hint"', "cat hint.txt", "man hint", "hints", "", "ls |"])("%s 不算", (input) => {
		expect(isSystemHelpInput(input)).toBe(false);
	});
});

describe("stutterPoints／applyStutter（NOVA 斷句）", () => {
	const LINE = "你確定你是技師嗎我查不到你的名字這不太對應該有名字的";

	it("每隔幾個字插一次，同一句每次一樣", () => {
		const points = stutterPoints(LINE);
		expect(points.length).toBeGreaterThanOrEqual(2);
		expect(stutterPoints(LINE)).toEqual(points);
		for (let index = 1; index < points.length; index += 1) {
			const gap = points[index] - points[index - 1];
			expect(gap).toBeGreaterThanOrEqual(4);
			expect(gap).toBeLessThanOrEqual(10);
		}
	});

	it("只斷在兩個中文字之間：不斷在標點旁、不拆開英數（指令與路徑照樣能抄）", () => {
		const text = "技師，試試 ls /home/tech，然後用 cat wake_up.txt 讀喚醒排程，那個檔案寫得很清楚。";
		const chars = Array.from(text);
		for (const point of stutterPoints(text)) {
			expect(chars[point - 1]).toMatch(/\p{Script=Han}/u);
			expect(chars[point]).toMatch(/\p{Script=Han}/u);
		}
	});

	it("結尾至少留兩個字，不會斷在最後", () => {
		const chars = Array.from(LINE);
		for (const point of stutterPoints(LINE)) {
			expect(point).toBeLessThanOrEqual(chars.length - 2);
		}
	});

	it("很短的句子不斷", () => {
		expect(stutterPoints("喚醒程序")).toEqual([]);
	});

	it("applyStutter 在打到的位置之後插入……，拿掉……就是原文", () => {
		const points = stutterPoints(LINE);
		const full = applyStutter(LINE, points);
		expect(full.split(STUTTER_MARK)).toHaveLength(points.length + 1);
		expect(full.split(STUTTER_MARK).join("")).toBe(LINE);
	});

	it("打字打到一半時只插已經打到的位置；剛好打到斷點時……馬上出現（停頓就停在這裡）", () => {
		const points = stutterPoints(LINE);
		const chars = Array.from(LINE);
		const first = points[0];
		expect(applyStutter(chars.slice(0, first - 1).join(""), points)).not.toContain(STUTTER_MARK);
		expect(applyStutter(chars.slice(0, first).join(""), points)).toBe(`${chars.slice(0, first).join("")}${STUTTER_MARK}`);
	});

	it("沒有斷點時原樣回傳", () => {
		expect(applyStutter(LINE, [])).toBe(LINE);
	});
});
