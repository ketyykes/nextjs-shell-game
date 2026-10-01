"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface MenuOptionProps {
	selected: boolean;
	/** 滑鼠移入時呼叫，讓選取跟著游標走。 */
	onHover: () => void;
	onClick: () => void;
	children: ReactNode;
	className?: string;
}

/**
 * 像素風選單項：選取中前面有 `▸`、字變全息藍；未選取時留同寬的空白，文字不會左右跳。
 * 鍵盤操作由各選單的 `useMenuNavigation` 處理，這裡只負責呈現與滑鼠。
 */
export function MenuOption({ selected, onHover, onClick, children, className }: MenuOptionProps) {
	let marker = " ";
	if (selected) {
		marker = "▸";
	}

	return (
		<button
			type="button"
			aria-current={selected ? "true" : undefined}
			data-selected={selected}
			onMouseEnter={onHover}
			onClick={onClick}
			className={cn(
				"flex cursor-pointer items-center gap-2 px-2 py-1 text-left font-terminal text-2xl transition-colors focus-visible:outline-none",
				selected && "text-game-holo",
				!selected && "text-game-dim hover:text-game-text",
				className,
			)}
		>
			<span aria-hidden="true" className="inline-block w-4 text-game-holo">
				{marker}
			</span>
			<span>{children}</span>
		</button>
	);
}
