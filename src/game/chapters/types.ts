/**
 * 劇本資料的型別。
 *
 * M2 先放最小集合讓 /play 頁面有東西可玩；
 * M5-1 會在 `src/game/story/schema.ts` 用 zod 定義完整 schema（目標判定、NOVA 台詞、觸發條件），
 * 到時候這裡的型別應改成從 zod schema 推導。
 */

import type { FsSnapshot } from "@/game/shell/types";

export interface TerminalDefinition {
	/** 全域唯一，例如 `ch1-t1`，store 與事件都用它當 key。 */
	id: string;
	/** 顯示在終端機標題列，例如「冷凍艙控制台」。 */
	title: string;
	/** 這台終端機教的指令，過關後加進已學清單。 */
	teaches: string[];
	/** 初始檔案系統，寫檔案等於寫劇情。 */
	fs: FsSnapshot;
	/** 開啟時的工作目錄，預設家目錄。 */
	initialCwd?: string;
	/** 三段式提示，`hint` 指令用。 */
	hints: string[];
	/** 開啟終端機時先印在輸出區的系統行，例如機台名稱與狀態。 */
	banner?: string[];
}

export interface ChapterDefinition {
	/** 從 1 起算，對應存檔的 `progress.chapter`。 */
	chapter: number;
	title: string;
	terminals: TerminalDefinition[];
}
