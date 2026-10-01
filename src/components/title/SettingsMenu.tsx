"use client";

import { motion } from "motion/react";
import type { SettingsState, TextSpeed } from "@/game/store/types";
import { cn } from "@/lib/utils";
import { useMenuNavigation } from "./useMenuNavigation";

export interface SettingsMenuProps {
	settings: SettingsState;
	onChange: (patch: Partial<SettingsState>) => void;
	/** Esc 或「返回」。 */
	onClose: () => void;
}

/** 文字速度由慢到快的順序，←→ 依這個順序切換。 */
export const TEXT_SPEED_ORDER: readonly TextSpeed[] = ["slow", "normal", "fast", "instant"];

const TEXT_SPEED_LABEL: Record<TextSpeed, string> = {
	slow: "慢",
	normal: "普通",
	fast: "快",
	instant: "立即",
};

/** 音量每按一次 ←→ 的變化量（0 到 1 的刻度）。 */
const VOLUME_STEP = 0.1;

type BooleanSettingKey = "flickerEnabled" | "scanlinesEnabled" | "vignetteEnabled" | "muted";

type SettingRow =
	| { kind: "textSpeed"; label: string }
	| { kind: "toggle"; key: BooleanSettingKey; label: string; description?: string }
	| { kind: "volume"; label: string }
	| { kind: "back"; label: string };

/** 項目順序即 ↑↓ 的順序，最後一項「返回」。 */
const ROWS: readonly SettingRow[] = [
	{ kind: "textSpeed", label: "文字速度" },
	{ kind: "toggle", key: "flickerEnabled", label: "閃爍效果", description: "光敏體質請關閉" },
	{ kind: "toggle", key: "scanlinesEnabled", label: "CRT 掃描線" },
	{ kind: "toggle", key: "vignetteEnabled", label: "暗角" },
	{ kind: "volume", label: "音量" },
	{ kind: "toggle", key: "muted", label: "靜音" },
	{ kind: "back", label: "返回" },
];

/** 把音量四捨五入到小數一位，避免 0.8 + 0.1 變成 0.9000000000000001。 */
export function roundVolume(volume: number): number {
	return Math.round(volume * 10) / 10;
}

/** 音量加減一格，夾在 0 到 1 之間。 */
export function stepVolume(volume: number, delta: -1 | 1): number {
	const next = roundVolume(volume + delta * VOLUME_STEP);
	return Math.min(1, Math.max(0, next));
}

/** 文字速度往慢（-1）或快（1）切一段，到頭就停住。 */
export function stepTextSpeed(current: TextSpeed, delta: -1 | 1): TextSpeed {
	const index = TEXT_SPEED_ORDER.indexOf(current);
	const nextIndex = Math.min(TEXT_SPEED_ORDER.length - 1, Math.max(0, index + delta));
	return TEXT_SPEED_ORDER[nextIndex] ?? current;
}

/** 開關值的顯示文字。 */
function formatToggle(value: boolean): string {
	if (value) {
		return "開";
	}
	return "關";
}

/**
 * 設定選單（設計文件 4.7、4.10）：文字速度、閃爍、掃描線、暗角、音量、靜音。
 *
 * 鍵盤：↑↓ 選項目、←→ 改值、Enter 切換開關（文字速度往快一段循環、在「返回」上就是返回）、Esc 返回。
 * 元件不持有設定值，每次改動都透過 `onChange` 傳出差異，由整合者寫回 store。
 */
export function SettingsMenu({ settings, onChange, onClose }: SettingsMenuProps) {
	/** ←→ 調整第 index 項。 */
	function adjust(index: number, delta: -1 | 1) {
		const row = ROWS[index];
		if (row === undefined) {
			return;
		}
		if (row.kind === "textSpeed") {
			const next = stepTextSpeed(settings.textSpeed, delta);
			if (next !== settings.textSpeed) {
				onChange({ textSpeed: next });
			}
			return;
		}
		if (row.kind === "volume") {
			const next = stepVolume(settings.volume, delta);
			if (next !== settings.volume) {
				onChange({ volume: next });
			}
			return;
		}
		if (row.kind === "toggle") {
			onChange({ [row.key]: !settings[row.key] });
		}
	}

	/** Enter 或點擊第 index 項。 */
	function activate(index: number) {
		const row = ROWS[index];
		if (row === undefined) {
			return;
		}
		if (row.kind === "back") {
			onClose();
			return;
		}
		if (row.kind === "toggle") {
			onChange({ [row.key]: !settings[row.key] });
			return;
		}
		if (row.kind === "textSpeed") {
			// Enter 往快一段，到「立即」後繞回「慢」
			const index = TEXT_SPEED_ORDER.indexOf(settings.textSpeed);
			const next = TEXT_SPEED_ORDER[(index + 1) % TEXT_SPEED_ORDER.length] ?? settings.textSpeed;
			onChange({ textSpeed: next });
		}
		// 音量只用 ←→ 調整，Enter 不做事
	}

	const { selectedIndex, setSelectedIndex } = useMenuNavigation({
		itemCount: ROWS.length,
		onConfirm: activate,
		onAdjust: adjust,
		onCancel: onClose,
	});

	/** 第 index 項右側的值。 */
	function renderValue(row: SettingRow, index: number) {
		if (row.kind === "back") {
			return null;
		}
		if (row.kind === "toggle") {
			return (
				<button
					type="button"
					aria-label={`${row.label}：${formatToggle(settings[row.key])}`}
					onClick={() => {
						setSelectedIndex(index);
						activate(index);
					}}
					className="cursor-pointer px-2 focus-visible:outline-none"
				>
					{`[ ${formatToggle(settings[row.key])} ]`}
				</button>
			);
		}

		let valueText = "";
		if (row.kind === "textSpeed") {
			valueText = TEXT_SPEED_LABEL[settings.textSpeed];
		} else {
			valueText = String(Math.round(settings.volume * 100));
		}

		return (
			<span className="flex items-center gap-1">
				<button
					type="button"
					aria-label={`${row.label}減少`}
					onClick={() => {
						setSelectedIndex(index);
						adjust(index, -1);
					}}
					className="cursor-pointer px-1 hover:text-game-text focus-visible:outline-none"
				>
					◀
				</button>
				<span className="inline-block min-w-12 text-center" data-testid={`settings-value-${row.kind}`}>
					{valueText}
				</span>
				<button
					type="button"
					aria-label={`${row.label}增加`}
					onClick={() => {
						setSelectedIndex(index);
						adjust(index, 1);
					}}
					className="cursor-pointer px-1 hover:text-game-text focus-visible:outline-none"
				>
					▶
				</button>
			</span>
		);
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
			<motion.div
				role="dialog"
				aria-modal="true"
				aria-label="設定"
				data-testid="settings-menu"
				initial={{ opacity: 0, scaleY: 0.8 }}
				animate={{ opacity: 1, scaleY: 1 }}
				transition={{ duration: 0.15, ease: "easeOut" }}
				className="flex w-full max-w-lg flex-col gap-4 border-2 border-game-holo/60 bg-game-bg px-6 py-5 font-terminal text-xl text-game-text"
			>
				<h2 className="font-title text-lg text-game-holo">設定</h2>

				<ul className="flex flex-col gap-1">
					{ROWS.map((row, index) => {
						const isSelected = index === selectedIndex;
						let marker = " ";
						if (isSelected) {
							marker = "▸";
						}

						if (row.kind === "back") {
							return (
								<li key={row.kind} className="mt-3">
									<button
										type="button"
										data-selected={isSelected}
										onMouseEnter={() => setSelectedIndex(index)}
										onClick={onClose}
										className={cn(
											"flex cursor-pointer items-center gap-2 focus-visible:outline-none",
											isSelected && "text-game-holo",
											!isSelected && "text-game-dim hover:text-game-text",
										)}
									>
										<span aria-hidden="true" className="inline-block w-4">
											{marker}
										</span>
										{row.label}
									</button>
								</li>
							);
						}

						let key: string = row.kind;
						if (row.kind === "toggle") {
							key = row.key;
						}

						return (
							<li
								key={key}
								data-testid={`settings-row-${key}`}
								data-selected={isSelected}
								onMouseEnter={() => setSelectedIndex(index)}
								className={cn(
									"flex items-center justify-between gap-4",
									isSelected && "text-game-holo",
									!isSelected && "text-game-dim",
								)}
							>
								<span className="flex items-baseline gap-2">
									<span aria-hidden="true" className="inline-block w-4">
										{marker}
									</span>
									<span>{row.label}</span>
									{row.kind === "toggle" && row.description !== undefined && (
										<span className="text-sm text-game-prompt">{row.description}</span>
									)}
								</span>
								{renderValue(row, index)}
							</li>
						);
					})}
				</ul>

				<p className="text-base text-game-dim">↑↓ 選擇 · ←→ 調整 · Esc 返回</p>
			</motion.div>
		</div>
	);
}
