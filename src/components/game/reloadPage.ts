/**
 * 整頁重新載入。換章與重玩本章用它讓 Phaser、Shell 快取與 NOVA 佇列全部重建（#18、#31）。
 * 獨立成一個模組是為了讓測試能 mock：jsdom 的 `window.location.reload` 不能被替換。
 */
export function reloadPage(): void {
	window.location.reload();
}
