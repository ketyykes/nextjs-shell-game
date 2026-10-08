/**
 * 劇本的型別契約（設計文件 3.4）。
 *
 * `schema.ts` 用 zod 驗證資料部分，`objectives.ts` 提供目標判定的組合函式，
 * `src/game/chapters/*.ts` 用這些型別寫劇本。這個檔案不 import React、Phaser 或 zustand。
 */

import type { RoomId, SolvedEffect } from "@/game/phaser/events";
import type {
	FsSnapshot,
	ParsedCommand,
	ParsedPipeline,
	ProcessInfo,
	ShellExecution,
	VirtualFs,
} from "@/game/shell/types";

// ---------------------------------------------------------------------------
// 目標判定
// ---------------------------------------------------------------------------

/**
 * 每次指令執行後交給目標判定函式的資料。
 * 一行用 `;`、`&&` 串了好幾段時，`evaluateObjective` 逐段各組一個 context（那一段的指令、輸出與狀態），
 * 寫判定時把它當成「一段管線」看就好。
 */
export interface ObjectiveContext {
	terminalId: string;
	/** 解析後的第一個指令（`ls | grep x` 的是 `ls`）；解析失敗或空輸入時為 null。 */
	command: ParsedCommand | null;
	/** 完整管線（含重導向）；解析失敗或空輸入時為 null。 */
	pipeline: ParsedPipeline | null;
	execution: ShellExecution;
	/** 這台終端機的檔案系統，用來把相對路徑換成絕對路徑或檢查檔案存在。執行後的狀態，`mkdir` 之後查得到新目錄。 */
	fs: VirtualFs;
	home: string;
}

/** 回傳 true 代表這台終端機過關。只在 `execution.isError` 為 false 時被呼叫。 */
export type ObjectiveCheck = (context: ObjectiveContext) => boolean;

export interface Objective {
	/** HUD「目前目標」面板的一句話，例如「找出斷電原因」。 */
	title: string;
	/** 補充說明，可選，例如「維生系統的狀態檔分散在三個目錄裡」。 */
	description?: string;
	check: ObjectiveCheck;
}

// ---------------------------------------------------------------------------
// NOVA 台詞
// ---------------------------------------------------------------------------

/**
 * NOVA 在不同時機說的話。每個欄位是一串台詞，依序顯示。
 * 所有文字不得指涉主角的性別、年齡、名字，NOVA 一律叫玩家「技師」。
 * NOVA 教的指令永遠正確，說的故事不可信（4.2）。
 */
export interface NovaScript {
	/** 玩家第一次走進這台終端機所在的艙區：地圖右下角對話框。 */
	onEnterRoom?: string[];
	/** 開啟終端機時：終端機輸出區的內嵌對話區塊。 */
	onOpen?: string[];
	/** 過關時：先在終端機內嵌顯示，關閉後地圖對話框再說一次最後一句。 */
	onSolved?: string[];
	/**
	 * 卡關時（連續五次錯誤或三分鐘沒進展，4.8）：NOVA 用劇情口吻給方向，內容等同 hint 第一段。
	 * 沒寫就直接用 `hints[0]` 套 NOVA 的口頭禪。
	 */
	onStuck?: string[];
}

// ---------------------------------------------------------------------------
// 終端機與章節
// ---------------------------------------------------------------------------

export interface TerminalDefinition {
	/** 全域唯一，例如 `ch1-t1`，store、地圖 markers、事件都用它當 key。 */
	id: string;
	/** 顯示在終端機標題列，例如「冷凍艙控制台」，要跟地圖 markers 的 `title` 一致。 */
	title: string;
	roomId: RoomId;
	/** 這台終端機教的指令，過關後加進已學清單。 */
	teaches: string[];
	/** 初始檔案系統，寫檔案等於寫劇情。 */
	fs: FsSnapshot;
	/** 開啟時的工作目錄，預設家目錄。 */
	initialCwd?: string;
	/** 三段式提示，`hint` 指令用。 */
	hints: string[];
	/** 開啟終端機時先印在輸出區的系統行。 */
	banner?: string[];
	objective: Objective;
	nova?: NovaScript;
	/** 過關時地圖上的演出，沒寫就沒有（見 `SolvedEffect`）。 */
	effect?: SolvedEffect;
	/** 初始環境變數（第五章），shell 會再補 `HOME`、`USER`、`PWD`。 */
	env?: Record<string, string>;
	/** 初始程序清單（第六章 `ps`）。 */
	processes?: ProcessInfo[];
}

/** 章節地圖設定：六個甲板共用平面圖，差別只在檔名與開場燈光。 */
export interface ChapterMap {
	/** 載入 `public/maps/deck{deck}.json`，通常等於章節號。 */
	deck: number;
	/** true 時開場斷電（只有角色周圍一圈光），要有一台終端機的 `effect` 是 `powerRestored` 才會亮。 */
	startDark: boolean;
}

export interface ChapterDefinition {
	/** 從 1 起算，對應存檔的 `progress.chapter`。 */
	chapter: number;
	title: string;
	/** 標題畫面副標與插圖卡用的艙區名，例如「冷凍艙」、「資料中心」。 */
	deckName: string;
	map: ChapterMap;
	/** 開場 NOVA 台詞（4.4 開場）。第一章的第一句在 boot log 說，其餘章節全部在進地圖後說。 */
	intro?: string[];
	/** 全部終端機過關後的結尾台詞（4.4 結尾鉤子）。 */
	outro?: string[];
	/**
	 * 環境反應階梯第 9 次錯誤時 NOVA 說的話（4.8：「你確定你是技師？」這類），依序輪流用。
	 * 沒寫就用 `src/game/story/pressure.ts` 的預設句。
	 */
	novaErrorLines?: string[];
	terminals: TerminalDefinition[];
}

// ---------------------------------------------------------------------------
// 劇情旗標
// ---------------------------------------------------------------------------

/**
 * 劇情旗標，存在 store 的 `storyFlags`，只有 true 才存。
 * 每章一組：`ch<n>.introShown`、`ch<n>.outroShown`、`ch<n>.room.<艙區>.entered`，用 `flags.ts` 的函式產生。
 */
export type StoryFlag =
	| `ch${number}.introShown`
	| `ch${number}.outroShown`
	| `ch${number}.room.${RoomId}.entered`;
