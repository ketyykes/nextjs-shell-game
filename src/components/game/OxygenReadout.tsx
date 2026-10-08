"use client";

/**
 * 左上角的 O2 讀數與扣氧當下的即時回饋（M10-9，設計 4.8）。
 *
 * 每次錯誤只扣 1%，低於 30% 才有暗角，正常遊玩幾乎感覺不到；所以扣氧那一刻數字閃琥珀並浮出「-1」，
 * 數值規則不動、不加警示音（4.10）。`prefers-reduced-motion` 時只變色（見 CSS module）。
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import styles from "./OxygenReadout.module.css";

/** 扣氧後數字維持琥珀、「-1」浮字存在的毫秒數，跟 CSS 的浮字動畫等長。 */
export const OXYGEN_LOSS_FLASH_MS = 900;

/** 低於這個值數字常駐琥珀（跟 `OxygenVignette` 的暗角門檻一致）。 */
const OXYGEN_WARNING_THRESHOLD = 30;

export interface OxygenReadoutProps {
	oxygen: number;
	/**
	 * 終端機開著時 true：疊到終端機黑幕（z-40）上面。錯誤只會發生在終端機裡，
	 * 不拉上來的話扣氧回饋會被 55% 黑幕壓暗。
	 */
	raised: boolean;
}

interface OxygenLoss {
	/** 每次扣氧加一，當 key 讓動畫重播。 */
	id: number;
	amount: number;
}

export function OxygenReadout({ oxygen, raised }: OxygenReadoutProps) {
	// 在 render 期間比對上一個值（React 文件「儲存前一次 render 的資訊」的寫法），掛載當下讀存檔來的值不算扣氧
	const [previousOxygen, setPreviousOxygen] = useState(oxygen);
	const [loss, setLoss] = useState<OxygenLoss | null>(null);
	if (oxygen !== previousOxygen) {
		setPreviousOxygen(oxygen);
		if (oxygen < previousOxygen) {
			setLoss({ id: (loss?.id ?? 0) + 1, amount: previousOxygen - oxygen });
		} else {
			setLoss(null);
		}
	}

	// 閃完收掉；連續扣氧時 loss 換成新物件，計時重來
	useEffect(() => {
		if (loss === null) {
			return;
		}
		const timer = window.setTimeout(() => setLoss(null), OXYGEN_LOSS_FLASH_MS);
		return () => {
			window.clearTimeout(timer);
		};
	}, [loss]);

	let colorClass = "text-game-success";
	if (oxygen < OXYGEN_WARNING_THRESHOLD || loss !== null) {
		colorClass = "text-game-amber";
	}

	let layerClass = "z-30";
	if (raised) {
		layerClass = "z-[41]";
	}

	return (
		<div
			className={cn("pointer-events-none absolute top-4 left-4 text-2xl", layerClass)}
			aria-live="polite"
			data-testid="hud-oxygen"
		>
			<span
				key={loss?.id ?? 0}
				className={cn(colorClass, loss !== null && styles.pulse)}
				data-testid="hud-oxygen-value"
			>
				O2 {oxygen}%
			</span>
			{loss !== null && (
				<span key={`loss-${loss.id}`} className={styles.float} aria-hidden="true" data-testid="hud-oxygen-loss">
					-{loss.amount}
				</span>
			)}
		</div>
	);
}
