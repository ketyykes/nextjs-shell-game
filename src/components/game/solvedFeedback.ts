/**
 * 過關當下的系統級回饋（M10-1）：終端機裡的「目標達成」行、「提前用上還沒教的東西」的認可行與過關音效。
 * 純函式，不碰 store 與 EventBus，由過關流程（`useSolveFlow`）呼叫。
 */

import type { SfxName } from "@/game/phaser/events";
import type { TerminalDefinition } from "@/game/story";
import type { SolutionInsight } from "@/game/story/solutionInsight";
import type { OutputEntry } from "@/game/store/types";

/**
 * 過關時插在 NOVA 過關台詞前面的系統行，青綠成功色（4.9）。
 * 每台終端機只會過關一次（重玩本章會清掉紀錄），所以 id 帶終端機 id 就不會撞。
 * 打勾用 ☑ 而不是 U+2713 的勾：Fusion Pixel 與 VT323 都沒有那個字，會退回系統字型；☑ 也跟目標面板的打勾同一個符號。
 */
export function createObjectiveDoneEntry(definition: TerminalDefinition): OutputEntry {
	return {
		kind: "system",
		id: `objective-done-${definition.id}`,
		tone: "success",
		lines: [`☑ 目標達成：${definition.objective.title}`],
	};
}

/** 認可行每一句最多列幾項，其餘用「等 N 項」帶過，會 bash 的玩家一行打出一長串時也不洗版。 */
const INSIGHT_LIST_LIMIT = 3;

/** 「這一章」或「第 N 章」。只給課表內的項目用（`chapter` 不是 null）。 */
function chapterLabel(insight: SolutionInsight): string {
	if (insight.sameChapter) {
		return "這一章";
	}
	return `第 ${insight.chapter} 章`;
}

/** 中文接在行內程式碼後面要空一格（「`tree` 不在」），接在全形括號或中文後面不空（「（這一章）等」）。 */
function withSpaceAfterCode(text: string): string {
	if (text.endsWith("`")) {
		return `${text} `;
	}
	return text;
}

/** 用頓號串起來，超過上限只列前幾項再補「等 N 項」。 */
function joinListed(labels: string[]): string {
	const listed = labels.slice(0, INSIGHT_LIST_LIMIT).join("、");
	if (labels.length <= INSIGHT_LIST_LIMIT) {
		return listed;
	}
	return `${withSpaceAfterCode(listed)}等 ${labels.length} 項`;
}

/** 課表內、還沒教到的：都在同一章教就合成一句，不同章就每項後面標章節。 */
function taughtLaterLine(insights: SolutionInsight[]): string {
	const chapterLabels = new Set(insights.map(chapterLabel));
	if (chapterLabels.size === 1) {
		const list = joinListed(insights.map((insight) => `\`${insight.concept}\``));
		if (insights[0].sameChapter) {
			return `☆ 你用了還沒教的 ${list}，這一章就會教到。`;
		}
		return `☆ 你用了還沒教的 ${list}，${chapterLabel(insights[0])}才會正式介紹。`;
	}
	const list = joinListed(insights.map((insight) => `\`${insight.concept}\`（${chapterLabel(insight)}）`));
	return `☆ 你用了還沒教的 ${list}，之後才會正式介紹。`;
}

/** 課表外的（`tree`、`;` 這類哪一台都不教的）。 */
function offCurriculumLine(insights: SolutionInsight[]): string {
	const list = joinListed(insights.map((insight) => `\`${insight.concept}\``));
	return `☆ ${withSpaceAfterCode(list)}不在課表上，你自己找到的。`;
}

/**
 * 過關時認可「提前用上還沒教的東西」（4.9），插在「目標達成」與 NOVA 過關台詞之間。
 * 課表內的一句、課表外的一句，最多兩行；沒有要認可的回傳 null。
 * 跟「目標達成」同樣是青綠成功色：這是遊戲系統的肯定，不是 NOVA 說的，所以不用全息藍。
 * ☆ 跟 ☑ 一樣在 Fusion Pixel 裡有字，不會退回系統字型。
 */
export function createInsightEntry(definition: TerminalDefinition, insights: SolutionInsight[]): OutputEntry | null {
	const taughtLater = insights.filter((insight) => insight.chapter !== null);
	const offCurriculum = insights.filter((insight) => insight.chapter === null);
	const lines: string[] = [];
	if (taughtLater.length > 0) {
		lines.push(taughtLaterLine(taughtLater));
	}
	if (offCurriculum.length > 0) {
		lines.push(offCurriculumLine(offCurriculum));
	}
	if (lines.length === 0) {
		return null;
	}
	return { kind: "system", id: `insight-${definition.id}`, tone: "success", lines };
}

/**
 * 過關當下要播的音效，重用 power（4.10 只有五種音效，不新增音檔）。兩種演出回傳 null：
 * - `powerRestored`：Station 在關掉終端機、燈亮起來時已經會播 power，
 *   這裡再播一次就變成同一次過關響兩聲，留給亮燈那一刻比較有戲。
 * - `blackout`（第六章 kill NOVA）：Station 刻意不播音效，安靜地變黑；過關當下響「供電」的音效跟劇情相反。
 *
 * `openDoor` 照播：開門聲是關掉終端機後另一個音。`shadowFlash`、`flicker` 照播：Station 對這兩種不發音效。
 */
export function solvedSoundFor(definition: TerminalDefinition): SfxName | null {
	const effectKind = definition.effect?.kind;
	if (effectKind === "powerRestored" || effectKind === "blackout") {
		return null;
	}
	return "power";
}
