import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StaticPage, StaticSection } from "@/components/static-page/StaticPage";
import { chapterLabel } from "@/game/chapters/meta";
import { CHAPTER_COMMANDS } from "./chapterCommands";

export const metadata: Metadata = {
	title: "Kepler-9 — 下一步：真的終端機",
	description: "通關之後，怎麼在自己的電腦打開終端機、跟遊戲哪裡不一樣，以及接下來可以學什麼。",
};

/**
 * 指令與按鍵：終端機的青綠色，跟內文分得開。字型要再指定一次 font-terminal，
 * 不然 `code` 會吃到 Tailwind 預設的系統等寬字型；不禁止換行，手機上長指令才不會撐出畫面。
 */
function Code({ children }: { children: ReactNode }) {
	return <code className="font-terminal text-game-success">{children}</code>;
}

/** 表格外面包一層，手機上太寬時橫向捲動，不撐破版面。 */
function TableFrame({ children }: { children: ReactNode }) {
	return <div className="overflow-x-auto">{children}</div>;
}

const TABLE_CLASS = "w-full border-collapse text-left text-lg sm:text-xl";
const HEAD_CELL_CLASS = "border-b-2 border-game-dim px-2 py-1 font-normal text-game-prompt";
const CELL_CLASS = "border-b border-game-dim/50 px-2 py-2 align-top";

/** 遊戲跟真的 shell 的差異表，一列一件事。 */
const DIFFERENCES: readonly { topic: ReactNode; game: ReactNode; real: ReactNode }[] = [
	{
		topic: "求助",
		game: (
			<>
				<Code>hint</Code>、<Code>help</Code>、<Code>explain</Code> 是遊戲專用的：給提示、列出學過的指令、拆解一行指令
			</>
		),
		real: (
			<>
				沒有這三個。查用法用 <Code>man 指令</Code>（例如 <Code>man ls</Code>）或 <Code>指令 --help</Code>，也可以另外安裝{" "}
				<Code>tldr</Code> 看常用範例
			</>
		),
	},
	{
		topic: "錯誤訊息",
		game: "繁體中文，還會猜你想打什麼",
		real: "英文，通常只有一行（對照見下一節）",
	},
	{
		topic: <Code>man</Code>,
		game: "繁體中文的說明",
		real: (
			<>
				多半是英文，按 <Code>q</Code> 離開
			</>
		),
	},
	{
		topic: <Code>rm</Code>,
		game: "刪錯了，重玩本章檔案就回來",
		real: (
			<>
				沒有回收桶，刪了就沒了；<Code>rm -r</Code> 按 Enter 之前先看清楚路徑
			</>
		),
	},
	{
		topic: <Code>sudo</Code>,
		game: "一律被拒絕",
		real: "真的會用管理員權限執行，會要你輸入自己的登入密碼；不確定在做什麼就不要加",
	},
	{
		topic: <Code>kill</Code>,
		game: "停掉的是站上虛構的程序",
		real: "真的會結束那個程式，還沒存檔的東西就沒了",
	},
	{
		topic: <Code>export</Code>,
		game: "設好的變數跟著那台終端機存檔",
		real: (
			<>
				只在目前這個視窗有效，關掉就沒了；要每次打開都有，寫進 <Code>~/.zshrc</Code>（bash 是 <Code>~/.bashrc</Code>）
			</>
		),
	},
];

/** 英文錯誤訊息對照；`cause` 接在「通常是」後面。 */
const ERROR_MESSAGES: readonly { message: string; meaning: string; cause: ReactNode }[] = [
	{
		message: "No such file or directory",
		meaning: "沒有這個檔案或目錄",
		cause: (
			<>
				路徑打錯，或不在你以為的目錄；先 <Code>pwd</Code>、<Code>ls</Code> 看看
			</>
		),
	},
	{
		message: "Permission denied",
		meaning: "權限不足",
		cause: (
			<>
				檔案權限不允許，用 <Code>ls -l</Code> 看權限
			</>
		),
	},
	{
		message: "command not found",
		meaning: "找不到指令",
		cause: "指令拼錯，或那個程式還沒安裝",
	},
	{
		message: "Is a directory",
		meaning: "這是目錄",
		cause: (
			<>
				對目錄用了 <Code>cat</Code> 這類讀檔案的指令
			</>
		),
	},
	{
		message: "Not a directory",
		meaning: "這不是目錄",
		cause: (
			<>
				把 <Code>cd</Code> 用在檔案上，或路徑中間夾了檔案名稱
			</>
		),
	},
];

/** 真的 shell 多出來的按鍵。 */
const SHELL_KEYS: readonly { keys: string; effect: ReactNode }[] = [
	{
		keys: "Ctrl+C",
		effect: "中斷正在跑的指令。在終端機裡它不是「複製」：macOS 複製是 ⌘C，Windows Terminal 要先選取文字 Ctrl+C 才是複製",
	},
	{
		keys: "Ctrl+D",
		effect: (
			<>
				在空白的提示符按，等於輸入 <Code>exit</Code>，關掉這個 shell
			</>
		),
	},
	{
		keys: "Ctrl+L",
		effect: (
			<>
				清畫面，跟 <Code>clear</Code> 一樣
			</>
		),
	},
	{ keys: "Ctrl+A／Ctrl+E", effect: "游標跳到行首／行尾，改長指令很好用" },
	{ keys: "Ctrl+R", effect: "搜尋以前打過的指令，打幾個字就找出最近的一筆，Enter 直接執行" },
];

/**
 * 真實世界橋接頁（設計文件 4.20）：通關後標題多一項「下一步：真的終端機」進來，
 * 給沒碰過終端機的人一頁讀完：怎麼打開、跟遊戲哪裡不一樣、六章學的在真的系統都有、接下來學什麼。
 * 靜態頁，不讀存檔；直接打網址也看得到。
 */
export default function RealWorldPage() {
	return (
		<StaticPage
			title="下一步：真的終端機"
			lead={
				<p className="text-game-prompt">
					你在 Kepler-9 打過的指令，在自己的電腦上幾乎都能照打。這一頁講怎麼打開終端機、跟遊戲哪裡不一樣，還有接下來可以學什麼。
				</p>
			}
		>
			<StaticSection id="real-open" title="打開終端機">
				<dl className="flex flex-col gap-4">
					<div>
						<dt className="text-game-holo">macOS</dt>
						<dd>
							打開「終端機」App（在「應用程式」的「工具程式」資料夾裡，或按 ⌘ 空白鍵搜尋「終端機」）。想要分頁、分割視窗好用一點，可以另外裝
							iTerm2。預設的 shell 是 zsh。
						</dd>
					</div>
					<div>
						<dt className="text-game-holo">Windows</dt>
						<dd className="flex flex-col gap-2">
							<span>
								在開始選單找到 PowerShell，按右鍵「以系統管理員身分執行」，輸入 <Code>wsl --install</Code> 安裝 WSL（在 Windows
								裡跑的 Linux，預設是 Ubuntu），裝完重新開機。之後打開 Windows Terminal（Windows 11 內建，Windows 10 到 Microsoft
								Store 安裝），開一個 Ubuntu 分頁就能用；第一次會請你設定 Linux 的使用者名稱和密碼。
							</span>
							<span className="text-game-prompt">
								PowerShell 和命令提示字元是 Windows 自己的 shell，有些指令名字很像，用法和輸出卻不一樣；照遊戲學的打，請用 WSL。
							</span>
						</dd>
					</div>
					<div>
						<dt className="text-game-holo">Linux</dt>
						<dd>多數桌面環境（例如 Ubuntu）按 Ctrl+Alt+T 就會打開終端機，預設的 shell 通常是 bash。</dd>
					</div>
				</dl>
			</StaticSection>

			<StaticSection id="real-diff" title="跟遊戲不一樣的地方">
				<TableFrame>
					<table className={TABLE_CLASS}>
						<thead>
							<tr>
								<th scope="col" className={HEAD_CELL_CLASS}>
									<span className="sr-only">項目</span>
								</th>
								<th scope="col" className={HEAD_CELL_CLASS}>
									在 Kepler-9
								</th>
								<th scope="col" className={HEAD_CELL_CLASS}>
									在真的 shell
								</th>
							</tr>
						</thead>
						<tbody>
							{DIFFERENCES.map((row, index) => (
								<tr key={index}>
									<th scope="row" className={`${CELL_CLASS} whitespace-nowrap font-normal text-game-holo`}>
										{row.topic}
									</th>
									<td className={CELL_CLASS}>{row.game}</td>
									<td className={CELL_CLASS}>{row.real}</td>
								</tr>
							))}
						</tbody>
					</table>
				</TableFrame>
			</StaticSection>

			<StaticSection id="real-errors" title="英文錯誤訊息">
				<p>真的 shell 出錯時只丟一行英文，常見的就這幾句：</p>
				{/* 用清單不用表格：英文訊息很長，手機上三欄會變成一字一行 */}
				<dl className="flex flex-col gap-3">
					{ERROR_MESSAGES.map((row) => (
						<div key={row.message} className="flex flex-col">
							<dt>
								<Code>{row.message}</Code>
							</dt>
							<dd>
								{row.meaning}
								<span className="text-game-prompt">。通常是{row.cause}。</span>
							</dd>
						</div>
					))}
				</dl>
			</StaticSection>

			<StaticSection id="real-keys" title="真的 shell 多出來的按鍵">
				<dl className="flex flex-col gap-3">
					{SHELL_KEYS.map((row) => (
						<div key={row.keys} className="flex flex-col sm:flex-row sm:gap-4">
							<dt className="shrink-0 sm:w-48">
								<Code>{row.keys}</Code>
							</dt>
							<dd>{row.effect}</dd>
						</div>
					))}
				</dl>
				<p className="text-game-prompt">↑↓ 叫回打過的指令、Tab 補全，跟遊戲一樣。</p>
			</StaticSection>

			<StaticSection id="real-commands" title="六章學過的，真的系統都有">
				<p>下面這些在 macOS 和 Linux 都能直接打，用法大致跟遊戲裡一樣：</p>
				<div className="flex flex-col gap-4">
					{CHAPTER_COMMANDS.map((entry) => {
						const headingId = `real-commands-ch${entry.chapter}`;
						return (
							<div key={entry.chapter} role="group" aria-labelledby={headingId} className="flex flex-col gap-1">
								<h3 id={headingId} className="text-game-prompt">
									{chapterLabel(entry.chapter)}
								</h3>
								<ul className="flex flex-wrap gap-x-4 gap-y-1">
									{entry.items.map((item) => (
										<li key={item}>
											<Code>{item}</Code>
										</li>
									))}
								</ul>
							</div>
						);
					})}
				</div>
				<p className="text-game-prompt">
					<Code>$變數</Code> 指的是 <Code>$HOME</Code>、<Code>$PATH</Code> 這類變數；<Code>Tab</Code> 是補全鍵，不是指令。
				</p>
			</StaticSection>

			<StaticSection id="real-macos" title="macOS 的小差異">
				<p>macOS 內建的是 BSD 版的工具，Linux（包括 WSL）是 GNU 版。照遊戲打會覺得怪怪的，多半是這幾個：</p>
				<ul className="flex list-disc flex-col gap-3 pl-6">
					<li>
						<Code>ls -l</Code>：欄位意思一樣，日期寫法不同。遊戲寫成 <Code>2031-03-12 08:15</Code>，真的系統預設是月、日、時間（半年以前的檔案改顯示年份），還會隨語系改變；Linux
						加 <Code>--time-style=long-iso</Code> 就是遊戲的寫法，macOS 的 ls 沒有這個選項。macOS 的權限欄後面可能多一個{" "}
						<Code>@</Code> 或 <Code>+</Code>，代表檔案帶有額外的屬性或存取清單。
					</li>
					<li>
						<Code>sed -i</Code> 直接改檔案：Linux 寫 <Code>{"sed -i 's/舊/新/' 檔名"}</Code>，macOS 一定要多給一個備份副檔名，不要備份就寫{" "}
						<Code>{"sed -i '' 's/舊/新/' 檔名"}</Code>。
					</li>
					<li>
						<Code>top</Code>：真的是會一直更新的全螢幕畫面（遊戲只印一次快照），按 <Code>q</Code> 離開；macOS 跟 Linux 的欄位也不一樣。
					</li>
					<li>
						<Code>grep -r</Code>：兩邊用法一樣，放心用。
					</li>
					<li>
						很多 macOS 內建的指令不認得 <Code>--help</Code>（只會印一行用法），查用法改用 <Code>man</Code>。
					</li>
				</ul>
			</StaticSection>

			<StaticSection id="real-next" title="接下來可以學什麼">
				<ul className="flex list-disc flex-col gap-3 pl-6">
					<li>
						<span className="text-game-holo">讀 man：</span>先看 NAME（一句話說它做什麼）和 SYNOPSIS（怎麼打），再往下找要的選項；按{" "}
						<Code>/</Code> 打關鍵字搜尋、<Code>n</Code> 找下一個、<Code>q</Code> 離開。
					</li>
					<li>
						<span className="text-game-holo">管線組合：</span>
						<Code>|</Code> 可以一直串下去，例如 <Code>grep ERROR app.log | sort | uniq -c</Code> 算出每一種錯誤各出現幾次。
					</li>
					<li>
						<span className="text-game-holo">~/.zshrc 與別名：</span>把常打的長指令取個短名字，在 <Code>~/.zshrc</Code> 加一行{" "}
						<Code>{"alias ll='ls -la'"}</Code>，執行 <Code>source ~/.zshrc</Code>（或開新視窗）之後打 <Code>ll</Code> 就好。
					</li>
					<li>
						<span className="text-game-holo">檔案權限：</span>
						<Code>ls -l</Code> 最前面那串 <Code>rwxr-xr-x</Code> 是擁有者、群組、其他人各自能不能讀、寫、執行；自己寫的腳本要先{" "}
						<Code>chmod +x</Code> 才能執行。
					</li>
					<li>
						<span className="text-game-holo">ssh：</span>連到另一台電腦（例如雲端主機）的終端機，<Code>ssh 使用者@主機</Code>
						；再來可以學用 <Code>ssh-keygen</Code> 產生金鑰，不用每次打密碼。
					</li>
				</ul>
				<p className="text-game-prompt">
					真的系統沒有 hint，但卡住時把那行英文錯誤訊息整句拿去搜尋，多半已經有人問過。
				</p>
			</StaticSection>
		</StaticPage>
	);
}
