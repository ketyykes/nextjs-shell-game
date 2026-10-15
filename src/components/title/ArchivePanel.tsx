"use client";

/**
 * 標題畫面的「檔案櫃」（設計文件 4.24）：通關後才有，把六章的關鍵檔案與一條時間軸整理在一處。
 *
 * - 第一層：六章、時間軸、返回。↑↓ 選擇、Enter 打開、Esc 回標題選單。
 * - 第二層（一章或時間軸）：每列一份檔案（或一筆事件），Enter 或點一下展開全文，一次只展開一份；
 *   Esc 或「返回」回第一層，選取停在剛才打開的那一項。
 * - 檔案全文從劇本即時讀（`@/game/story/archive`），已找到的阿彬留言接在那一章的檔案後面，沒找到的不列。
 *
 * 這個元件會把六章劇本與虛擬檔案系統帶進來，標題頁一律經 `ArchivePanelDynamic` 動態載入，不進首載。
 */

import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { findTerminal } from "@/game/chapters";
import { CHAPTER_METAS, chapterLabel } from "@/game/chapters/meta";
import { useGameStore } from "@/game/store";
import { ARCHIVE_TIMELINE, chapterArchiveEntries, timelineArchiveEntries, type ArchiveEntry } from "@/game/story/archive";
import { cn } from "@/lib/utils";
import { MenuOption } from "./MenuOption";
import { useMenuNavigation } from "./useMenuNavigation";

export interface ArchivePanelProps {
	/** 第一層按 Esc 或「返回」：回標題選單。 */
	onClose: () => void;
}

/** 目前看的是哪一層。 */
type ArchiveView = { kind: "index" } | { kind: "chapter"; chapter: number } | { kind: "timeline" };

/** 第一層時間軸那一列的位置（六章之後）。 */
const TIMELINE_ROW = CHAPTER_METAS.length;

/** 展開後劇本裡找不到檔案時的替代文字（正常不會出現，`archive.test.ts` 核對過每一份都在）。 */
const MISSING_CONTENT = "（劇本裡找不到這份檔案。）";

/**
 * 游標真的動了才算滑鼠移入。第二層的清單會捲動（鍵盤選取跟著捲、PgUp／PgDn），
 * 列表從靜止的游標底下滑過時瀏覽器也會發 mouseenter，選取若跟著跑，鍵盤選到的那一列就被搶走了。
 */
function pointerMoved(event: ReactMouseEvent): boolean {
	return event.movementX !== 0 || event.movementY !== 0;
}

/** 第二層「返回」的選取改由外層的 mousemove 處理（見 `pointerMoved`），MenuOption 自己的 mouseenter 不理。 */
function ignoreHover() {}

export function ArchivePanel({ onClose }: ArchivePanelProps) {
	const found = useGameStore((state) => state.abinNotes.found);
	const [view, setView] = useState<ArchiveView>({ kind: "index" });
	// 回第一層時選取停在剛才打開的那一項
	const [indexRow, setIndexRow] = useState(0);
	const scrollRef = useRef<HTMLDivElement>(null);

	// 換層時把焦點放回捲動區，PgUp／PgDn 才捲得動（點過的按鈕卸載後焦點會掉到 body）
	useEffect(() => {
		scrollRef.current?.focus({ preventScroll: true });
	}, [view]);

	function openRow(row: number) {
		setIndexRow(row);
		if (row === TIMELINE_ROW) {
			setView({ kind: "timeline" });
			return;
		}
		setView({ kind: "chapter", chapter: CHAPTER_METAS[row].chapter });
	}

	function backToIndex() {
		setView({ kind: "index" });
	}

	let subtitle = "";
	let hint = "↑↓ 選擇 · Enter 打開 · Esc 返回";
	if (view.kind === "chapter") {
		subtitle = chapterLabel(view.chapter);
		hint = "↑↓ 選擇 · Enter 展開／收起 · PgUp／PgDn 捲動 · Esc 回上一層";
	}
	if (view.kind === "timeline") {
		subtitle = "時間軸（站上紀錄的時間，UTC）";
		hint = "↑↓ 選擇 · Enter 展開來源檔案 · PgUp／PgDn 捲動 · Esc 回上一層";
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
			<motion.div
				role="dialog"
				aria-modal="true"
				aria-label="檔案櫃"
				data-testid="archive-panel"
				initial={{ opacity: 0, scaleY: 0.8 }}
				animate={{ opacity: 1, scaleY: 1 }}
				transition={{ duration: 0.15, ease: "easeOut" }}
				className="flex max-h-[88vh] w-full max-w-3xl flex-col gap-3 border-2 border-game-holo/60 bg-game-bg px-6 py-5 font-terminal text-xl text-game-text"
			>
				<h2 className="flex items-baseline gap-4">
					<span className="font-title text-lg text-game-holo">檔案櫃</span>
					{subtitle !== "" && <span className="text-xl text-game-prompt">{subtitle}</span>}
				</h2>

				<div ref={scrollRef} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto pr-2 focus:outline-none">
					{view.kind === "index" && (
						<ArchiveIndex found={found} initialIndex={indexRow} onOpen={openRow} onClose={onClose} />
					)}
					{view.kind === "chapter" && (
						<ArchiveEntryList entries={chapterArchiveEntries(view.chapter, found, findTerminal)} onBack={backToIndex} />
					)}
					{view.kind === "timeline" && (
						<ArchiveEntryList entries={timelineArchiveEntries(findTerminal)} onBack={backToIndex} />
					)}
				</div>

				<p className="text-base text-game-dim">{hint}</p>
			</motion.div>
		</div>
	);
}

interface ArchiveIndexProps {
	found: readonly string[];
	initialIndex: number;
	onOpen: (row: number) => void;
	onClose: () => void;
}

/** 第一層：六章（右邊小字是份數，含已找到的阿彬留言）、時間軸、返回。 */
function ArchiveIndex({ found, initialIndex, onOpen, onClose }: ArchiveIndexProps) {
	const chapterCounts = useMemo(
		() => CHAPTER_METAS.map((meta) => chapterArchiveEntries(meta.chapter, found, findTerminal).length),
		[found],
	);
	const backRow = TIMELINE_ROW + 1;

	function activate(row: number) {
		if (row === backRow) {
			onClose();
			return;
		}
		onOpen(row);
	}

	const { selectedIndex, setSelectedIndex } = useMenuNavigation({
		itemCount: backRow + 1,
		initialIndex,
		onConfirm: activate,
		onCancel: onClose,
	});

	return (
		<ul className="flex flex-col items-start gap-1">
			{CHAPTER_METAS.map((meta, row) => (
				<li key={meta.chapter}>
					<MenuOption selected={selectedIndex === row} onHover={() => setSelectedIndex(row)} onClick={() => activate(row)}>
						{chapterLabel(meta.chapter)}
						<span className="ms-3 text-base text-game-dim">{`${chapterCounts[row]} 份`}</span>
					</MenuOption>
				</li>
			))}
			<li>
				<MenuOption
					selected={selectedIndex === TIMELINE_ROW}
					onHover={() => setSelectedIndex(TIMELINE_ROW)}
					onClick={() => activate(TIMELINE_ROW)}
				>
					時間軸
					<span className="ms-3 text-base text-game-dim">{`${ARCHIVE_TIMELINE.length} 筆`}</span>
				</MenuOption>
			</li>
			<li>
				<MenuOption selected={selectedIndex === backRow} onHover={() => setSelectedIndex(backRow)} onClick={onClose}>
					返回
				</MenuOption>
			</li>
		</ul>
	);
}

interface ArchiveEntryListProps {
	entries: readonly ArchiveEntry[];
	onBack: () => void;
}

/** 第二層：一章的檔案或時間軸，最後一項「返回」。Enter 或點一下展開選中的那一列，一次只展開一列。 */
function ArchiveEntryList({ entries, onBack }: ArchiveEntryListProps) {
	const [expandedKey, setExpandedKey] = useState<string | null>(null);
	const backRow = entries.length;

	function toggle(row: number) {
		const entry = entries[row];
		if (entry === undefined) {
			onBack();
			return;
		}
		setExpandedKey((current) => {
			if (current === entry.key) {
				return null;
			}
			return entry.key;
		});
	}

	const { selectedIndex, setSelectedIndex } = useMenuNavigation({
		itemCount: entries.length + 1,
		onConfirm: toggle,
		onCancel: onBack,
	});

	return (
		<div className="flex flex-col gap-2">
			<ul className="flex flex-col gap-2">
				{entries.map((entry, row) => (
					<ArchiveEntryRow
						key={entry.key}
						entry={entry}
						selected={selectedIndex === row}
						expanded={expandedKey === entry.key}
						onHover={() => setSelectedIndex(row)}
						onClick={() => {
							setSelectedIndex(row);
							toggle(row);
						}}
					/>
				))}
			</ul>
			<div
				onMouseMove={(event) => {
					if (pointerMoved(event)) {
						setSelectedIndex(backRow);
					}
				}}
			>
				<MenuOption selected={selectedIndex === backRow} onHover={ignoreHover} onClick={onBack}>
					返回
				</MenuOption>
			</div>
		</div>
	);
}

interface ArchiveEntryRowProps {
	entry: ArchiveEntry;
	selected: boolean;
	expanded: boolean;
	onHover: () => void;
	onClick: () => void;
}

/** 一列：選取標記、標題與小字，展開時下面接檔案全文。 */
function ArchiveEntryRow({ entry, selected, expanded, onHover, onClick }: ArchiveEntryRowProps) {
	const rowRef = useRef<HTMLLIElement>(null);

	// 用鍵盤往下選時跟著捲；展開後也確保這一列還在畫面裡
	useEffect(() => {
		if (selected) {
			rowRef.current?.scrollIntoView?.({ block: "nearest" });
		}
	}, [selected, expanded]);

	let marker = " ";
	if (selected) {
		marker = "▸";
	}

	return (
		<li ref={rowRef}>
			<button
				type="button"
				aria-current={selected ? "true" : undefined}
				aria-expanded={expanded}
				data-selected={selected}
				onMouseMove={(event) => {
					if (pointerMoved(event)) {
						onHover();
					}
				}}
				onClick={onClick}
				className={cn(
					"flex w-full cursor-pointer items-start gap-2 px-2 py-1 text-left font-terminal transition-colors focus-visible:outline-none",
					selected && "text-game-holo",
					!selected && "text-game-text",
				)}
			>
				<span aria-hidden="true" className="inline-block w-4 shrink-0 text-xl text-game-holo">
					{marker}
				</span>
				<EntryHeading entry={entry} />
			</button>
			{expanded && (
				<pre
					className="ms-8 mt-1 border-l-[3px] border-game-prompt pl-3 font-terminal text-xl break-words whitespace-pre-wrap text-game-text"
					data-testid="archive-entry-content"
				>
					{entry.content?.trimEnd() ?? MISSING_CONTENT}
				</pre>
			)}
		</li>
	);
}

/** 一列的文字：檔案是路徑、所在終端機與時間、說明；時間軸是時間、事件與來源。 */
function EntryHeading({ entry }: { entry: ArchiveEntry }) {
	if (entry.kind === "event") {
		return (
			<span className="flex min-w-0 flex-col">
				<span className="text-lg text-game-prompt">{entry.time}</span>
				<span className="text-xl break-words">{entry.heading}</span>
				<span className="text-base break-all text-game-dim">{`來源：${entry.terminalTitle} ${entry.path}`}</span>
			</span>
		);
	}

	let meta = `${entry.terminalTitle} · ${entry.time}`;
	if (entry.kind === "abinNote") {
		meta = `阿彬的留言 · ${meta}`;
	}
	return (
		<span className="flex min-w-0 flex-col">
			<span className="text-xl break-all">{entry.heading}</span>
			<span className="text-base text-game-dim">{meta}</span>
			{entry.summary !== null && <span className="text-lg break-words text-game-text">{entry.summary}</span>}
		</span>
	);
}
