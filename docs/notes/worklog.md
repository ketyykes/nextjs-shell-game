# 工作日誌

> 原 `docs/progress.md` 第 7 節，2026-10-16 拆出。
>
> **節號對照**：日誌裡寫的「第 N 節」是拆檔前 `progress.md` 的節號。第 3 節 → [`archive/progress-milestones-m0-m15.md`](../archive/progress-milestones-m0-m15.md)；第 4 節 → [`progress.md`](../progress.md) 第 3 節；第 5 節 → [`notes/pitfalls.md`](./pitfalls.md)；第 7 節與「第 N 場日誌」→ 本檔；第 8 節 → [`notes/decisions.md`](./decisions.md)（決策編號不變）；第 9 節 → [`progress.md`](../progress.md) 第 5 節。「M9-1」這類任務編號 → [`archive/progress-milestones-m0-m15.md`](../archive/progress-milestones-m0-m15.md)；`audit-2026-10-08.md` → [`archive/audit-2026-10-08.md`](../archive/audit-2026-10-08.md)。

每次 session 收工加一筆，最新在最上面。格式：日期、做了什麼、commit 範圍、下一步。

### 2026-10-16（第十八場，整理 docs/ 資料夾）

- Danny 要求整理 `docs/`：過時內容移到 `docs/archive/`、分門別類、評估拆分 `progress.md` 與 `game-design.md`；指定 workflow 派 Opus 5.5 執行、主 session 監督。中途補一句「拆檔後會失效的 `CLAUDE.md` 引用一併修正」。
- 做法：先開一個 workflow 核對 `game-design.md` 18 處疑似過時段落（核對 agent 對照程式碼、反駁 agent 覆核），15 處確認過時、3 處文件其實正確；再開第二個 workflow 三個 agent 平行執行（拆 `progress.md`、修 `game-design.md`、搬檔與修引用），三個驗證 agent 分別查內容零遺失、引用可解析、設計修正反駁。搬移的段落一律 `git show HEAD:… | sed -n` 逐字複製並以 md5 核對，驗證確認 HEAD 的每一行都還在。
- 結果：`progress.md` 682 → 78 行（§3 任務清單封存、§5 陷阱、§7 日誌、§8 決策拆成 `notes/` 三檔）；`game-design.md` 608 → 551 行（§7 目錄規劃、§8 第一版工作順序、§10 尚未定案封存，舊 §9 地圖配置改為 §7，15 處事實修正：Magic UI、EventBus、shadcn Dialog、useLayoutEffect 加 rAF、設定選單六項、codex 產圖流程、主艙門是 T6 開、事件清單、三個面板標籤、暫停選單四項、開場插圖卡、命名規則、劇本欄位、狀態列）；`audit-2026-10-08.md` `git mv` 進 `archive/`；新增 `docs/README.md` 文件地圖與 `archive/README.md`。`CLAUDE.md`、`README.md`、`ci.yml` 與七個程式檔的註解改成新指向（`progress.md 第 5 節` → `notes/pitfalls.md`、`設計文件第 9 節` → `第 7 節`、`DECK_LAYOUTS` 這個不存在的名字改成 `buildDeckLayout`）。程式邏輯沒動。
- 驗證：引用檢查抓到 worklog 兩處斷鏈（`./cheatsheet.html`、`docs/audit-2026-10-08.md`）與幾處小地方，已修；`pnpm lint`、`npx tsc --noEmit`、`pnpm test --run` 全綠。
- 順帶發現：`generate-ch2-6.sh` 第 61、64 行還在找 `public/scenes/*.png`（第十五場已改 WebP），記進 `progress.md` 第 3 節待處理雜項，沒改腳本。決策記在 `notes/decisions.md` #126。
- 沒做：`assets-draft/` 與 `screenshots/` 不搬（`.gitignore`、產圖腳本、本機原圖都綁原路徑）；`game-design.md` §3 架構圖原本就歪一格的幾行沒動；push 照規則沒做。
- 同日續（清 `progress.md` 第 3 節待處理雜項，Danny 說「你覺得可以處理的都處理掉」）：`generate-ch2-6.sh` 的跳過判斷與參考圖退路改找 `.webp`；「淘汰原圖只在本機」是環境備註，改記 `notes/pitfalls.md`；五個音效用 `afinfo` 確認能解碼與長度，沒有耳朵聽。劇情文字開一個校對 workflow（六章各一位、周邊七檔一位、跨章一致性一位，Opus 5.5），只找錯字、簡體或大陸用語、標點、性別指涉、事實矛盾，每檔一位反駁 agent 覆核：前四類零筆，矛盾 10 筆，反駁掉 1 筆、3 筆 mtime 的直接修（#127）、6 筆要動劇情的列進第 3 節等 Danny。167 檔 3318 測試、lint、tsc 全綠。真人試玩與風格潤稿做不了。
- 另一個 session 問 14 項候選功能有沒有做過，查過程式碼回了：13 項沒做，只有 ps／top 欄位解說在 man 裡有一部分。

### 2026-10-15（第十七場，`/goal` 自主實作 M15 遊戲化）

- Danny 先請我盤點還能加什麼功能，再請我用「遊戲化實戰全書」的八角框架重新思考；接著下 `/goal`：shell 彩蛋、多解法認可、阿彬留言收集與回信、除役倒數、拼字建議、unset、隱藏留言收集、NOVA 看狀態全部做，指揮 Opus 5.5 平行實作、必須自我驗證。照記憶裡的自主規則，不確定的自己拍板、記進第 8 節 #102 到 #124。
- 中途 Danny 問：留言寫在終端機檔案裡，存檔中已過關的終端機不會更新、找不到怎麼辦？改成「覆蓋層」：留言不進劇本快照，每台終端機建立、還原、改版重建時補寫（#108）。
- 做法：第一波四個 agent 各開 worktree 平行做（A shell 三項、B 認可、C 阿彬留言與回信與存檔 v4、D 除役倒數），我逐組審 diff、快轉合併、在 main 重切字型子集並跑全部驗證；第二波 E 組在 A、C 合併後做 NOVA 看狀態（依賴 unset 與留言事件）。兩輪唯讀審查：第一輪對第一波找到 8 項，修 7 項（Alt+A 讓角色往左走、帳號表與劇本矛盾、`last` 時間線、面板線索劇透、提示蓋住倒數、沙盒 exit 說明、回信讀檔清理），第 8 項 unset 讓第五章 T1 卡關由我用唯讀變數修掉（#123）；第二輪對 NOVA 看狀態與唯讀變數沒有找到阻擋遊玩的問題，修了四項（第五章 T5、T6 的路徑變數也設唯讀、唯讀清單算進劇本雜湊、延後的「這裡是阿彬的家目錄」換台後丟掉、稽核備註的 echo 寫法），文件一項（#125）。
- 我自己另外修：sudo、exit、logout 被認可成解法；面板未到過的章節重複同一句。實際開正式 build 在沙盒打過拼字錯誤、unset、彩蛋，在 `/play` 種存檔看過倒數跳秒、標籤切換與留言面板，頁面零錯誤。
- 坑：（1）我有一次用 `pnpm test ... | grep` 串 `&&` 提交，grep 成功讓失敗的測試也被提交，立刻補正並 amend（本機未 push）；之後先把測試輸出寫進檔案、用結束碼判斷再提交。（2）`cd` 進 agent 的 worktree 會讓 session 的工作目錄跟著換過去，之後的指令一律帶絕對路徑。（3）字型子集照第十四場的做法只在 main 重切一次，agent 都沒提交字型檔。
- 結果：`9fc5286..HEAD` 42 個 commit、約 120 個檔案（約 7700 行）；單元測試 2811 → 3318；e2e 48 → 58，整套在 main 上全綠、沒有 flaky；存檔升 v4。
- 沒做：審計「這次沒選的項目」；第 4 節的潤稿與試聽；push 照規則沒做，本機領先 origin。

### 2026-10-10（第十六場，開發者過關密技）

- Danny 要一份給開發者看的過關密技 HTML，產出 [`cheatsheet.html`](../cheatsheet.html)：六章 36 台終端機的正解序列（資料直接抄 `src/game/chapters/solutions.ts`，最後一行標「過關」）、標題／艙區／教的指令／目標、六台位置平面圖、跳章的 localStorage 程式（存檔 v3 格式）、`window.__kepler9.emit` 演出鉤子、密碼與 PID 常數表。放 `docs/`，不會被站台發布。
- 驗證：寫臨時腳本把 HTML 裡 36 串指令跟 `solutions.ts` 逐字比對（0 處不符）；`solutions.test.ts` 72 個綠；另寫臨時 Vitest 用真 Shell 確認 36 串以 ` ; ` 串成一行也全部過關（跑完刪掉）。再開 4 個驗證 agent 加反駁 agent 對文件挑錯，確認兩件並修掉：終端機輸入列是單行 `<input>`，貼多行會合併，「複製全部」改成用 ` ; ` 串一行；`__kepler9.emit("puzzle:solved")` 只播地圖演出、不寫存檔，文件改標題並加警語。順手修四個小處（T2 是「下排中」、第三章也開場斷電、ch3-t4 是四道改檔指令、ch6-t4 過關後燈滅屬預期）。
- commit `70bde04`，Danny 自己 push 到 origin。
- 下一步：劇本改了要同步這份文件（或直接以 `solutions.ts` 為準）；其餘同第十五場（部署、試玩、確認第 8 節）。

### 2026-10-09（第十五場，場景插圖轉 WebP）

- Danny 想部署到 Vercel，問大型素材要不要另外放。實測 `public/` 只有 8.4MB，建議直接放 Vercel、先把場景圖轉 WebP；Danny 同意轉檔並要求驗證圖片正確。
- 轉檔與驗證見第 8 節 #101：44 張都能解碼、都是 640x360、各自跟原 PNG 比對；正式 build 回 `image/webp`、Chromium 逐張解碼成功；實際走標題流程，開場插圖卡載入 `scene-intro.webp`，沒有 404。
- 驗證：`pnpm test --run` 2811 個全綠，`pnpm lint`、`npx tsc --noEmit`、`pnpm build` 乾淨。e2e 4 個 worker 跑時 `play.spec.ts` 兩條在走路時 30 秒逾時；單獨用 1 個 worker 重跑 12 條全綠，判斷是負載造成，跟圖片無關。
- 下一步：部署。

### 2026-10-09（第十四場，`/loop` 自主實作 M10 到 M14）

- Danny 下 `/loop`：「到 10/9 上午十點前，依照 `audit-2026-10-08.md` 的計畫開始實作，允許多開 subagent 加速，做完必須自我驗證」，之後離線。照記憶裡的自主規則，不確定的自己拍板、記進第 8 節。
- 做法：每個 agent 在自己的 git worktree 實作一組任務（TDD、各自跑單元測試／lint／tsc，只跑指定的短 e2e），我逐組 cherry-pick 或 fast-forward 進 main、解衝突、重切字型子集、在 main 上重跑全部驗證。後半段讓 agent 收尾前自己 `git rebase main`，合併幾乎沒有衝突。共開 17 個實作／修正 agent、3 個唯讀審查 agent。
- 第一波（M10 三組、M13-1/2、標題與預載、存檔容錯與瘦身）六個 agent 同時跑時機器 load 衝到 120 以上，計時走路的 e2e 大量失敗、單元測試的地圖測試逾時；確認是負載造成後照常合併，M11-6 改成閉環走路後 load 61、8 個 worker 也全綠。
- 坑：（1）Agent 的 worktree 是從 `origin/main` 開的，不是本機 main，後開的 agent 要先 `git reset --hard main`；（2）`eslint .` 會掃進 `.claude/worktrees/` 與 Playwright 的 trace 資產，已加進 globalIgnores；（3）有個 agent 用 `pkill -f "next dev"` 關 server，可能誤殺別的 agent 的 dev server，之後一律用埠號找 PID；（4）每個 agent 各自重切字型子集，二進位檔必衝突，合併時一律略過它們的字型 commit、在 main 重切一次。
- 全部合併後開三個唯讀審查 agent（遊玩流程、shell 與沙盒、標題與存檔），每條疑點要求先自己反證。推不翻的 12 條全部用 TDD 修掉（#93 到 #100），其中最嚴重的是「進下一章時下一章開場台詞在重載前就被標成說過」，ef64bd3 之前就存在，整章 e2e 先種旗標所以一直沒抓到，happy-path 補了斷言。審查順帶發現的分頁器頁數 bug 我自己修。
- 結果：`ef64bd3..HEAD` 約 120 個 commit、252 個檔案；單元測試 1861 → 2811；e2e 26 → 48；PlayScreen 746 行拆成 285 行加十幾個 hook／元件；Phaser chunk 少 33KB gz；存檔升 v3。
- 沒做：審計「這次沒選的項目」；地圖層閒置偵測；沙盒的 `man hint` 措辭；shell 的 `cd -`、`#`、`( )`／`{ }`、`!`；diff 等長選法與 GNU 約 1% 不同（見 #81）。push 照規則沒做，本機領先 origin。

### 2026-10-08（第十三場，優化方向審計與 M10 到 M14 規劃）

- Danny 問「要優化本遊戲有哪些方向」，要求用多個 AskUserQuestion 互動。框架題回答：目標全部都要、持續迭代、四個面向都在意。
- 開一個 workflow：七個面向（效能、體驗引導、架構、測試、無障礙、產品、營運）各一個 agent 審計，65 項發現逐項由懷疑者開檔核對，55 項通過、10 項淘汰，補漏 agent 再提 5 項。中途 Fable 額度用完，改 Opus 5.5 從快取接續跑完。
- 四輪問答勾選結果寫成第 3 節的 M10 到 M14，證據與修正意見存在 `docs/archive/audit-2026-10-08.md`（行號是 `11d50c6` 的狀態）。
- Danny 沒選的：劇本依章動態載入、移除 motion、覆蓋率、視覺回歸與 Safari、多分頁互蓋、第二輪挑戰、系統減少動態預設關閃爍、次要文字對比、焦點管理、部署四項（部署那題沒作答，當作暫不處理）。完整清單在審計檔末尾。
- 沒有改程式碼，只有本檔與審計檔。
- 下一步：M10 玩家體驗與引導。

### 2026-10-08（第十二場，/loop 自主迭代：門面、效能、UX 與劇情修正）

- Danny 下 `/loop`「10/8 早上 7 點前自我優化迭代這款遊戲，任何角度都可以」，中途補充「不確定的先記錄、讓我知道改了什麼、自己決定不要再問、記得自我驗證」。
- 先開三路審計 workflow（劇情文字、UX 引導、技術健檢，共 22 項發現），再逐批修：
  - **門面**：README 從模板文案改寫成遊戲介紹；OG 中繼資料與 1200x630 分享圖（scene-intro 像素放大裁切）；nova-eye 做 64px 分頁 icon；robots.ts、sitemap.ts、metadataBase；GitHub Actions CI。
  - **效能**：場景 PNG 256 色量化 18.8MB → 8.3MB（決策 #52）；移除全專案沒用到的 Geist 字型（省兩個 preload woff2，production 截圖驗證標題頁正常）。
  - **UX**：`grep 樣式 目錄` 的「加 -r」提示原本會教玩家打出搜錯東西的指令，改成帶樣式與目的地的完整示範（決策 #54）；`head -n 0` 的「0 不是數字」改成「要接 1 以上的整數」。
  - **劇情**：十一處時間線矛盾（決策 #49 到 #51 與：pod_06 建檔 22:14 → 22:16 對齊撤離日誌分段、鎖門與艦長質問兩段對調、回滾從封存範圍內移除、`rollback_nova.sh` 統一成 ch3 玩家親眼看到的 `rollback.sh`、ch6 螢幕牆 15 台 → 24 台輪播、boot log 補「重試 3/3」、man 的 `grep "^21:4"` 範例對 evac log 永遠空輸出 → 改 `"^03:"`）。
- 後半場把審計剩餘項做完：
  - **Tab 補全**：管線右邊第一個 token 補指令名（`ps | gr<Tab>`）、`man`／`help` 的參數補指令名、路徑裡的 `$NAME` 用 env 展開查目錄（回填保留玩家原寫法，`CompletionContext` 加選填 `env`）。
  - **標題頁瘦身**：新增 `chapters/meta.ts`（手寫輕量 metadata，`chapters.test.ts` 守護與劇本一致），TitleFlow 改用它，六章劇本與 zod 不再進 `/` 的首載 JS（也防了劇情文本爆雷）；用 `.next` 產物 grep 劇本字串驗證為零。
  - **vitest**：`pool: "vmThreads"` 重用 jsdom，全套 9.3 秒 → 4 秒。
  - **音效**：afinfo 驗過五個檔的時長都合理（按鍵 0.1s、blip 0.05s、門 0.5s、電力 1s、環境 8s），聽感仍待真人試聽。
  - **字型子集化**：`pnpm font:subset`（`scripts/subset-font.py`，需 fonttools）掃 src 用字切出 49KB 子集（決策 #55），production 截圖驗證像素中文字正常。
- 驗證：87 檔 1842 個單元測試全綠（本場新增 13 個），tsc、lint、`pnpm build` 乾淨；e2e 全套 26 個跑過，`play.spec` Tab 補全與第 3 章兩個失敗單獨重跑都過（併發 flaky，非回歸）。
- **e2e 全套併發 flaky**：26 個一起跑（2 workers）時，走路類測試每輪有 0 到 3 個不固定地紅，失敗的測試單獨重跑都綠；機器有其他負載（例如另一個 agent 在跑 dev server）時更明顯。判定回歸的方式：把紅的測試單獨跑，綠了就是 flaky。
- 第二輪審計（設計漂移對照＋新手代理用 playwright 真玩第一章前兩台）再修一批：
  - **按 E 漏字 bug**（medium）：開終端機的那一下 e 會漏進剛聚焦的輸入框變成預填字，新手第一個指令變「els」。`TerminalZone.handleInteract` 對該次按鍵 `preventDefault`，e2e 加空輸入框斷言。
  - **九處新手引導死角**：開場 intro 補「方向鍵走到控制台旁按 E」、T1 過關補指路台詞、T1 banner 與 `commandNotFound` 直通 hint、T1 hint 1 補可操作引導、T2 hint 3 改絕對路徑＋家目錄放 note.txt（決策 #57 的 cd 陷阱）、cat 的 noInput 範例去掉管線噪音、終端機頁尾「（還沒有）」改「（過關後記錄）」。
  - **設計文件兩處註記**：4.6 遮罩 0.92、4.8 補 T1 三指令例外；nova-blip 播放範圍記成決策 #56。
  - **開著終端機重新整理會回到走路中途點**（追 e2e flaky 挖出的真 bug）：位置存檔靠「連續兩幀同座標」偵測停下，走到終端機旁立刻按 E 時場景先暫停、最後一段路沒存。`PositionReporter` 加 `flush()`，Station 在 `terminal:open` 時補存（用 `roomTracker.roomId` 純查詢，不能用 `update()`——會多發一次 `room:enter`，第一版就是這樣讓八個 e2e 紅掉的）。
  - boot log 隱藏死的關閉鈕與「提示：輸入 hint」頁尾（`TerminalFrame` 加 `onClose?` 與 `hideFooter`），動畫中顯示「Enter 跳過」。
  - **36 台 hint 機械驗證**：寫一次性測試抽出每台 hint 裡「輸入 X」的指令照抄執行（帶上劇本的 env 與 processes），真實缺陷 0 個——28 台直接照抄過關，8 台的答案尾步在「例如…」或要玩家代入 find 輸出的路徑（刻意的組合層設計）。腳本太脆不保留，驗證方法記在這裡：抽取 regex `輸入(?:一次)? ([a-z$][\x20-\x7e]*)`、頓號拆多指令。
- 第三輪走查（三個新手代理分頭真玩第二到六章，各起自己的 dev server）回報 23 項，當場修掉 19 項：
  - **cp/mv 的目的地陷阱**（high，ch3 T4 實測永久卡死）：`cp core.cfg config/` 在 config/ 不存在時會默默建出「名叫 config 的檔案」，之後 mkdir 被擋、hint 正解也失效。改成尾斜線目的地必須是既有目錄，否則 ENOENT／ENOTDIR（跟真的 cp 一樣）。
  - **shell 訊息五處**：mkdir 上層不存在時教 `-p`；`pathNotFound` 含斜線或 `~` 的路徑不再說「這個目錄下…用 ls 看看」（會把人導去錯的地方）；`kill 9 1207` 提示訊號要加 dash；`export NAME = VALUE` 不再把 VALUE 多罵一次；`kill -9` 在回顧卡有自己的說明。
  - **章節文案十七處**：ch2 六台目標描述補地點、T2 hint 3 改絕對路徑、T6 教 `-name` 要加 `*`；ch3 T3 hint 與 onStuck 補「搬了但還帶點」的救援；ch4 T1 描述補路徑、T2 標題去「管線」術語＋hint 明講完成條件、T4 hint 補「不要帶 -c」、T5 判定防 `>` 覆寫（決策 #58）；ch6 T1 hint 指路、T4 補描述、T5 不劇透核心狀態（決策 #59）、T6 發射程序檔補 `cat launch.txt` 檢查法。
  - **NOVA 台詞佇列落後**（五章都重現）：換艙區時丟掉其他房的未播進房台詞（決策 #61）。其餘三項刻意不修，理由與替代修法見決策 #60。
- 驗證：88 檔 1859 個單元測試全綠，tsc、lint 乾淨；chapters＋happy-path e2e 七個全過（六章正解不受判定嚴格化影響）。
- commit `c0d9dd4` 到 `e49e566` 再加文件 commit，共三十三筆。待 Danny：刪模板殘留檔與 NOVA 佇列方向（見第 4 節）、決定要不要 push。
- 下一步：無。候選工作見第 9 節。

### 2026-10-07（第十一場，M9-8：反斜線跳脫與 grep -w／-o）

- Danny 問第 9 節「剩下的 shell 邊界」指什麼，解釋後要求改第 5 節標題（原本寫「M1 刻意不做」，容易誤會 M9 沒動過），並補最可能被玩家撞到的兩項：引號外反斜線跳脫、grep `-w`／`-o`。
- 先用 Docker 的 GNU grep 3.8 實測 `-w`、`-o` 與各種組合（`-on`、`-oc`、`-ov`、空字串符合、`C.UTF-8` 下中文算文字字元），再寫紅燈測試。既有測試只刪了「引號外反斜線原樣保留」那一條（需求變了），其他斷言沒動。
- 驗證：87 個測試檔 1829 個單元測試全綠，tsc、lint 乾淨；用第二章 T3 的真 Shell 抽查 `grep -w LOCK`（11 行，不含 UNLOCK）、`grep -oi nova | wc -l`、`mkdir my\ dir` 再 `cd my\ dir`。e2e 沒重跑（沒動 UI 與劇本）。
- 下一步：同第十場之二。

### 2026-10-06（第十場之二，M9：第 9 節的小尾巴全部做掉）

- Danny 要求把第 9 節的七項做掉並驗證。四個設計決策先用 AskUserQuestion 問（全部照建議），shell 邊界派一個 agent 平行做（只碰 `src/game/shell/`），存檔、選章、Phaser、NOVA 立繪、排版我自己做，全程紅燈先行。
- 為了需求變更改掉的既有測試：store 的版本號 1 → 2；`PhaserGame.test.tsx` 的 `startGame` 參數多 `spawnPoint`、`flickerEnabled`；`play.spec.ts` 的「回標題再繼續」改成角色會出現在剛才停下的 T1 旁（並斷言提示立刻出現）。agent 那邊改的列在第 3 節 M9-1 的回報裡（grep 的 `.`、`-E`，chmod `6444`，uniq 兩個檔名，重導向建空檔）。
- 驗證：87 個測試檔 1799 個單元測試全綠，tsc、lint 乾淨；e2e 26 個全綠（新增 `save-v2.spec.ts`：位置存檔重整後還原、選章、第六章立繪、關閉閃爍演出不出錯、三種視窗寬度互不重疊）。截圖看過 1280、1024、768 的地圖畫面與「按 E」像素字。自己用真的 Shell 抽查過 grep BRE／ERE／-F、中間段萬用字元、chmod 組合、重導向建檔、sort -nu、uniq 輸出檔。
- 中途抓到 e2e 工具的坑：`alignToTerminal` 的 `textContent()` 沒逾時會卡死到測試逾時（記在第 5 節）。第一次全套跑時第二、三、五章因負載走偏，單獨重跑與修正後全過。
- 下一步：Danny 試玩（特別是選章與位置還原的手感、關閉閃爍時人影的淡入淡出）、潤稿、試聽；見第 4、8、9 節。

### 2026-10-06（第十場，核對進度檔、補齊 12 張插圖）

- 對照程式碼核對本檔：測試數、e2e 數、檔案、commit hash 都相符，修正五處過時描述（M2-6、M5-5、M5 完成定義、第 9 節兩條）。
- 補產 12 張插圖：這台 Mac 沒有任何 `*-original.png`（原圖在產第八場插圖的那台），原腳本只看原圖判斷要不要跳過，照跑會把 36 張全部重產並蓋掉已提交的 24 張。`generate-ch2-6.sh` 改成 `public/scenes/` 已有成品也跳過、缺冷凍艙原圖時改用 640x360 縮圖當風格參考。codex 約兩分鐘一張，27 分鐘產完；用縮圖當參考時有些輸出只有 640x360，遊戲本來就用這個尺寸，不影響。拼成對照圖看過，風格與前 24 張一致。
- `scenes.test.ts` 先紅（目錄有圖但沒列）再把 12 個名字加進 `AVAILABLE_SCENES`。84 個測試檔 1644 個測試全綠，tsc 與 lint 乾淨；e2e 沒跑（只動圖檔與清單）。
- 下一步：Danny 試玩第二到六章、潤稿、試聽音效；見第 4、8、9 節。

### 2026-10-02（第九場，全程試玩與修 bug）

- Danny 要求「從第一章玩到第六章遊戲結束，bug 先記錄、玩完再修（修的時候用 TDD）」。用 playwright-cli 開真瀏覽器，從標題（新遊戲 → 選角 → boot log 自然打完）一路玩到片尾回標題：六章 36 台終端機全部照正解通關，走路移植 `e2e/helpers/deck.ts` 的貼牆滑行；全程收集 `window` 錯誤、資源 404、NOVA 台詞與終端機輸出，**零頁面錯誤、零資源錯誤**。氧氣扣血與回復、Esc 不連動暫停選單、六章的過關演出與回顧卡都正常。
- 抓到四個 bug，全部紅燈先行再修：
  1. **進度死路（最嚴重）**：一章全解、章節結束畫面看過後回標題再「繼續」，結束畫面不再出現，玩家被困在完成的甲板進不了下一章。修法見決策 #37（`showChapterEnd` 拿掉旗標條件、`ChapterEndScreen` 加 `skipOutro`），新增 e2e「章節結束畫面的回訪」並確認拿掉修正會紅。
  2. **終端機底部「已學」重複**（例：`pwd ls cat cd ls cd ls history clear`）：`Shell` 建構子沒去重（`learn()` 有），PlayScreen 把 `ls -l`、`ls -a` 轉成指令名後重複傳入。改建構子走 `learn()` 去重。
  3. **回顧卡 `>`、`|`、`>>`、`$變數` 說明空白**：`COMMAND_DOCS` 查不到就空字串。新增 `docsConcepts.ts` 的 `CONCEPT_DOCS` 與 `getTeachDoc`（決策 #38），回顧卡與側邊面板都改查它，`chapters.test.ts` 加守門測試「每章 teaches 都查得到說明」。
  4. **片尾佔位塊顯示「過場插圖（M6 產圖）」**：內部字樣露給玩家，改成世界觀內的「影像訊號遺失」（決策 #39）。
- 順帶驗證過不是 bug 的觀察：NOVA 台詞在 innerText 出現兩次是 `DialogueBlock` 的 sr-only 無障礙設計；通關後標題副標停在「NOVA 核心 · 第六章」屬預期。存檔大小六章全解約 137 KB，離 localStorage 上限很遠。
- 84 個測試檔 1644 個單元測試、19 個 e2e 全綠，tsc 與 lint 乾淨。
- commit：兩筆 fix、本檔兩筆 docs。Danny 確認後已 push（`c1e75ce..cc7b200`，含前八場累積共 50 筆）。
- 下一步：Danny 親自試玩（尤其第二章以後的劇情手感）、潤稿、補 12 張插圖；其餘見第 4、8、9 節。

### 2026-10-01（第八場，`/goal` 做到第六章）

- Danny 下 `/goal`：「幫我做到 1～6 章，中間有任何不確定的就紀錄下來不要停下來，不用管 token 消耗，允許派遣平行 subagent，使用 TDD 並且要做 playwright cli 的測試，直到做完」。全程沒有再用 AskUserQuestion，自主決定記在第 8 節 #23 到 #36。
- 契約先行後兩波平行：第一波五個 opus agent（shell 核心；head/tail/wc/grep/find；VFS 寫入與 mkdir/touch/cp/mv/rm/chmod；echo/sort/uniq/export/env/ps/top/kill；六張地圖與 Phaser 多章節），第二波五個 opus agent 各寫一章劇本。主 session 同時做 story 模組擴充（旗標、objectives 新判定、schema 新欄位）、章節註冊表、store、PlayScreen、ChapterEndScreen 片尾、標題副標、e2e 工具、整合與 commit。
- 整合時抓到並修掉：五章撤離當晚的時間軸各寫各的（統一成第三章的版本）；`deckTerminal` 帶 `slot` 展開會被 strictObject 擋（加 `deckTerminalIdentity`）；`EMPTY_COMMAND` 的訊息對 `>` 不通順（加 `missingCommandForRedirect`）；e2e 六個 worker 同時跑會掉幀、貼牆滑行錯過門口（workers 改 2）。
- 83 個測試檔 1636 個單元測試、tsc、lint、build 全過；e2e 18 個。playwright-cli 實際開瀏覽器看過第三章開場斷電、T1 解謎、第六章章節結束到片尾。
- 插圖用 codex 背景產，約 100 秒一張，產到第 24 張額度用完（12 張待補，見第 4 節）；已產的跑過 `node scripts/resize-scenes.mjs` 並列進 `AVAILABLE_SCENES`。
- commit：`e1b593c`、`95a3c91`、`084087e`、`baaa1d3`（feat）、`4b1c9ea`（test）、`c5021ae`（chore）、插圖與本檔另兩筆。未 push。
- 下一步：Danny 試玩第二到六章、潤稿；見第 4、8、9 節。

### 2026-10-01（第七場，用 playwright-cli 走完 happy path，補整章 e2e）

- Danny 要求用 playwright-cli 把 happy path 測過一遍、有錯就修。用 `run-code` 在真瀏覽器走標題 → 選角 → boot log → 地圖 → 六台終端機，發現兩個 bug：（1）關終端機的那一下 Esc 會順便打開暫停選單（window 監聽在同一個事件裡被重新掛回去）；（2）暫停選單開著時按 E 還能把終端機開在選單底下。都先寫紅燈測試再修：`Terminal.test.tsx` 驗 Esc 不往 window 傳，`play.spec.ts` 新增兩個 e2e，回標題測試拿掉掩蓋 bug 的重試迴圈。
- 新增 `e2e/happy-path.spec.ts`：從標題一路解完六台終端機（照劇本順序），看到章節結束的 outro → 回顧卡 → 回標題，存檔還在、`pageerror` 為空。走路用貼牆滑行，細節寫在第 5 節。HUD 艙區名加 `data-testid="hud-room"`。
- 55 個測試檔 813 個單元測試、13 個 e2e 全綠，tsc 與 lint 乾淨。commit：`df08d7d`（fix）、`f809f5c`（test）、本檔另一筆 docs。未 push。
- 一次觀察到但沒重現的現象：剛改完 Phaser 端檔案立刻跑 e2e，回標題測試在新遊戲裡看到進度 0/6（存檔像被重置）；之後重跑三次與整套都過，推測是 Turbopack 編譯新模組撞上測試中的導頁。再遇到就先排除 HMR 再查。
- 工作樹裡有一筆不是我改的 `.gitignore` 變更（擋 playwright-cli 的根目錄截圖與 storage state），沒一起 commit。
- 下一步：Danny 繼續試玩；其餘見第 4、8、9 節。

### 2026-10-01（第六場，Danny 開始試玩，修第一個回報的 bug）

- Danny 在 dev 模式回報 `AudioManager.play` 炸「Cannot set properties of null (setting 'seek')」。追到 Phaser 原始碼：`game.destroy()` → `SceneManager.destroy` → `Systems.destroy` 只發場景 `DESTROY`，不發 `SHUTDOWN`；接著 game 的 `DESTROY` 讓 `SoundManager.removeAll()` 把每個 sound 的 `currentConfig` 清成 null。Station 把 `detachAudio` 與 `audio.destroy()` 只掛在 `SHUTDOWN`，所以回標題（或 Fast Refresh）重建遊戲後，舊 Station 的 `sfx:play` 訂閱還在，送指令的按鍵聲打到死掉的 sound。
- 修法：Station 的場景清理改成同一個只跑一次的 `cleanup` 同時掛 `SHUTDOWN` 與 `DESTROY`；`AudioManager.addSound` 多聽 sound 的 `DESTROY` 把它從清單拿掉當第二道保險。`audio.test.ts` 用假 scene 與會「destroy 後 play 就炸」的假 sound 重現；e2e 新增「過關 → Esc 暫停 → 回標題 → 繼續 → 再送指令」並收集 `pageerror`，拿掉修正跑一次確認會抓到同一句錯誤。
- 順手：這台 Mac 的 3000 被別的專案佔住、遊戲 dev server 在 3001，`playwright.config.ts` 改吃 `PORT`；e2e 選擇器避開 Next 路由播報器。
- 55 個測試檔 812 個單元測試、10 個 e2e 全綠。commit：`7daa13e`（fix）、`581df8d`（test）、`12e1d8f`（chore）、本檔另一筆 docs。未 push。
- 下一步：Danny 繼續試玩，有 bug 再回報；其餘見第 4、8、9 節。

### 2026-10-01（第五場，同一個 `/goal`，做完 M5-3 到 M7）

- 完成 M5-3、M5-4、M5-5、M6、M7，第一版全部里程碑結束。契約先行（`ambient:flicker`、`audio:settings`、`game:pause/resume` 事件，`onStuck`、`novaErrorLines` 劇本欄位），五個 agent 分兩波：卡關偵測與階梯（opus）、章節結束畫面（sonnet）、音效與 AudioManager（sonnet）、標題流程五個元件（opus）、codex 產圖由我在背景跑；我接 Station 與 PlayScreen、標題流程、插圖卡、e2e。
- 整合時抓到並修掉：Preloader 寫了 `loadAudio()` 卻沒呼叫（音效 key 不在 cache 讓場景炸掉，AudioManager 順便加容錯）；暫停選單借用 `terminal:open` 事件會被 PlayScreen 當成找不到終端機而立刻關掉，改成專用的 `game:pause/resume`。
- 55 個測試檔 805 個單元測試、9 個 e2e、`pnpm build` 全過。截圖看過標題、選角、boot log、插圖卡、暫停、設定、章節結束 outro 與回顧卡。
- commit：`ddc50e9`、`01f018d`、`a29520c`、`722bf56`（feat）、`1ab8693`（test）、本檔另一筆 docs。未 push，連同之前共 30 筆。
- 下一步：沒有排定的里程碑，見第 1 節與第 9 節。

### 2026-10-01（第四場，Danny 下 `/goal` 要求一路做完、疑問照建議並記錄）

- 完成 M4 全部與 M5-1、M5-2。契約先行（`src/game/story/types.ts`、Shell 的 `fs` getter），四個 agent 同時做：劇本 schema 與六台劇本（opus）、NOVA 對話框（sonnet）、HUD 兩個面板（sonnet）、Phaser 演出（opus）；我接 PlayScreen 的過關流程與 NOVA 三時機，加 e2e。
- 自主決定的事項全部記在第 8 節。
- 44 個測試檔 671 個單元測試、7 個 e2e 全綠。截圖驗證 T4 燈逐間亮、人影在視野邊緣閃一幀、T6 門開、重整後直接全亮。
- commit：`e2bac61`、`3b70d49`、`606c69c`（feat）、`6d5ce2a`（test）、本檔另一筆 docs。未 push。
- 下一步：M5-3 卡關偵測、M5-4 環境反應階梯、M5-5 章節結束。

### 2026-10-01（第三場）

- 完成整個 M3，順手做掉 M4-1、M4-2。地圖改用腳本產生（Danny 問過 Tiled 是什麼後同意，可用 Tiled 開起來精修）。先定 `events.ts`、`constants.ts` 契約，平行派地圖腳本（opus）、Phaser 骨架（opus）、PhaserGame 元件（sonnet），再派 Player（opus）、互動區與燈光遮罩（sonnet），最後自己接 Station、PlayScreen 與 e2e。
- 修了三個整合時才冒出來的問題：EventBus 改零相依、PhaserGame 延後一幀建立、按 E 改用按鍵事件，都記在第 5 節。
- 35 個測試檔 560 個單元測試、6 個 e2e 全綠，截圖確認斷電光圈、角色、終端機發光、HUD。
- commit：`b6df716`、`96971f1`、`a41da99`（feat）、`fd9ef4e`（test）、本檔另一筆 docs。未 push。
- 下一步：M4-3 過關演出、M4-4 NOVA 對話框、M4-5 HUD。開工前先問範圍。

### 2026-10-01（第二場）

- 完成整個 M2：先定 `src/game/store/types.ts` 契約與 `--game-*` 配色 token，平行派 store（opus）、字型（sonnet）、CRT（sonnet）、Terminal 元件群（opus），再自己整合 `PlayScreen`、`/play`、T1 劇本資料與 e2e。
- Magic UI Terminal 試裝評估後判定不合用，移除改自製。
- 28 個測試檔 489 個單元測試、5 個 e2e 全綠，lint 與 tsc 無錯誤。截圖確認像素邊框、中英混排字型、CRT 效果都正常。
- commit：`090e169`（chore）、`8d5cec1`、`8478284`、`0f88bc3`（feat）、`7925b2b`（test）、本檔另一筆 docs。未 push。
- 下一步：M3-1 素材就位。M3-2 的 Tiled 地圖需要 Danny 手動畫或討論用程式產生，開工前先問。

### 2026-10-01

- 完成整個 M1：先定 `types.ts` 共用契約，再分兩波平行 subagent 實作 FS、解析器、訊息與說明資料、九個指令、補全，最後整合 `shell.ts` 與正解序列測試。
- 22 個測試檔 415 個測試全綠，`pnpm lint` 與 `tsc --noEmit` 無錯誤，`src/game/shell/` 零 React/Phaser 相依。
- commit：`f548b83`（feat）、`5efe4d9`（test）、本檔與 `CLAUDE.md` 目錄現況另一筆 docs。未 push。
- 下一步：M2-1 安裝 zustand 與 persist。

### 2026-09-30

- 建立本進度追蹤檔，`game-design.md` 狀態列與 `CLAUDE.md` 加上指向本檔的入口。
- 未動任何程式碼。
- 下一步：M1-1。

### 2026-09-22

- 完成全部方向討論並寫成 `docs/game-design.md`。
- 安裝 Phaser 4.2.1、啟用 codex plugin、下載 Buch tileset。
- codex 產出主角四版與 NOVA 兩張非人形圖，人臉版六種方向全部淘汰。
- 寫 `scripts/slice-sprites.mjs` 重切四張 sprite sheet 到 `public/sprites/`。
- commit `277d044` 到 `c1e75ce` 共七筆，remote 改 SSH 後 push 成功。
- 下一步：M1 Shell 引擎。
