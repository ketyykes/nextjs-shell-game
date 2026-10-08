import { cn } from "@/lib/utils";
import type { OutputEntry } from "@/game/store/types";

/** 只接受指令輸出與系統訊息兩種區塊，NOVA 對話交給 `DialogueBlock`。 */
export type OutputBlockEntry = Extract<OutputEntry, { kind: "command" } | { kind: "system" }>;

export interface OutputBlockProps {
	entry: OutputBlockEntry;
}

/** 空字串的行換成不換行空白，讓空行仍佔一行高度（例如 `cat` 檔案裡的空行）。 */
function displayLine(line: string): string {
	if (line === "") {
		return " ";
	}
	return line;
}

const LINE_CLASS = "break-all whitespace-pre-wrap";

/**
 * 渲染一筆指令輸出或系統訊息。
 * - `command`：第一行是提示符加玩家輸入，接著每行輸出；錯誤輸出用琥珀色。
 * - `system`：不是玩家打的（歡迎行、Tab 候選列表），用暗色；`tone: "success"`（過關的「目標達成」行）用青綠成功色。
 */
export function OutputBlock({ entry }: OutputBlockProps) {
	if (entry.kind === "system") {
		let toneClass = "text-game-dim";
		if (entry.tone === "success") {
			toneClass = "text-game-success";
		}
		return (
			<div className={toneClass} data-entry-kind="system">
				{entry.lines.map((line, index) => (
					<div key={index} className={LINE_CLASS}>
						{displayLine(line)}
					</div>
				))}
			</div>
		);
	}

	return (
		<div data-entry-kind="command">
			<div className={LINE_CLASS}>
				<span className="text-game-prompt">{entry.prompt}</span> {entry.input}
			</div>
			{entry.lines.map((line, index) => (
				<div key={index} className={cn(LINE_CLASS, entry.isError && "text-game-amber")}>
					{displayLine(line)}
				</div>
			))}
		</div>
	);
}
