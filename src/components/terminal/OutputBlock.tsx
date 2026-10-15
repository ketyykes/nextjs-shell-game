"use client";

import { useId, useMemo, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { OutputEntry } from "@/game/store/types";
import { buildOutputFieldLegend, claimLegendAutoExpand } from "./outputFields";
import type { OutputFieldLegend } from "./outputFields";
import { useDisplayedOutputLines } from "./DisplayInstabilityContext";

/** 只接受指令輸出與系統訊息兩種區塊，NOVA 對話交給 `DialogueBlock`。 */
export type OutputBlockEntry = Extract<OutputEntry, { kind: "command" } | { kind: "system" }>;

type CommandEntry = Extract<OutputBlockEntry, { kind: "command" }>;

export interface OutputBlockProps {
	entry: OutputBlockEntry;
	/**
	 * 這筆是終端機開著的時候新產生的輸出（重開終端機還原的舊輸出不要傳）。
	 * 有欄位說明（4.17），而且這種說明在這個頁面還沒自動展開過時，一出現就展開一次。
	 */
	autoExpandLegend?: boolean;
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
 *   `ls -l`、`ps`、`top`、`last` 這類多欄輸出在第一行右側多一個「[?] 欄位說明」，點開在區塊下方列出每一欄的意思（4.17）。
 * - `system`：不是玩家打的（歡迎行、Tab 候選列表），用暗色；`tone: "success"`（過關的「目標達成」行）用青綠成功色。
 */
export function OutputBlock({ entry, autoExpandLegend = false }: OutputBlockProps) {
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

	return <CommandBlock entry={entry} autoExpandLegend={autoExpandLegend} />;
}

interface CommandBlockProps {
	entry: CommandEntry;
	autoExpandLegend: boolean;
}

function CommandBlock({ entry, autoExpandLegend }: CommandBlockProps) {
	// 每打一個字終端機都會重新渲染整個輸出區，entry 物件不變就不重新解析
	const legend = useMemo(() => buildOutputFieldLegend(entry), [entry]);
	// 低氧時指令輸出的少數字元換成亂碼（4.25），系統行與 hint、help、explain 的輸出照原文
	const displayedLines = useDisplayedOutputLines(entry);

	const promptLine = (
		<>
			<span className="text-game-prompt">{entry.prompt}</span> {entry.input}
		</>
	);
	const outputLines = displayedLines.map((line, index) => (
		<div key={index} className={cn(LINE_CLASS, entry.isError && "text-game-amber")}>
			{displayLine(line)}
		</div>
	));

	if (legend === null) {
		return (
			<div data-entry-kind="command">
				<div className={LINE_CLASS}>{promptLine}</div>
				{outputLines}
			</div>
		);
	}

	return (
		<LegendCommandBlock legend={legend} autoExpandLegend={autoExpandLegend} promptLine={promptLine}>
			{outputLines}
		</LegendCommandBlock>
	);
}

/**
 * 擋掉 mousedown 的預設行為：瀏覽器就不會把焦點移到按鈕上，終端機輸入框保持焦點、打字不中斷（同 `SidePanels`）。
 * click 照常觸發。
 */
function keepFocusWhereItIs(event: MouseEvent) {
	event.preventDefault();
}

interface LegendCommandBlockProps {
	legend: OutputFieldLegend;
	autoExpandLegend: boolean;
	promptLine: ReactNode;
	children: ReactNode;
}

/** 有欄位說明的指令區塊：第一行右側是開關按鈕，展開時說明接在輸出下面。 */
function LegendCommandBlock({ legend, autoExpandLegend, promptLine, children }: LegendCommandBlockProps) {
	// 出現的當下決定要不要自動展開：只認新產生的輸出，而且這種說明本頁還沒展開過。
	// StrictMode 會多呼叫一次初始函式，但 React 用的是第一次的結果，第二次回 false 不影響
	const [expanded, setExpanded] = useState(() => autoExpandLegend && claimLegendAutoExpand(legend.id));
	const panelId = useId();

	const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
		// 不往外傳：終端機外層的 onClick 會把焦點拉回輸入框，用鍵盤（Enter、空白鍵）操作的玩家就沒辦法再按一次收合。
		// 滑鼠點擊時 mousedown 已經擋掉，焦點本來就留在輸入框
		event.stopPropagation();
		setExpanded((current) => !current);
	};

	let buttonTone = "text-game-dim";
	if (expanded) {
		buttonTone = "text-game-prompt";
	}

	return (
		<div data-entry-kind="command">
			<div className="flex items-start justify-between gap-3">
				<div className={cn(LINE_CLASS, "min-w-0")}>{promptLine}</div>
				<button
					type="button"
					aria-label={legend.label}
					aria-expanded={expanded}
					aria-controls={expanded ? panelId : undefined}
					onMouseDown={keepFocusWhereItIs}
					onClick={handleClick}
					className={cn(
						"shrink-0 cursor-pointer transition-colors hover:text-game-text focus-visible:text-game-text focus-visible:underline focus-visible:outline-none",
						buttonTone,
					)}
				>
					[?] 欄位說明
				</button>
			</div>
			{children}
			{expanded && <FieldLegendPanel id={panelId} legend={legend} />}
		</div>
	);
}

/** 展開後的說明：例子取自哪一行、欄位表（欄位、例子、說明，一行一欄）、補充說明。 */
function FieldLegendPanel({ id, legend }: { id: string; legend: OutputFieldLegend }) {
	return (
		<div id={id} className="my-1 border border-game-dim/60 px-2 py-1 font-terminal">
			<div className={cn(LINE_CLASS, "text-game-dim")}>
				以這一行為例：<span className="text-game-text">{legend.sampleLine}</span>
			</div>
			<div className="mt-1 overflow-x-auto">
				<table aria-label={legend.label} className="w-full border-collapse">
					<thead>
						<tr className="text-game-dim">
							<th scope="col" className="pr-4 text-left font-normal">
								欄位
							</th>
							<th scope="col" className="pr-4 text-left font-normal">
								例子
							</th>
							<th scope="col" className="text-left font-normal">
								說明
							</th>
						</tr>
					</thead>
					<tbody>
						{legend.rows.map((row) => (
							<tr key={row.field} className="align-top">
								<td className={cn("whitespace-nowrap pr-4 text-game-text", row.detail && "pl-4 text-game-prompt")}>
									{row.field}
								</td>
								{/* 例子不換行，日期時間（2027-08-14 05:30）才不會被拆開；超長的檔名讓表格自己橫向捲動 */}
								<td className="pr-4 whitespace-pre text-game-text">{row.example ?? "—"}</td>
								<td className="text-game-prompt">{row.description}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<div className="mt-1 text-game-prompt">
				{legend.notes.map((note) => (
					<div key={note}>{note}</div>
				))}
			</div>
		</div>
	);
}
