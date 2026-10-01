/**
 * 第三章與第五章檔案操作指令（mkdir、touch、cp、mv、rm、chmod）的說明資料，由 `docs.ts` 合併進 `COMMAND_DOCS`。
 * 範例用第三章工程艙的世界觀檔名（被刪掉要重建的反應爐設定目錄 `/deck3/reactor/config/`，
 * 裡面有 `core.cfg`、`coolant.cfg`，還有 `backup/` 備份）；chmod 用第五章艦橋的封存日誌。
 */

import type { CommandDoc } from "../types";

export const FILE_COMMAND_DOCS: Record<string, CommandDoc> = {
	mkdir: {
		name: "mkdir",
		summary: "建立新的目錄",
		usage: "mkdir [-p] <目錄>...",
		description: [
			"mkdir 是 make directory 的縮寫，用來建立新的目錄，也就是新的資料夾。",
			"可以一次給好幾個名稱，mkdir 會全部建出來；名稱已經存在的話會提醒你。",
			"上一層目錄不存在時會失敗，加上 -p 就會連上一層一起建，而且目錄已經存在也不會報錯。",
			"建好之後用 ls 看看，新目錄的名稱後面會有 /。",
		],
		examples: [
			{ command: "mkdir config", explanation: "在目前的目錄底下建立 config 目錄" },
			{ command: "mkdir /deck3/reactor/config", explanation: "用絕對路徑重建被刪掉的反應爐設定目錄" },
			{ command: "mkdir -p config/backup", explanation: "連 config 一起建，再在裡面建 backup" },
		],
	},
	touch: {
		name: "touch",
		summary: "建立空檔案，或更新檔案的修改時間",
		usage: "touch <檔案>...",
		description: [
			"touch 會建立一個內容是空的新檔案，常用來先把檔名佔好。",
			"如果檔案已經存在，touch 不會動它的內容，只會把修改時間改成現在。",
			"可以一次給好幾個檔名；檔案所在的目錄必須先存在，不存在的話先用 mkdir 建。",
			"用 ls -l 可以看到檔案的修改時間有沒有變。",
		],
		examples: [
			{ command: "touch core.cfg", explanation: "在目前的目錄建立一個空的 core.cfg" },
			{ command: "touch /deck3/reactor/config/coolant.cfg", explanation: "在反應爐設定目錄裡建立空的冷卻設定檔" },
			{ command: "touch core.cfg coolant.cfg", explanation: "一次建立兩個空檔案" },
		],
	},
	cp: {
		name: "cp",
		summary: "複製檔案或目錄",
		usage: "cp [-r] <來源>... <目的地>",
		description: [
			"cp 是 copy 的縮寫，會把來源複製一份到目的地，原本的檔案還在。",
			"目的地是已經存在的目錄時，會複製進去並保留原本的名字；不是目錄的話，就當成複製品的新名字。",
			"一次複製多個來源時，最後一個參數必須是已經存在的目錄。",
			"cp 預設只複製檔案，要複製整個目錄（連同裡面的東西）一定要加 -r。",
			"目的地已經有同名檔案時會直接覆蓋，複製前先用 ls 確認一下。",
		],
		examples: [
			{ command: "cp backup/core.cfg config/", explanation: "把備份裡的核心設定複製到 config 目錄" },
			{ command: "cp backup/core.cfg backup/coolant.cfg config/", explanation: "一次把兩個設定檔複製進 config" },
			{ command: "cp -r backup config", explanation: "把整個 backup 目錄複製一份，取名為 config" },
		],
	},
	mv: {
		name: "mv",
		summary: "搬移檔案或目錄，也可以用來改名",
		usage: "mv <來源>... <目的地>",
		description: [
			"mv 是 move 的縮寫，會把來源搬到目的地，原本的位置就沒有了。",
			"目的地是已經存在的目錄時會搬進去；不是目錄的話就是改名，所以 mv 也是改名的指令。",
			"搬目錄不用加 -r，整個目錄會連同裡面的東西一起搬。",
			"目的地已經有同名檔案時會直接覆蓋，搬之前先用 ls 確認一下。",
		],
		examples: [
			{ command: "mv core.cfg config/", explanation: "把 core.cfg 搬進 config 目錄" },
			{ command: "mv coolant.cfg.bak coolant.cfg", explanation: "把檔案改名成 coolant.cfg" },
			{ command: "mv backup/core.cfg backup/coolant.cfg config/", explanation: "一次把兩個設定檔搬進 config" },
		],
	},
	rm: {
		name: "rm",
		summary: "刪除檔案或目錄",
		usage: "rm [-r] [-f] <路徑>...",
		description: [
			"rm 是 remove 的縮寫，會刪除檔案。這裡沒有資源回收筒，刪了就救不回來，按 Enter 前請再看一次。",
			"rm 預設只刪檔案，要刪目錄（連同裡面所有東西）要加 -r。",
			"加上 -f 時，要刪的東西不存在也不會報錯；-r 和 -f 可以合在一起寫成 -rf。",
			"不確定的話，先用 ls 看清楚、或用 cp 備份一份再刪。",
		],
		examples: [
			{ command: "rm config/core.cfg", explanation: "刪除 config 裡的 core.cfg" },
			{ command: "rm -r config", explanation: "連同裡面的檔案，刪除整個 config 目錄" },
			{ command: "rm -rf /deck3/reactor/config", explanation: "強制刪除整個設定目錄，不存在也不報錯；小心使用" },
		],
	},
	chmod: {
		name: "chmod",
		summary: "改變檔案的權限",
		usage: "chmod <權限> <路徑>...",
		description: [
			"每個檔案都有權限，用 ls -l 看第一欄，例如 -rw-r--r--：r 是讀取、w 是寫入、x 是執行，- 代表沒有。",
			"九個字母三個一組，依序是擁有者、同群組、其他人；沒有 r 的話 cat 就讀不到。",
			"符號寫法：+ 加上、- 拿掉、= 設成，前面可以加 u（擁有者）、g（群組）、o（其他人），不寫就是三組都改。",
			"數字寫法：每組用一個數字，r 是 4、w 是 2、x 是 1 加起來，例如 644 就是 rw-r--r--。",
		],
		examples: [
			{ command: "chmod +r /deck5/captain/sealed/log_final.txt", explanation: "把讀取權限加回封存日誌，之後就能用 cat 讀" },
			{ command: "chmod u+r log_final.txt", explanation: "只幫擁有者加上讀取權限" },
			{ command: "chmod 644 /deck5/captain/sealed/log_final.txt", explanation: "用數字設成 rw-r--r--，擁有者可讀寫、其他人可讀" },
			{ command: "chmod o-r log_final.txt", explanation: "拿掉其他人的讀取權限" },
		],
	},
};

/** 這組指令在 `help` 與側邊面板的顯示順序。 */
export const FILE_COMMAND_ORDER: string[] = ["mkdir", "touch", "cp", "mv", "rm", "chmod"];
