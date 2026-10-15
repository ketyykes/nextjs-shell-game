/**
 * 真實世界橋接頁（設計文件 4.20）列的「六章學過的指令」。
 *
 * 寫死一份而不是在頁面裡 import 劇本：劇本會帶進整章的檔案系統與 zod 檢查，這頁只需要指令名稱。
 * 寫法跟各章終端機的 `teaches` 一模一樣（`ls -a`、`$變數` 這類也照抄），`chapterCommands.test.ts` 逐章比對，
 * 劇本的 teaches 改了這裡沒跟上就會紅。
 */

export interface ChapterCommands {
	chapter: number;
	/** 那一章教的指令與概念，依教的順序。 */
	items: readonly string[];
}

export const CHAPTER_COMMANDS: readonly ChapterCommands[] = [
	{ chapter: 1, items: ["pwd", "ls", "cat", "cd", "..", "ls -l", "~", "ls -a", "Tab", "history", "clear"] },
	{ chapter: 2, items: ["head", "tail", "wc", "*", "grep", "grep -r", "find"] },
	{ chapter: 3, items: ["mkdir", "touch", "cp", "mv", "rm", "rm -r", "cp -r", "mkdir -p"] },
	{ chapter: 4, items: ["echo", ">", "|", "sort", "uniq", ">>"] },
	{ chapter: 5, items: ["man", "env", "export", "$變數", "chmod +r", "chmod 644"] },
	{ chapter: 6, items: ["ps", "top", "kill", "kill -9"] },
];
