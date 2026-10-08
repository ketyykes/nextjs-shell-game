/**
 * 第一章 HUD 常駐的操作提示（M10-3）。操作方式原本只在 NOVA 開場第三句說一次就消失，
 * 這裡在第一台終端機過關前一直掛在畫面上方中央，避開左上 O2、右上艙區與底部的目標面板、NOVA 對話框、按 E 提示。
 */

/** 第一章第一台終端機，過關後玩家已經會走、會開終端機，提示功成身退。 */
const FIRST_TERMINAL_ID = "ch1-t1";

export interface ControlsHintConditions {
	chapter: number;
	solvedTerminals: readonly string[];
	/** 終端機開著時方向鍵與 Esc 是終端機的操作，提示會誤導，先收起來。 */
	terminalOpen: boolean;
}

/** 只在第一章、T1 還沒過關、終端機沒開時顯示。 */
export function shouldShowControlsHint({ chapter, solvedTerminals, terminalOpen }: ControlsHintConditions): boolean {
	if (chapter !== 1 || terminalOpen) {
		return false;
	}
	return !solvedTerminals.includes(FIRST_TERMINAL_ID);
}

/** 畫面上方中央的一行操作說明；外層 HUD 已是 pointer-events-none。 */
export function ControlsHint() {
	return (
		<div
			className="absolute top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-game-prompt"
			data-testid="controls-hint"
		>
			方向鍵移動 · E 互動 · Esc 選單
		</div>
	);
}
