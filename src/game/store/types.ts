/**
 * zustand store 的共用型別，也是存檔格式的定義。
 *
 * 設計文件 4.7：單一存檔槽、localStorage、存檔格式從一開始就帶 `chapter` 欄位。
 * 這個檔案只放型別與常數，不 import zustand，讓 React 以外的模組（例如劇本、測試）也能引用。
 */

import type { RoomId } from "@/game/phaser/events";
import type { ShellSessionState } from "@/game/shell/shell";

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

/** 文字速度：NOVA 對話與 boot log 的打字動畫用。 */
export type TextSpeed = "slow" | "normal" | "fast" | "instant";

/** 每個字的毫秒數，`instant` 不做動畫。 */
export const TEXT_SPEED_MS: Record<TextSpeed, number> = {
	slow: 60,
	normal: 30,
	fast: 12,
	instant: 0,
};

export interface SettingsState {
	textSpeed: TextSpeed;
	/** 關閉閃爍是光敏體質玩家的安全項，預設開。 */
	flickerEnabled: boolean;
	scanlinesEnabled: boolean;
	vignetteEnabled: boolean;
	/** 0 到 1。 */
	volume: number;
	muted: boolean;
}

export const DEFAULT_SETTINGS: SettingsState = {
	textSpeed: "normal",
	flickerEnabled: true,
	scanlinesEnabled: true,
	vignetteEnabled: true,
	volume: 0.8,
	muted: false,
};

// ---------------------------------------------------------------------------
// 進度
// ---------------------------------------------------------------------------

/** 四個主角外觀，對應 `public/sprites/technician-{a,c,d,e}.png`。 */
export type CharacterId = "a" | "c" | "d" | "e";

/**
 * 角色在地圖上的位置（v2 起存檔）。帶章節是因為六個甲板共用平面圖，
 * 換章或重玩時座標不能沿用到別章；`roomId` 讓 HUD 在 Phaser 載完前就能顯示艙區名。
 */
export interface PlayerPosition {
	chapter: number;
	/** 角色中心的世界座標（px），存成整數。 */
	x: number;
	y: number;
	roomId: RoomId;
}

export interface ProgressState {
	/** 從 1 起算。 */
	chapter: number;
	/** 到過的最遠章節，標題畫面的「選章」只開放到這一章（v2 起）。 */
	furthestChapter: number;
	/** 角色最後停下的位置，沒有就從出生點開始（v2 起）。 */
	position: PlayerPosition | null;
	/** 新遊戲選角前是 null。 */
	character: CharacterId | null;
	/** 已過關的終端機 id，例如 `ch1-t1`。 */
	solvedTerminals: string[];
	/** 全域已學指令，跨終端機累積；建立 Shell 時傳進去，`help` 只列這些。 */
	learnedCommands: string[];
	/** 氧氣百分比，4.8：每次錯誤掉 1%，最低 5%，過關回 100%。 */
	oxygen: number;
	/** 存檔時間，ISO 8601；沒存過是 null，標題畫面用它決定「繼續」要不要出現。 */
	savedAt: string | null;
	/**
	 * 第一次看完片尾（逃離 Kepler-9）的時間，ISO 8601；還沒通關是 null（v3 起）。
	 * 之後選章重玩不會清掉，只有新遊戲會清。
	 */
	clearedAt: string | null;
}

export const OXYGEN_MAX = 100;
export const OXYGEN_MIN = 5;

export const DEFAULT_PROGRESS: ProgressState = {
	chapter: 1,
	furthestChapter: 1,
	position: null,
	character: null,
	solvedTerminals: [],
	learnedCommands: [],
	oxygen: OXYGEN_MAX,
	savedAt: null,
	clearedAt: null,
};

// ---------------------------------------------------------------------------
// 遊玩統計（v3 起）
// ---------------------------------------------------------------------------

/**
 * 一章的遊玩統計，章節結束畫面與標題的「通關紀錄」用。過關不歸零（跟環境反應階梯的 `errorCount` 分開），
 * 只有重玩該章（`resetChapter`、`selectChapter`）與新遊戲會清。
 */
export interface ChapterStats {
	/** /play 在前景可見、這章還沒全解、沒開暫停或設定選單時累計的毫秒數。 */
	playTimeMs: number;
	/** 執行失敗的指令數（跟扣氧氣同一個定義），含過關後在同台打錯的。 */
	errors: number;
	/** 執行到 `hint` 的指令數。 */
	hints: number;
}

/** key 是章節號的字串，例如 `"1"`；沒玩過的章節沒有 key。 */
export type PlayStats = Record<string, ChapterStats>;

// ---------------------------------------------------------------------------
// 終端機 session 與輸出紀錄
// ---------------------------------------------------------------------------

/** 終端機輸出區的一個區塊，UI 顯示與存檔共用。 */
export type OutputEntry =
	| {
			kind: "command";
			id: string;
			/** 執行當下的提示符，例如 `crew@kepler9:~$`。 */
			prompt: string;
			input: string;
			lines: string[];
			isError: boolean;
	  }
	| {
			kind: "system";
			id: string;
			/** 不是玩家打的，例如開啟終端機時的歡迎行或 Tab 候選列表。 */
			lines: string[];
			/**
			 * 選填的語氣，沒給就是一般系統訊息（暗色）；`success` 是過關的「目標達成」行（青綠，4.9）。
			 * 選填是為了相容舊存檔：舊的 system 紀錄沒有這個欄位，照舊顯示暗色。
			 */
			tone?: "success";
	  }
	| {
			kind: "dialogue";
			id: string;
			/** 說話者，目前只有 NOVA。 */
			speaker: "NOVA";
			text: string;
	  };

/** 輸出紀錄最多保留的區塊數，超過就丟最舊的。 */
export const TRANSCRIPT_LIMIT = 200;

export interface TerminalSessionRecord {
	/** `Shell.toState()` 的結果，含 cwd、歷史、hint 計數與修改後的檔案系統。 */
	shell: ShellSessionState;
	/** 輸出區的內容，重新整理後要還原畫面用。 */
	transcript: OutputEntry[];
	/**
	 * 環境反應階梯（4.8）的累積錯誤次數，過關後歸零，跨重整保留。
	 * 選填：舊存檔沒有這個欄位就當 0。`saveTerminalSession` 傳入的紀錄沒帶這個欄位時會保留原值。
	 */
	errorCount?: number;
	/**
	 * 建立這筆 session 時的劇本內容雜湊（v3 起，見 `@/game/story/scriptHash`）。開啟時跟最新劇本比對，
	 * 不同而且這台還沒過關就用新版劇本重建。選填：v2 以前的紀錄沒有，視為「不知道是哪一版」。
	 * `saveTerminalSession` 傳入的紀錄沒帶這個欄位時會保留原值。
	 */
	scriptHash?: string;
}

// ---------------------------------------------------------------------------
// 整個存檔
// ---------------------------------------------------------------------------

/** 劇情旗標，例如 `ch1.sawShadow`。只存 true 的，刪掉就是 false。 */
export type StoryFlags = Record<string, true>;

export interface SaveData {
	progress: ProgressState;
	settings: SettingsState;
	/** key 是終端機 id。 */
	terminals: Record<string, TerminalSessionRecord>;
	storyFlags: StoryFlags;
	/** 每章的遊玩統計（v3 起）。 */
	stats: PlayStats;
}

/** localStorage 的 key 與格式版本。格式有破壞性變更時版本加一並寫 migrate（`./migrate.ts`）。 */
export const SAVE_STORAGE_KEY = "kepler9-save";
export const SAVE_VERSION = 3;

// ---------------------------------------------------------------------------
// store 動作
// ---------------------------------------------------------------------------

export interface GameActions {
	// 設定
	updateSettings: (patch: Partial<SettingsState>) => void;

	// 進度
	setCharacter: (character: CharacterId) => void;
	learnCommand: (name: string) => void;
	markTerminalSolved: (terminalId: string) => void;
	/** 錯誤一次扣 1%，不低於 `OXYGEN_MIN`。 */
	loseOxygen: () => void;
	restoreOxygen: () => void;

	// 終端機 session
	/** 整筆覆蓋；只有 `errorCount` 例外：傳入的紀錄沒帶時保留原值，避免存 shell 狀態時把階梯計數洗掉。 */
	saveTerminalSession: (terminalId: string, record: TerminalSessionRecord) => void;
	/** 只更新輸出紀錄，不動 shell 狀態；超過 `TRANSCRIPT_LIMIT` 時裁掉最舊的。 */
	appendTranscript: (terminalId: string, entries: OutputEntry[]) => void;
	clearTranscript: (terminalId: string) => void;
	/** 更新環境反應階梯的累積錯誤次數，不動 shell 與 transcript；沒有 session 時略過。 */
	setTerminalErrorCount: (terminalId: string, count: number) => void;

	// 劇情旗標
	setFlag: (flag: string) => void;
	clearFlag: (flag: string) => void;

	/** 新遊戲：進度、終端機、旗標全部清掉，設定保留。 */
	resetSave: () => void;
	/** 蓋上 `savedAt`，每台終端機過關與章節結束時呼叫。 */
	touchSave: () => void;

	// 章節
	/** 章節結束按「進入下一章」：`chapter` 加一、氧氣回滿、蓋上 `savedAt`。 */
	advanceChapter: () => void;
	/**
	 * 重玩本章：清掉該章（`ch<n>-` 開頭）的終端機 session 與過關紀錄、該章（`ch<n>.` 開頭）的旗標，氧氣回滿。
	 * 已學指令、外觀、設定與其他章節的進度都保留。
	 */
	resetChapter: (chapter: number) => void;
	/**
	 * 標題畫面選章：跳到到過的第 `chapter` 章並重玩它（等同 `resetChapter` 加切換章節、清位置、蓋 `savedAt`）。
	 * 超過 `furthestChapter` 或小於 1 時不動並回傳 false。
	 */
	selectChapter: (chapter: number) => boolean;
	/** 角色停下時存位置，座標四捨五入成整數。 */
	savePlayerPosition: (position: PlayerPosition) => void;

	// 通關與統計（v3）
	/** 片尾播完時呼叫：第一次才蓋上 `clearedAt`，之後再通關保留第一次的時間。 */
	markGameCleared: () => void;
	/** 每道指令執行後呼叫：錯誤加 `errors`、跑到 hint 加 `hints`，兩者都不是就不寫檔。 */
	recordCommandStats: (chapter: number, execution: { isError: boolean; hintUsed: boolean }) => void;
	/** 累加某章的遊玩時間（毫秒，取整數）；0、負數與非有限數略過。 */
	addPlayTime: (chapter: number, ms: number) => void;
}

export type GameStore = SaveData & GameActions;
