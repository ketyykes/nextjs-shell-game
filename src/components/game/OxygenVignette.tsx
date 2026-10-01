"use client";

import styles from "./OxygenVignette.module.css";

export interface OxygenVignetteProps {
	/** 目前氧氣百分比（0 到 100） */
	oxygen: number;
}

/** 氧氣低於此值開始出現警示暗角 */
const OXYGEN_WARNING_THRESHOLD = 30;

/**
 * 依氧氣量計算暗角強度：30% 時為 0（幾乎看不到），0% 以下為 1。
 */
function getVignetteOpacity(oxygen: number): number {
	const ratio = (OXYGEN_WARNING_THRESHOLD - oxygen) / OXYGEN_WARNING_THRESHOLD;
	return Math.min(1, Math.max(0, ratio));
}

/**
 * 氧氣低於 30% 時，畫面邊緣出現紅琥珀色暗角，氧氣越低越明顯。
 */
export function OxygenVignette({ oxygen }: OxygenVignetteProps) {
	if (!(oxygen < OXYGEN_WARNING_THRESHOLD)) {
		return null;
	}

	return (
		<div
			aria-hidden="true"
			data-testid="oxygen-vignette"
			className={styles.vignette}
			style={{ opacity: getVignetteOpacity(oxygen) }}
		/>
	);
}
