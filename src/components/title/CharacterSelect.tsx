"use client";

import { motion } from "motion/react";
import type { CharacterId } from "@/game/store/types";
import { cn } from "@/lib/utils";
import { useMenuNavigation } from "./useMenuNavigation";

export interface CharacterSelectProps {
	/** 初始選取的外觀，預設 "a"。 */
	initial?: CharacterId;
	onConfirm: (character: CharacterId) => void;
	/** 按 Esc 或「返回」。 */
	onBack: () => void;
}

/** 四個外觀，順序即畫面上由左到右的順序；代號 B 已停用不重用（設計文件 4.1）。 */
export const CHARACTER_IDS: readonly CharacterId[] = ["a", "c", "d", "e"];

/** sprite sheet 單格尺寸與整張尺寸（128x192，4x4 格，每格 32x48）。 */
const FRAME_WIDTH = 32;
const FRAME_HEIGHT = 48;
const SHEET_WIDTH = 128;
const SHEET_HEIGHT = 192;
/** 放大倍率。 */
const SCALE = 4;

/** 選中的外觀往上浮的像素。 */
const LIFT_PX = 10;

interface CharacterSpriteProps {
	character: CharacterId;
}

/** 顯示 sprite sheet 第 0 列第 0 幀（面向下站立），整張背景一起放大，避免 transform 造成模糊或佔位錯誤。 */
function CharacterSprite({ character }: CharacterSpriteProps) {
	return (
		<div
			aria-hidden="true"
			data-testid={`character-sprite-${character}`}
			style={{
				width: FRAME_WIDTH * SCALE,
				height: FRAME_HEIGHT * SCALE,
				backgroundImage: `url(/sprites/technician-${character}.png)`,
				backgroundPosition: "0 0",
				backgroundSize: `${SHEET_WIDTH * SCALE}px ${SHEET_HEIGHT * SCALE}px`,
				backgroundRepeat: "no-repeat",
				imageRendering: "pixelated",
			}}
		/>
	);
}

/**
 * 選角畫面（設計文件 4.7）：四個站立 sprite 放大橫排，只有代號，不做背景故事。
 *
 * 鍵盤：←→ 切換、Enter 確認、Esc 返回。滑鼠：點未選取的外觀＝選取，點已選取的外觀＝確認。
 */
export function CharacterSelect({ initial = "a", onConfirm, onBack }: CharacterSelectProps) {
	let initialIndex = CHARACTER_IDS.indexOf(initial);
	if (initialIndex < 0) {
		initialIndex = 0;
	}

	const { selectedIndex, setSelectedIndex } = useMenuNavigation({
		itemCount: CHARACTER_IDS.length,
		orientation: "horizontal",
		initialIndex,
		onConfirm: (index) => {
			const character = CHARACTER_IDS[index];
			if (character !== undefined) {
				onConfirm(character);
			}
		},
		onCancel: onBack,
	});

	function handleCharacterClick(index: number) {
		if (index === selectedIndex) {
			const character = CHARACTER_IDS[index];
			if (character !== undefined) {
				onConfirm(character);
			}
			return;
		}
		setSelectedIndex(index);
	}

	return (
		<div
			className="fixed inset-0 flex flex-col items-center justify-center gap-10 bg-black px-4 text-game-text"
			data-testid="character-select"
		>
			<h1 className="font-title text-2xl text-game-holo sm:text-3xl">選擇外觀</h1>

			<ul aria-label="外觀" className="flex flex-wrap items-end justify-center gap-6 sm:gap-10">
				{CHARACTER_IDS.map((character, index) => {
					const isSelected = index === selectedIndex;
					const code = character.toUpperCase();
					let lift = 0;
					let opacity = 0.4;
					if (isSelected) {
						lift = -LIFT_PX;
						opacity = 1;
					}
					return (
						<li key={character}>
							<button
								type="button"
								aria-label={`外觀 ${code}`}
								aria-pressed={isSelected}
								data-testid={`character-${character}`}
								onClick={() => handleCharacterClick(index)}
								className="flex cursor-pointer flex-col items-center gap-3 focus-visible:outline-none"
							>
								<motion.div
									animate={{ y: lift, opacity }}
									transition={{ duration: 0.18, ease: "easeOut" }}
									className="flex flex-col items-center gap-2"
								>
									<CharacterSprite character={character} />
									<span
										aria-hidden="true"
										className={cn(
											"h-1 w-24 transition-colors",
											isSelected && "bg-game-holo shadow-[0_0_8px_var(--game-holo)]",
											!isSelected && "bg-transparent",
										)}
									/>
								</motion.div>
								<span
									className={cn(
										"font-title text-lg",
										isSelected && "text-game-holo",
										!isSelected && "text-game-dim",
									)}
								>
									{code}
								</span>
							</button>
						</li>
					);
				})}
			</ul>

			<div className="flex flex-col items-center gap-2 font-terminal">
				<p className="text-lg text-game-prompt">劇情不受外觀影響</p>
				<p className="text-base text-game-dim">←→ 選擇 · Enter 確認 · Esc 返回</p>
				<div className="flex gap-8 text-xl">
					<button
						type="button"
						onClick={onBack}
						className="cursor-pointer text-game-dim transition-colors hover:text-game-text focus-visible:outline-none"
					>
						返回
					</button>
					<button
						type="button"
						onClick={() => {
							const character = CHARACTER_IDS[selectedIndex];
							if (character !== undefined) {
								onConfirm(character);
							}
						}}
						className="cursor-pointer text-game-holo transition-colors hover:text-game-text focus-visible:outline-none"
					>
						確認
					</button>
				</div>
			</div>
		</div>
	);
}
