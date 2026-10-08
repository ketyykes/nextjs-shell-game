"use client";

import { formatPlayTime, totalStats } from "@/game/store/stats";
import type { ChapterStats, PlayStats } from "@/game/store/types";
import type { ChapterOption } from "./ChapterSelectPanel";
import { MenuOption } from "./MenuOption";
import { useMenuNavigation } from "./useMenuNavigation";

/** 通關紀錄要顯示的資料：章節清單（全部章節）與存檔的統計。 */
export interface ClearRecord {
	chapters: readonly ChapterOption[];
	stats: PlayStats;
}

export interface ClearRecordPanelProps {
	record: ClearRecord;
	onBack: () => void;
}

/** 沒有紀錄的格子（統計上線前玩完的章節、還沒玩過的章節）。 */
const EMPTY_CELL = "—";

interface StatCellsProps {
	stats: ChapterStats | undefined;
}

function StatCells({ stats }: StatCellsProps) {
	if (stats === undefined) {
		return (
			<>
				<td className="px-3 text-right">{EMPTY_CELL}</td>
				<td className="px-3 text-right">{EMPTY_CELL}</td>
				<td className="px-3 text-right">{EMPTY_CELL}</td>
			</>
		);
	}
	return (
		<>
			<td className="px-3 text-right">{formatPlayTime(stats.playTimeMs)}</td>
			<td className="px-3 text-right">{stats.errors}</td>
			<td className="px-3 text-right">{stats.hints}</td>
		</>
	);
}

/**
 * 標題畫面的「通關紀錄」（M14-1）：每章用時、指令出錯與看提示次數，加總計。
 * 只陳述數字不評分（4.8 不懲罰探索）。Enter、Esc 或點「返回」回標題選單。
 */
export function ClearRecordPanel({ record, onBack }: ClearRecordPanelProps) {
	const { selectedIndex, setSelectedIndex } = useMenuNavigation({
		itemCount: 1,
		onConfirm: onBack,
		onCancel: onBack,
	});
	const total = totalStats(record.stats);

	return (
		<section
			aria-label="通關紀錄"
			className="flex flex-col items-center gap-3 font-terminal text-xl"
			data-testid="clear-record"
		>
			<table className="text-game-text">
				<thead className="text-base text-game-dim">
					<tr>
						<th className="px-3 text-left font-normal">章節</th>
						<th className="px-3 text-right font-normal">用時</th>
						<th className="px-3 text-right font-normal">出錯</th>
						<th className="px-3 text-right font-normal">提示</th>
					</tr>
				</thead>
				<tbody>
					{record.chapters.map((chapter) => (
						<tr key={chapter.number}>
							<td className="px-3 text-left text-game-holo">{chapter.label}</td>
							<StatCells stats={record.stats[String(chapter.number)]} />
						</tr>
					))}
				</tbody>
				<tfoot className="border-t border-game-dim">
					<tr>
						<td className="px-3 text-left text-game-prompt">總計</td>
						<StatCells stats={total} />
					</tr>
				</tfoot>
			</table>
			<MenuOption selected={selectedIndex === 0} onHover={() => setSelectedIndex(0)} onClick={onBack}>
				返回
			</MenuOption>
		</section>
	);
}
