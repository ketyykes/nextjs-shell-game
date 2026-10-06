"use client";

import { MenuOption } from "./MenuOption";
import { useMenuNavigation } from "./useMenuNavigation";

export interface ChapterOption {
	number: number;
	/** 顯示文字，例如「第二章 資料中心」。 */
	label: string;
}

export interface ChapterSelectPanelProps {
	chapters: readonly ChapterOption[];
	onSelect: (chapter: ChapterOption) => void;
	onBack: () => void;
	/** 重新打開時停在上次選的章節。 */
	initialIndex?: number;
}

/**
 * 標題畫面的選章清單：只列到過的章節，最後一項「返回」。
 * ↑↓ 選擇、Enter 確認、Esc 返回；外層選單要在清單開著時停用自己的鍵盤。
 */
export function ChapterSelectPanel({ chapters, onSelect, onBack, initialIndex = 0 }: ChapterSelectPanelProps) {
	const backIndex = chapters.length;

	function activate(index: number) {
		const chapter = chapters[index];
		if (chapter === undefined) {
			onBack();
			return;
		}
		onSelect(chapter);
	}

	const { selectedIndex, setSelectedIndex } = useMenuNavigation({
		itemCount: chapters.length + 1,
		initialIndex,
		onConfirm: activate,
		onCancel: onBack,
	});

	return (
		<div className="flex flex-col items-start gap-1" data-testid="chapter-select">
			{chapters.map((chapter, index) => (
				<MenuOption
					key={chapter.number}
					selected={index === selectedIndex}
					onHover={() => setSelectedIndex(index)}
					onClick={() => {
						setSelectedIndex(index);
						activate(index);
					}}
				>
					{chapter.label}
				</MenuOption>
			))}
			<MenuOption selected={selectedIndex === backIndex} onHover={() => setSelectedIndex(backIndex)} onClick={onBack}>
				返回
			</MenuOption>
		</div>
	);
}
