"use client";

/**
 * 右側面板組的「對話紀錄」內容：本章 NOVA 在地圖對話框說過的台詞（設計文件 4.9）。
 *
 * 地圖對話框幾秒後自動淡出、進房台詞每間只說一次，錯過就讀不到，所以在這裡留一份。
 * 換艙區時被略過、沒播出的台詞也照順序列出，標「未播出」。紀錄只在記憶體裡，重新整理後清空。
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { NovaLogEntry } from "./useNovaQueue";

export interface NovaLogPanelProps {
	/** 照說話順序排好的紀錄，來自 `useNovaQueue().history` */
	entries: NovaLogEntry[];
}

export function NovaLogPanel({ entries }: NovaLogPanelProps) {
	const scrollRef = useRef<HTMLDivElement>(null);

	// 最新的在最下面：打開或有新台詞時捲到底
	useEffect(() => {
		const element = scrollRef.current;
		if (element !== null) {
			element.scrollTop = element.scrollHeight;
		}
	}, [entries]);

	return (
		<div className="flex min-h-0 flex-1 flex-col" data-testid="nova-log-panel">
			<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
				{entries.length === 0 ? (
					<p className="py-2 text-base text-game-dim">NOVA 還沒在地圖上說過話</p>
				) : (
					<ol className="flex flex-col gap-2">
						{entries.map((entry) => (
							<NovaLogItem key={entry.id} entry={entry} />
						))}
					</ol>
				)}
			</div>
			<p className="border-t border-game-dim px-3 py-2 text-sm text-game-dim">只記本章地圖上的台詞，重新整理後清空</p>
		</div>
	);
}

/** 單則台詞：左側全息藍邊，跟終端機內嵌的 NOVA 區塊同一個樣式；沒播出的改用暗色邊並加標籤。 */
function NovaLogItem({ entry }: { entry: NovaLogEntry }) {
	const missed = entry.status === "missed";
	return (
		<li className={cn("border-l-[3px] pl-2", missed ? "border-game-dim" : "border-game-holo")}>
			<p className="text-lg break-words whitespace-pre-wrap text-game-text">{entry.text}</p>
			{missed && <span className="text-sm text-game-dim">未播出</span>}
		</li>
	);
}
