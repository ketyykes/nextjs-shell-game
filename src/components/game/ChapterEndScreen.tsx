"use client";

/**
 * 章節結束畫面（設計文件 4.7）。
 *
 * 階段：
 * 1. outro：過場插圖 + NOVA 結尾台詞逐句打字，打完一句停一下再接下一句；
 * 2. recap：「指令回顧卡」列出本章學會的指令與一句話說明；
 * 3. done：有下一章時顯示「進入第 N 章」與「回標題」；最後一章則進 4；沒給下一章也沒給片尾時顯示「下一章開發中」。
 * 4. ending：片尾（設計文件 4.3）：救援船的終端機亮起，逐句打字，最後回標題。
 *
 * 鍵盤：Enter 在每個階段都等同點主要按鈕。outro 與 ending 階段點畫面任何地方也一樣。
 */

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTypewriter } from "@/components/terminal/useTypewriter";
import { getTeachDoc } from "@/game/shell/commands/docs";
import { TEXT_SPEED_MS, type TextSpeed } from "@/game/store/types";

/** 每句台詞打完後預設停留的毫秒數。 */
const DEFAULT_LINE_HOLD_MS = 1500;
/** 回顧卡每一行依序淡入的間隔秒數。 */
const RECAP_STAGGER_SECONDS = 0.08;

type Phase = "outro" | "recap" | "done" | "ending";

/** 下一章的資訊，done 階段顯示用。 */
export interface NextChapterInfo {
	number: number;
	title: string;
	/** 甲板名稱，例如「資料中心」。 */
	deckName: string;
}

/** 片尾：最後一章過關後取代「進入下一章」。 */
export interface EndingInfo {
	/** 逐句打字的片尾文字。 */
	lines: string[];
	illustrationSrc?: string;
}

export interface ChapterEndScreenProps {
	chapterNumber: number;
	chapterTitle: string;
	/** NOVA 結尾台詞，逐句打字 */
	outroLines: string[];
	/** 本章學會的指令（可能含 "ls -a" 這種字串），回顧卡用 */
	learnedCommands: string[];
	textSpeed: TextSpeed;
	/** 過場插圖網址；沒有時顯示純色佔位 */
	illustrationSrc?: string;
	/** 下一章；null 或省略代表沒有下一章 */
	nextChapter?: NextChapterInfo | null;
	/** 最後一章給片尾；有給時 recap 之後直接進 ending 階段 */
	ending?: EndingInfo;
	/** 玩家按「回標題」 */
	onReturnToTitle: () => void;
	/** 玩家按「進入第 N 章」 */
	onNextChapter?: () => void;
	/** 畫面掛載時呼叫一次，整合者用來自動存檔 */
	onMounted?: () => void;
	/** 每句台詞打完後的停留毫秒數，預設 1500；測試可傳 0 */
	lineHoldMs?: number;
	/** outro 已經播過時傳 true：跳過台詞直接從回顧卡開始，玩家仍能走到「進入下一章」 */
	skipOutro?: boolean;
}

interface TypingState {
	/** 目前說到第幾句 */
	lineIndex: number;
	/** 玩家是否已按 Enter 跳過這句的打字動畫 */
	revealed: boolean;
}

/** 取空白前的第一個字當指令名，例如 "ls -a" 查 `ls` 的說明。 */
function getBaseCommandName(learned: string): string {
	const [baseName] = learned.trim().split(/\s+/);
	return baseName ?? learned;
}

/** 查教學項目（指令或 `>`、`|` 這類概念）的一句話說明，查不到回傳空字串。 */
function getCommandSummary(learned: string): string {
	const doc = getTeachDoc(getBaseCommandName(learned));
	if (doc === undefined) {
		return "";
	}
	return doc.summary;
}

interface IllustrationProps {
	src?: string;
	alt: string;
}

/** 過場插圖；沒有圖時顯示深藍底的佔位塊。 */
function Illustration({ src, alt }: IllustrationProps) {
	if (src !== undefined) {
		return (
			// eslint-disable-next-line @next/next/no-img-element -- 像素風過場插圖，不需要 next/image 最佳化
			<img
				src={src}
				alt={alt}
				className="max-h-full w-full max-w-4xl object-contain [image-rendering:pixelated]"
				data-testid="chapter-end-illustration"
			/>
		);
	}
	return (
		<div
			className="flex aspect-video w-full max-w-4xl items-center justify-center border border-game-dim bg-game-holo/10"
			data-testid="chapter-end-illustration-placeholder"
		>
			<span className="font-terminal text-sm text-game-dim">影像訊號遺失</span>
		</div>
	);
}

const PRIMARY_BUTTON_CLASS =
	"cursor-pointer border border-game-holo px-6 py-2 text-lg text-game-holo hover:bg-game-holo/10";
const SECONDARY_BUTTON_CLASS = "cursor-pointer border border-game-dim px-6 py-2 text-lg text-game-dim hover:bg-game-dim/10";

export function ChapterEndScreen({
	chapterNumber,
	chapterTitle,
	outroLines,
	learnedCommands,
	textSpeed,
	illustrationSrc,
	nextChapter = null,
	ending,
	onReturnToTitle,
	onNextChapter,
	onMounted,
	lineHoldMs = DEFAULT_LINE_HOLD_MS,
	skipOutro = false,
}: ChapterEndScreenProps) {
	const [phase, setPhase] = useState<Phase>(skipOutro ? "recap" : "outro");
	const [typing, setTyping] = useState<TypingState>({ lineIndex: 0, revealed: false });

	// onMounted 只在第一次掛載呼叫一次；用 ref 防 StrictMode 的重複執行與父層每次傳新函式
	const onMountedRef = useRef(onMounted);
	const hasCalledMountedRef = useRef(false);
	useEffect(() => {
		onMountedRef.current = onMounted;
	}, [onMounted]);
	useEffect(() => {
		if (hasCalledMountedRef.current) {
			return;
		}
		hasCalledMountedRef.current = true;
		onMountedRef.current?.();
	}, []);

	// outro 與 ending 共用同一套逐句打字：依階段決定台詞來源
	const isTypingPhase = phase === "outro" || phase === "ending";
	let typedLines = outroLines;
	if (phase === "ending") {
		typedLines = ending?.lines ?? [];
	}
	const currentLine = typedLines[typing.lineIndex] ?? "";
	const typed = useTypewriter(currentLine, TEXT_SPEED_MS[textSpeed]);
	let displayedLine = typed;
	if (typing.revealed) {
		displayedLine = currentLine;
	}
	const isTyping = displayedLine !== currentLine;
	const isLastLine = typing.lineIndex >= typedLines.length - 1;

	// 這句打完後停留一段時間，再自動接下一句（最後一句不自動前進，等玩家按 Enter）
	const shouldAutoAdvance = isTypingPhase && !isTyping && !isLastLine;
	useEffect(() => {
		if (!shouldAutoAdvance) {
			return;
		}
		const timer = setTimeout(() => {
			setTyping((previous) => ({ lineIndex: previous.lineIndex + 1, revealed: false }));
		}, lineHoldMs);
		return () => {
			clearTimeout(timer);
		};
	}, [shouldAutoAdvance, typing.lineIndex, lineHoldMs]);

	/** recap 之後往哪走：有片尾進 ending，否則進 done。 */
	function leaveRecap() {
		if (ending !== undefined && ending.lines.length > 0) {
			setTyping({ lineIndex: 0, revealed: false });
			setPhase("ending");
			return;
		}
		setPhase("done");
	}

	/** done 階段的主要動作：有下一章就進下一章，否則回標題。 */
	function leaveDone() {
		if (nextChapter !== null && onNextChapter !== undefined) {
			onNextChapter();
			return;
		}
		onReturnToTitle();
	}

	/** 目前階段的「主要動作」：Enter 與點擊都走這裡。 */
	function handlePrimaryAction() {
		if (phase === "recap") {
			leaveRecap();
			return;
		}
		if (phase === "done") {
			leaveDone();
			return;
		}
		// outro／ending：打字中 → 直接顯示整句；已打完 → 下一句；最後一句已打完 → 下一階段
		if (isTyping) {
			setTyping((previous) => ({ ...previous, revealed: true }));
			return;
		}
		if (!isLastLine) {
			setTyping((previous) => ({ lineIndex: previous.lineIndex + 1, revealed: false }));
			return;
		}
		if (phase === "ending") {
			onReturnToTitle();
			return;
		}
		setPhase("recap");
	}

	// window 的 keydown 只掛一次，透過 ref 永遠呼叫最新的處理函式
	const primaryActionRef = useRef(handlePrimaryAction);
	useEffect(() => {
		primaryActionRef.current = handlePrimaryAction;
	});
	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key !== "Enter") {
				return;
			}
			// 阻止預設行為，避免焦點在按鈕上時 Enter 又觸發一次 click 造成重複前進
			event.preventDefault();
			// 長按不連續跳過
			if (event.repeat) {
				return;
			}
			primaryActionRef.current();
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, []);

	function handleRootClick() {
		// 只有打字階段「點畫面任何地方」才算前進，其餘階段靠按鈕
		if (isTypingPhase) {
			handlePrimaryAction();
		}
	}

	let typingIllustration = illustrationSrc;
	let typingSpeaker = "NOVA";
	let typingAlt = "章節結束的過場插圖";
	if (phase === "ending") {
		typingIllustration = ending?.illustrationSrc;
		typingSpeaker = "救援船終端機";
		typingAlt = "片尾的過場插圖";
	}

	return (
		// 點擊只是 Enter 的滑鼠版本，鍵盤操作已由 window keydown 涵蓋，所以不需要額外的鍵盤事件
		<div
			role="dialog"
			aria-modal="true"
			aria-label="章節結束"
			data-testid="chapter-end-screen"
			className="fixed inset-0 z-45 flex flex-col bg-game-bg font-terminal text-game-text"
			onClick={handleRootClick}
		>
			{isTypingPhase && (
				<div className="flex min-h-0 flex-1 flex-col" data-testid={`chapter-end-${phase}`}>
					<div className="flex min-h-0 flex-1 items-center justify-center p-6">
						<Illustration src={typingIllustration} alt={typingAlt} />
					</div>
					<div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-6 pb-8">
						<div className="flex items-start gap-3 border-l-[3px] border-game-holo bg-game-bg/90 p-3">
							{phase === "outro" && (
								// eslint-disable-next-line @next/next/no-img-element -- 固定尺寸的像素立繪，不需要 next/image 最佳化
								<img
									src="/scenes/nova-eye.png"
									alt="NOVA 的立繪：像瞳孔的像素球體"
									width={64}
									height={64}
									className="size-16 shrink-0 [image-rendering:pixelated]"
								/>
							)}
							<div className="min-w-0 flex-1">
								<div className="text-sm text-game-holo">{typingSpeaker}</div>
								{/* 螢幕閱讀器讀完整句，避免逐字朗讀 */}
								<span className="sr-only">{currentLine}</span>
								<p
									aria-hidden="true"
									className="min-h-[3.5rem] text-xl break-words whitespace-pre-wrap text-game-text"
									data-testid="chapter-end-outro-text"
								>
									{displayedLine}
									{isTyping && <span className="animate-pulse text-game-holo">▌</span>}
								</p>
							</div>
						</div>
						<p className="h-5 text-right text-sm text-game-dim">
							{isLastLine && !isTyping && (
								<span className="animate-pulse" data-testid="chapter-end-continue-hint">
									{phase === "ending" ? "按 Enter 回標題" : "按 Enter 繼續"}
								</span>
							)}
						</p>
					</div>
				</div>
			)}

			{phase === "recap" && (
				<div
					className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-6"
					data-testid="chapter-end-recap"
				>
					<h2 className="text-center font-title text-xl leading-relaxed text-game-success">
						{`第 ${chapterNumber} 章 ${chapterTitle} 完成`}
					</h2>
					<section aria-label="指令回顧" className="w-full max-w-xl border border-game-dim bg-game-bg p-4">
						<h3 className="mb-3 border-b border-game-dim pb-2 text-lg text-game-holo">指令回顧</h3>
						<ul className="flex flex-col gap-2">
							{learnedCommands.map((command, index) => (
								<motion.li
									key={`${command}-${index}`}
									className="flex items-baseline gap-4"
									initial={{ opacity: 0, y: 6 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.25, delay: index * RECAP_STAGGER_SECONDS }}
								>
									<span className="w-32 shrink-0 text-lg text-game-holo">{command}</span>
									<span className="text-base text-game-text">{getCommandSummary(command)}</span>
								</motion.li>
							))}
						</ul>
					</section>
					<button type="button" onClick={handlePrimaryAction} className={PRIMARY_BUTTON_CLASS}>
						繼續
					</button>
				</div>
			)}

			{phase === "done" && nextChapter !== null && (
				<div
					className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-6 text-center"
					data-testid="chapter-end-done"
				>
					<h2 className="font-title text-2xl leading-relaxed text-game-text">{`第 ${nextChapter.number} 章 ${nextChapter.title}`}</h2>
					<p className="text-base text-game-dim">{`${nextChapter.deckName}在前方。進度已存檔，技師。`}</p>
					<div className="flex gap-4">
						<button type="button" onClick={handlePrimaryAction} className={PRIMARY_BUTTON_CLASS}>
							{`進入第 ${nextChapter.number} 章`}
						</button>
						<button type="button" onClick={onReturnToTitle} className={SECONDARY_BUTTON_CLASS}>
							回標題
						</button>
					</div>
				</div>
			)}

			{phase === "done" && nextChapter === null && (
				<div
					className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-6 text-center"
					data-testid="chapter-end-done"
				>
					<h2 className="font-title text-2xl leading-relaxed text-game-text">下一章開發中</h2>
					<p className="text-base text-game-dim">進度已存檔。下次再見，技師。</p>
					<button type="button" onClick={handlePrimaryAction} className={PRIMARY_BUTTON_CLASS}>
						回標題
					</button>
				</div>
			)}
		</div>
	);
}
