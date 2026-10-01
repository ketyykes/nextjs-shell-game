"use client";

import styles from "./CrtOverlay.module.css";

export interface CrtOverlayProps {
	/** 是否顯示掃描線 */
	scanlines: boolean;
	/** 是否顯示暗角 */
	vignette: boolean;
	/** 是否顯示微閃爍（光敏體質玩家的安全項，使用者可關閉） */
	flicker: boolean;
	/** 覆蓋層的 z-index，預設 50，要蓋在終端機之上 */
	zIndex?: number;
}

/**
 * CRT 畫面效果覆蓋層，由頁面把設定值以 props 餵進來。
 * 三項效果都關閉時不渲染任何 DOM。
 */
export function CrtOverlay({
	scanlines,
	vignette,
	flicker,
	zIndex = 50,
}: CrtOverlayProps) {
	if (!scanlines && !vignette && !flicker) {
		return null;
	}

	return (
		<div
			aria-hidden="true"
			data-testid="crt-overlay"
			className={styles.overlay}
			style={{ zIndex }}
		>
			{scanlines && (
				<div
					data-testid="crt-scanlines"
					className={`${styles.layer} ${styles.scanlines}`}
				/>
			)}
			{vignette && (
				<div
					data-testid="crt-vignette"
					className={`${styles.layer} ${styles.vignette}`}
				/>
			)}
			{flicker && (
				<div
					data-testid="crt-flicker"
					className={`${styles.layer} ${styles.flicker}`}
				/>
			)}
		</div>
	);
}
