/**
 * 六章劇本共用的小工具。
 *
 * 終端機的身分（id、標題、艙區）不放這裡，直接用 `@/game/story/decks` 的 `deckTerminalIdentity`。
 */

/** 把多行文字接成檔案內容，結尾補換行，跟真的文字檔一樣。 */
export function lines(...content: string[]): string {
	return `${content.join("\n")}\n`;
}
