# 自主執行時的決策（待 Danny 確認）

> 原 `docs/progress.md` 第 8 節，2026-10-16 拆出。編號 #1 起連續，其他文件與程式註解寫的「決策 #N」都指這裡；之後新決策接著編號加在最後。
>
> **節號對照**：決策表裡提到的「第 N 節」「第十二場日誌」是拆檔前 `progress.md` 的節號。第 3 節 → [`archive/progress-milestones-m0-m15.md`](../archive/progress-milestones-m0-m15.md)；第 4 節 → [`progress.md`](../progress.md) 第 3 節；第 5 節 → [`notes/pitfalls.md`](./pitfalls.md)；第 7 節與「第 N 場日誌」→ [`notes/worklog.md`](./worklog.md)；第 9 節 → [`progress.md`](../progress.md) 第 5 節。「M11-2 起」這類任務編號 → [`archive/progress-milestones-m0-m15.md`](../archive/progress-milestones-m0-m15.md)。

2026-10-01 Danny 下 `/goal`「一路做完，疑問照建議並記錄」，之後沒有再用 AskUserQuestion。以下是我自己拍板的事，每一條都可以推翻，推翻時連帶要改的地方寫在括號裡。

| # | 決策 | 理由 | 推翻時要改 |
|---|---|---|---|
| 1 | 已學指令存**完整字串**（`ls -a`、`cd ~`），shell 的 `help` 只學指令名 | 側邊面板要顯示「ls -a」才看得出這台教的是旗標；`help` 只認指令名 | `terminalSession.toCommandName`、`CommandCheatSheet`（M11-2 起） |
| 2 | 指令在**過關後**才算學會，不是開終端機就學 | 4.8 說每台終端機引入新概念，過關代表學會；M3 的「開了就學」是臨時簡化 | `useSolveFlow.handleExecuted`（M11-2 起） |
| 3 | 人影閃現位置夾在**鏡頭視野邊緣**，不是走廊真正的盡頭 | 鏡頭放大兩倍只看得到 15 格，走廊 33 格寬，玩家在中段時真盡頭在畫面外，玩家根本看不到那一幀 | `effects.shadowFlashPosition` 的第三參數、`Station.SHADOW_VIEW_MARGIN` |
| 4 | 終端機開著時過關，Phaser 演出**延到關閉終端機才播** | 場景暫停中播不了，而且玩家正盯著終端機；關掉後看到燈亮比較有戲 | `Station.playSolvedEffect` 的排隊邏輯 |
| 5 | NOVA 過關台詞：全部內嵌在終端機輸出區，關閉後地圖對話框**只重說最後一句** | 避免同一段話在兩個地方完整播兩次 | `useNovaTriggers.deferSolvedLine`／`flushSolvedLine`（M11-2 起） |
| 6 | 進艙區台詞每間**只說一次**，用 `ch1.room.<id>.entered` 旗標跨重整去重；開場 `intro` 用 `ch1.introShown`；結尾 `outro` 六台全過後用 `ch1.outroShown` | 重複觸發會很吵 | `useNovaTriggers` 的開場 effect 與 `enterRoom`（M11-2 起） |
| 7 | 開發模式掛 `window.__kepler9.emit` 除錯鉤子，正式 build 不掛 | 用鍵盤走到 T4 的自動化太脆弱，直接發事件才能截圖驗證演出；之後除錯也方便 | `usePhaserBridge`（M11-2 起） |
| 8 | T6 過關時若 T4 還沒過，也把燈全亮 | 存檔漏了 T4 時玩家摸黑走出去很怪；正常流程 T4 一定先過 | `Station.playSolvedEffect` 的 `ch1-t6` 分支 |
| 9 | `startGame` 多一個選填 `solvedTerminals`，經 `game.registry` 給 Station 還原狀態 | registry 要 `new Phaser.Game` 之後才有，`startGame` 前沒辦法 set | `main.ts`、`PhaserGame.tsx` |
| 10 | ~~設定的「關閉閃爍」目前管不到 Phaser 的人影閃現與鏡頭震動~~ **M9 已補**（#43） | M7-5 做設定選單時一起接，到時加 registry key 或事件 | 列在 M7-5 |
| 11 | zod schema 用 `strictObject`，劇本多打一個欄位就報錯 | 3.4 要求「欄位打錯會直接報錯」，寬鬆物件抓不到打錯的欄位名 | `schema.ts` |
| 12 | 阿彬的本名**沒寫**，病歷寫「慣用稱呼：阿彬」 | 設計說本名只在病歷出現一次，但沒定名字，不擅自編 | `ch1-life-support.ts` T5 的病歷檔 |
| 13 | `day_900.txt` 的 mtime 比喚醒排程被改的時間早 16 分鐘 | 若兩者相同會讓人以為排程是阿彬改的，跟核心真相衝突 | 同上 T3 |
| 14 | 按鍵聲改成**每送出一道指令響一次**，不是每個按鍵 | 每鍵都響很吵，而且 Terminal 元件沒有按鍵 callback | `useSolveFlow.handleExecuted` 開頭的 `sfx:play key`（M11-2 起） |
| 15 | ~~**角色位置不存檔**，重開一律從出生點開始~~ **M9 推翻**（#40） | 地圖只有一層、走回終端機很快；存位置要多一個 store 欄位與 Phaser 讀寫，第一版不值得 | `progress` 加欄位、`Station.createPlayer` 讀它 |
| 16 | 艙區插圖用在**第一次進艙區的插圖卡**（2.6 秒自動淡出），不是終端機背景 | 4.9 要求彈窗後面的地圖要看得到，插圖當背景會擋地圖；進房卡是常見手法也不擋操作 | `SceneCard.tsx`、`PlayScreen` 的 `room:enter` handler |
| 17 | 開場插圖放在 boot log 之後、進地圖之前；結尾插圖放章節結束畫面的 outro 階段 | 4.7 的流程沒有開場插圖的位置，接在 boot log 後當「淡入地圖」的過場最自然 | `TitleFlow` 的 `intro` stage |
| 18 | 重玩本章用 `window.location.reload()` 重新載入頁面 | Phaser 實例、Shell 快取、NOVA 佇列都要重建，整頁重載最乾淨 | `useChapterNavigation` 與 `reloadPage`（M11-2 起） |
| 19 | 選完角就 `touchSave`，所以還沒進地圖就有「繼續」 | 玩家在 boot log 關掉瀏覽器回來，應該能直接進地圖而不是重選角 | `TitleFlow.handleCharacterConfirm` |
| 20 | 音效 agent 看檔名挑的五個檔沒有人試聽 | 我沒有辦法聽；Danny 試聽後覺得不對直接換檔案，key 與路徑在 `audio.ts` | 換 `public/audio/` 的檔案即可 |
| 21 | 卡關台詞與第 9 次錯誤台詞只在**終端機內嵌**顯示，不上地圖對話框 | 這兩種反應都發生在終端機開著的時候，地圖對話框被彈窗蓋住看不到 | `usePressureReactions`（M11-2 起） |
| 22 | 暫停選單只停角色輸入，Phaser 場景不暫停 | 場景暫停會讓終端機發光脈動、NOVA 對話框的淡出 tween 都停住；只停輸入就夠 | `Station` 的 `game:pause` handler |

第八場（2026-10-01，Danny 下 `/goal` 要求做到第六章、不停下來）新增：

| # | 決策 | 理由 | 推翻時要改 |
|---|---|---|---|
| 23 | **六個甲板共用同一張平面圖**，只換艙區 id／名稱、終端機 id／標題、配色 | 第一章的走路 e2e 路線六章都能重用；地圖設計風險降到零；世界觀可解釋成「六個標準艙段串成一環」（4.1） | `scripts/build-map.mjs` 的 `buildDeckLayout`、`events.ts` 的 `DECK_ROOMS`、`story/decks.ts`、`e2e/helpers/deck.ts` |
| 24 | 每章固定六台終端機，T1 在出生房、T6 是出口門控制台，id／標題／艙區由 `story/decks.ts` 統一給 | 劇本、地圖、e2e 三邊對得起來，`chapters.test.ts` 會檢查 | `decks.ts` 的標題表 |
| 25 | 過關演出由劇本宣告（`TerminalDefinition.effect`：powerRestored／openDoor／shadowFlash／flicker／blackout），經 registry 給 Station | Station 不再寫死 `ch1-t4`、`ch1-t6`；新章節不用改 Phaser | `events.ts` 的 `SolvedEffect`、`Station.runSolvedEffect` |
| 26 | 管線、重導向、變數、萬用字元在**所有章節都開放**，不依章節鎖功能 | 4.8「未學指令開放使用」；舊的 `UNSUPPORTED_OPERATOR` 拿掉 | `parser/parse.ts`、`messages.ts` |
| 27 | 管線裡任一指令失敗整行就停並算一次錯誤；每個指令的副作用（cd、export、kill）都套到 session（bash 是子 shell）；M9 起重導向照 bash 先開檔（`>` 先建立或清空、`>>` 不存在才建），指令失敗也會留下空檔 | 對新手清楚；`cd a \| ls` 這種寫法很少見 | `shell.ts` 的 `execute` |
| 28 | ~~`grep` 是字面比對不是正規表示式~~ **M9 推翻**（#45）；沒符合不算錯誤（ok true、沒輸出）維持 | 新手不需要先學 regex；避免懲罰探索 | `commands/grep.ts` |
| 29 | `chmod` 可以改任何檔案（不檢查擁有者）；讀取權限只看擁有者是玩家時的前三碼、否則看後三碼 | 遊戲簡化，第五章只需要「鎖著 → 解鎖」 | `types.ts` 的 `canRead`、`commands/chmod.ts` |
| 30 | 程序是每台終端機各自的清單（`processes`），`kill` 的結果存在 shell session | 不需要全站程序表；第六章每台各自描述 | `shell/types.ts` 的 `ProcessInfo`、劇本 `processes` 欄位 |
| 31 | 換章用整頁重載（`advanceChapter` 後 `window.location.reload()`），重玩本章只清該章（`resetChapter`） | Phaser 要換地圖、Shell 快取與 NOVA 佇列要清空，重載最乾淨；重玩不該把前幾章洗掉 | `useChapterNavigation`、`gameStore.resetChapter`（M11-2 起） |
| 32 | 存檔格式版本不變（仍 v1）：`chapter` 欄位本來就有，終端機與旗標都帶章節前綴 | 不需要 migrate | — |
| 33 | 回顧卡只列「這一章教的指令」（`chapterTeaches`），不是全部已學 | 六章累積會太長 | `chapters/index.ts` |
| 34 | 第六章之後顯示片尾（`ending.ts`，救援船終端機逐句打字）再回標題；標題副標顯示目前章節 | 4.3 的片尾；玩家看得出自己玩到哪 | `ChapterEndScreen` 的 `ending` prop、`TitleFlow.subtitleFor` |
| 35 | 第二到六章插圖用 codex 背景批次產（`generate-ch2-6.sh`），`story/scenes.ts` 的 `AVAILABLE_SCENES` 只列真的存在的圖，沒產出的艙區不顯示插圖卡 | 產圖要一兩小時，不能擋程式；缺圖不能變破圖 | `scenes.ts` |
| 36 | 第一章資料夾裡的 `findTerminal` 搬到 `chapters/index.ts` 跨章節找 | id 有章節前綴不會撞 | — |

第九場（2026-10-02，全程試玩修 bug）新增：

| # | 決策 | 理由 | 推翻時要改 |
|---|---|---|---|
| 37 | 章節結束畫面在六台全解且終端機關閉時**一定**出現；`outroShown` 旗標只拿來跳過 outro 打字段，直接從回顧卡開始（`ChapterEndScreen` 新 prop `skipOutro`） | 否則全解後回標題再「繼續」會被困在完成的甲板，沒有任何 UI 能進下一章（第九場實測重現的死路）；代價是完成的章節不能再自由走動，但設計本來就沒有這個需求 | `useChapterNavigation` 的章節結束判斷、`ChapterEndScreen.skipOutro`、e2e「章節結束畫面的回訪」（M11-2 起） |
| 38 | `>`、`>>`、`\|`、`$變數` 的說明放獨立的 `CONCEPT_DOCS`（`docsConcepts.ts`），由 `getTeachDoc` 在查不到指令時改查；不併入 `COMMAND_DOCS` | 回顧卡與側邊面板需要說明，但它們不是可執行的指令，help 與 man 的指令清單不該混進它們 | `docsConcepts.ts`、`docs.ts` 的 `getTeachDoc`、`chapters.test.ts` 的守門測試 |
| 39 | 缺圖時的佔位文字統一用世界觀內的「影像訊號遺失」 | 原文字「過場插圖（M6 產圖）」把內部里程碑字樣露給玩家；改成敘事內的字樣在補完 12 張插圖前也不突兀 | `ChapterEndScreen` 的 `Illustration` |

第十場（2026-10-06，M9）新增，#40、#41、#45、#46 由 Danny 用 AskUserQuestion 拍板，其餘是我的實作取捨：

| # | 決策 | 理由 | 推翻時要改 |
|---|---|---|---|
| 40 | 存角色位置（章節、整數座標、艙區），`SAVE_VERSION` 升 2；角色走動後**停下**且在某個艙區內才存，換章、重玩該章、新遊戲都清掉 | 推翻 #15；停下才存讓寫入次數很少，門框上（不屬於任何艙區）不存 | `store/types.ts`、`gameStore.ts`、`objects/position.ts`、`Station.createPlayer` |
| 41 | 選章只列第一章到 `furthestChapter`，選定後確認「從頭重玩」，只清該章，其他章與最遠章節保留；到過兩章以上才出現 | Danny 拍板；不會因為回頭看劇情就丟掉後面的進度 | `ChapterSelectPanel`、`TitleScreen`、`gameStore.selectChapter` |
| 42 | 選第一章重走 boot log 與開場插圖卡，其他章直接進 `/play` | 第一章 NOVA 第一句在 boot log 說（`intro[0]`），直接進地圖會少一句 | `TitleFlow.handleSelectChapter` |
| 43 | 關閉閃爍時人影改成 1.4 秒淡入淡出而不是整個拿掉，鏡頭不震、開門不閃光、燈不閃；亮燈序列與斷電照播 | 光敏安全只要擋快速明暗變化，人影是劇情點要保留 | `effects.effectSafety`、`ShadowFigure.flashAt` 的 `style` |
| 44 | 「按 E」直接用 next/font 的 Fusion Pixel，不另做 bitmap 字型 | 已經載入、有中文、跟終端機同一套；解析度 1 加鏡頭放大就是像素顆粒 | `objects/pixelFont.ts`、`TerminalZone.createHintText` |
| 45 | grep 照真的 grep（BRE 預設、`-E`、`-F`），推翻 #28 | Danny 拍板；一般單字照樣比對得到，六章劇本的樣式都沒有特殊字元，不用改劇本 | `commands/grep.ts`、`grepPattern.ts` |
| 46 | 第六章第一次走進 `nv_core` 之後對話框改用 `nova-core`，用艙區旗標判定所以重整後維持 | Danny 拍板；配合「看到本體」的揭露時點 | `story/flags.novaPortraitFor` |
| 47 | 1280 以下「按 E 開啟」提示往上移（`lg:bottom-32`、更窄 `bottom-60`），1024 以下 NOVA 對話框疊到目標面板上方（`bottom-32`） | 1280 以下三個元件塞不進同一排，實測 1024 與 768 都重疊 | `Hud.tsx`、`NovaDialogue`（M11-2 起） |
| 48 | 引號外的反斜線跳脫過的 word 整個標成 `quoted`、不做萬用字元展開 | 沿用引號的整個 word 簡化，不用為每個字元記「是否被跳脫」；遊戲裡沒有需要 `a\ b*` 這種寫法的謎題 | `parser/tokenizer.ts`、`shell.ts` 的萬用字元展開 |
| 49 | 逐日編號以「2027-07-26＝第 1 天」為錨點，差一的全部 +1：ch1 `day_312` → `day_313`（檔名與內文）、ch6 五個 `.mem` 檔名 +1 | ch6 `day_0150`（2027-12-22 冬至聚餐）編號正確，證明錨點既定，錯的是撤離日那一側；已驗算含 2028-02-29 閏日 | `ch1-life-support.ts`、`ch6-nova-core.ts` 的 MEMORY 清單 |
| 50 | 乘員離站改搭**補給船**（第 19、27、28 段與 `evac_2028-06-02.log`），刪掉「逃生艙 1／2 發射」 | ch5 四艘逃生艙的 `launch.log` 全寫「停靠，未使用」、NOVA 也說「四艘，都還在」，ch2 卻寫發射了兩艘；補給船當晚停靠也解釋了「為何偏偏那晚撤離」。玩家自己則是搭 ch6 的 EP-2 離站，不衝突 | `ch2-datacenter.ts` 的 `EVAC_SUMMARIES` 與 evac log |
| 51 | 五位船員的冷凍入艙表改成**評估建檔**（「出艙紀錄：撤離日」→「入艙紀錄：無（原排定於返航前入艙）」） | 名單五人 5 月下旬到撤離夜都在活動（checklist、access.log、艦長日誌），不可能從 4/17 冷凍到撤離日；評估表保留「名單五人、冷凍艙六個」的鉤子 | `ch1-life-support.ts` 的 `crewIntakeRecord` |
| 52 | 場景 PNG 用 sharp 做 256 色量化（`palette: true, quality: 100`），只在變小時取代 | 像素風插圖色數本來就少：抽查最大三張 RMSE ≤0.8%、目視無差異，18.8MB 降到 8.3MB；sharp 專案裡就有，不用 brew 裝 oxipng | 重跑 codex 產圖後要再壓一次；嫌有損就 `git revert 2280f97` |
| 53 | CI（GitHub Actions）只跑 lint、tsc、單元測試、build，不跑 e2e；sitemap 與 `metadataBase` 的網域吃 `NEXT_PUBLIC_SITE_URL`，沒設時用 localhost；分頁 icon 用 nova-eye 縮 64px | e2e 要裝 Playwright 瀏覽器、吃 CI 分鐘數，而且走路類測試在共用 runner 上容易 flaky；網域還沒定 | `.github/workflows/ci.yml`、`src/app/sitemap.ts`、`layout.tsx`、`icon.png` |
| 54 | `directoryNeedsRecursive` 改成呼叫端傳完整示範指令（grep 帶樣式、cp 帶目的地） | 原本一律建議「指令 -r 路徑」，grep 照著打會把樣式當路徑搜錯東西、cp 會缺目的地再錯一次，對新手是陷阱 | `messages.ts` 與 rm／cp／grep 三個呼叫端 |
| 55 | Fusion Pixel 依「src 掃出的專案用字＋ASCII」切子集（931KB → 49KB，1288 字元），`pnpm font:subset` 重切，`subset.test.ts` 缺字時紅燈 | 顯示的中文字全部寫在 src 裡，掃出來就是完整集合；玩家亂打的罕用字 fallback 系統字型仍可讀，只是不是像素風 | `scripts/subset-font.py`、`fonts.ts` 改回全字型檔 |
| 56 | NOVA 的 nova-blip 音效維持只在「首次進艙區台詞」播放，其他說話時機（intro、過關、終端機內）刻意靜音 | 第二輪審計發現與設計 4.10 有落差；但 NOVA 台詞很密，每句都 blip 會吵，進艙區那一下已足以建立「這個聲音=NOVA」的連結 | `useNovaTriggers.enterRoom` 的 `sfx:play` 呼叫處（M11-2 起），想全掛就加進 `NovaDialogue` 與 `DialogueBlock` |
| 57 | T2 的 cd 陷阱用「hint 3 改絕對路徑＋家目錄放 note.txt 指路」解，`cd` 不帶參數維持跟 bash 一樣靜默 | 新手代理實測裸打 `cd` 會被帶回空的家目錄且三段 hint 全失效；讓 cd 印「已回到家目錄」能救但偏離真實 shell 行為（設計第 1 節：指令教學永遠正確） | `ch1-life-support.ts` T2 的 hints 與 fs |
| 58 | ch4 T5 的過關判定加 `fileContains(outbox, "它在聽")`：用 `>` 覆寫掉 abin 的舊訊息就不過關 | banner 宣稱「佇列只能追加」但實測覆寫照樣過關，教 `>>` 的關卡不用 `>>` 也能過；改判定比改 fs 禁寫簡單且 e2e 正解（`>>`）不受影響 | `ch4-comms.ts` T5 的 objective.check |
| 59 | ch6 排程機房（T5）的 banner／onOpen／hint 1 改成不斷言核心已停 | 地圖不鎖終端機順序，亂序先到 T5 會看到「核心：無回應」但核心還活著；每台終端機的 processes 快照是獨立的、不隨章節進度變，文案不斷言是改動最小的解法 | `ch6-nova-core.ts` schedulerTerminal；要做劇情閘門得讓 onOpen 依 solvedTerminals 分支 |
| 60 | 第三輪走查三項刻意不修：cat 空檔案不印提示、find 零結果不印提示（偏離真實 shell，前者用 ch6 發射程序檔補檢查指令、後者用 ch2 T6 的 NOVA 台詞教 `*` 替代）；pathNotFound 不偵測「忘打 $」（messages 層拿不到 env，跨層改動大） | 教學價值與「指令行為貼近真實 shell」衝突時，優先改劇本文案不改指令行為 | 各項的替代修法已上；要翻案看第十二場日誌的第三輪段落 |
| 61 | NOVA 台詞佇列落後：換艙區時丟掉佇列裡「其他房的未播進房台詞」（`useNovaQueue.dropStaleRoomMessages`，正在顯示的讓它播完；intro 與過關台詞不丟）；Enter 跳過不做 | 三個走查代理在五章都重現「走到下一間還在聽上一間」；只丟 `room-` 前綴訊息改動最小。Enter 跳過會跟終端機輸入、插圖卡關閉的 Enter 撞鍵，`NOVA_SKIP_EVENT` 維持佔位 | `useNovaQueue.ts`、`useNovaTriggers.enterRoom`（M11-2 起） |

第十四場（2026-10-09，`/loop` 自主實作 M10 到 M14，多個 agent 平行做）新增，全部是我或 agent 自己拍板的實作取捨：

| # | 決策 | 理由 | 推翻時要改 |
|---|---|---|---|
| 62 | 卡關重複提醒：第一次仍是 3 分鐘或連錯 5 次；之後每次要距離上次提醒或上次 `hint` 滿 2 分鐘，且這段時間打過指令（閒置路徑）或重新連錯 5 次（錯誤路徑）。重複提醒是系統行「輸入 hint 取得提示……」，不是 NOVA 台詞 | 比第一次短才算再提醒；離座不洗版；連錯時不會每錯一次提醒一次；4.6 說提示來自系統，第六章 NOVA 被終止後也不穿幫 | `story/pressure.ts` 的 `STUCK_REPEAT_MS`、`STUCK_REMINDER_LINES`、`checkIdle`；`usePressureReactions` |
| 63 | 用 `ShellExecution.hintUsed` 偵測這一行跑過 `hint`（含管線與 `;`、`&&` 串接），閒置計時從開終端機或上次 hint 起算 | 執行結果是 UI 唯一需要看的東西 | `shell/types.ts`、`shell.ts`、`useSolveFlow` |
| 64 | 概念字典補 `..`、`~`、Tab、`*` 並列進 teaches：ch1 T2 `..`、T3 `cd ~` 改 `~`、T5 加 Tab（這台教三項，4.8 補例外）、ch2 T2 `*`；`help` 排除概念名稱（順便修好 `>`、`\|`、`$變數` 被 help 列為指令） | 回顧卡與面板要看得到這些概念；終端機底部「已學：」照樣列概念 | `docsConcepts.ts`、`help.ts` 的 `isConcept`、各章 teaches |
| 65 | `hintExhausted` 改成「上面是最詳細的一段，用到前一個指令印出的路徑就照實抄」；ch2 T5、T6、ch6 T3 第三段寫絕對路徑，ch6 T6 開頭補 `cd /deck6/escape` 並一行一道 | 不再宣稱「完整答案」；36 台照抄已由 M11-1 常駐測試守住 | `messages.ts`、三章劇本 hints |
| 66 | `;` 串接時任一段失敗整行算一次錯誤且不判定過關；`&&` 被跳過的段不算失敗；目標判定逐段看（`ShellExecution.segments`），任一段成立就過關 | 延續 #27；整行判定會誤判（`grep OPEN x ; cat x` 會被 cat 湊成過關） | `shell.ts` 的 `combineSegments`、`objectives.evaluateObjective` |
| 67 | `~` 只在未加引號的 word 開頭展開；`~abin` 原樣保留、`export A=~/x` 的 `~` 不展開（後者跟 bash 不同）；`cd` 參數超過一個就報參數太多（就算第一個不存在） | 範圍只講 word 開頭；bash 先檢查參數個數 | `parser/tokenizer.ts`、`commands/cd.ts` |
| 68 | 不支援的 `\|\|`、背景 `&`、`<`、`<<`、`2>`、`2>&1`、`&>`、`\|&`、`$()`、反引號回 `UNSUPPORTED_SYNTAX` 並給替代寫法；雙引號內的 `$()` 與反引號也攔 | 原本會被默默誤解；bash 在雙引號內會執行它們 | `parser/parse.ts`、`messages.unsupportedSyntax` |
| 69 | `clear ; pwd` 清掉 clear 之前的輸出、保留之後的 | 照 bash | `shell.combineSegments`、`useTerminalKeyboard` 的 submit |
| 70 | 面板快捷鍵 Alt+C（已學指令）、Alt+L（NOVA 對話紀錄），地圖與終端機共用，比對 `event.code`；兩個面板合成 `SidePanels` 同時只開一個，z-41 疊在終端機上、不透明、最高 60vh，擋 mousedown 保住輸入框焦點（代價：面板文字不能選取；1024 寬時蓋住終端機右上的「[Esc] 關閉」字樣） | shell 與地圖都沒用 Alt；Ctrl 多為瀏覽器保留、F 鍵在 Mac 要 fn；避開 Firefox 選單加速鍵與 Mac Option 死鍵 | `useSidePanelShortcuts.ts`、`SidePanels.tsx`、4.6 按鍵表 |
| 71 | NOVA 對話紀錄只放記憶體，重整就清空；被換房丟掉的台詞照順序列出並標「未播出」 | 不動存檔格式 | `useNovaQueue` 的 `history`、`NovaLogPanel` |
| 72 | 過關系統行用 ☑（不是 ✓），青綠 `tone: "success"`；powerRestored 與 blackout 的終端機過關當下不播 power（前者關終端機亮燈時 Station 會播；後者 Station 刻意安靜變黑，審查後補上），其他台過關當下播一次 power | Fusion Pixel 與 VT323 沒有 U+2713；避免同一次過關響兩聲 | `solvedFeedback.ts`、`OutputBlock`、`TerminalFrame` 的已完成徽章 |
| 73 | 目標面板：開著且未過關的那台 > 附近且未過關的那台 > 第一台未過關；已過關的不搶目標 | 審計驗證段建議不加「附近」，但任務列寫要加；排除已過關後跳動很少 | `story/currentObjective.ts` |
| 74 | 第一章 T1 過關前在畫面上方常駐「方向鍵移動 · E 互動 · Esc 選單」，終端機開著時隱藏；扣氧時 O2 數字閃琥珀並浮出 -1（0.9 秒），終端機開著時 O2 讀數拉到黑幕上（z-41），減少動態效果時只變色 | 方向鍵與 Esc 在終端機裡另有意義；錯誤只在終端機裡發生 | `ControlsHint.tsx`、`OxygenReadout.tsx` |
| 75 | `/play` 沒選角就 `router.replace("/")`，sitemap 拿掉 `/play`、加 noindex，但 robots.txt 不擋 `/play` | robots 擋了爬蟲就讀不到 noindex | `PlayScreen`、`sitemap.ts`、`play/page.tsx` |
| 76 | 觸控提示只用 `(pointer: coarse) and (hover: none)` 判斷，做成標題上可略過的疊層，略過記在 sessionStorage | 觸控筆電的 `maxTouchPoints` 也大於 0；接鍵盤的 iPad 不該被擋 | `useTouchWarning.ts`、`TouchWarningPanel` |
| 77 | 標題一掛載就排預取：1 秒後在閒置時段 `router.prefetch("/play")` 並動態 import `PhaserGame`（下載加評估），接著用一次一張、低優先的 `Image` 佇列預載本章插圖；`/play` 掛載時也排同一條佇列。代價：`PhaserGame` 的模組圖會在標題頁評估、觸控裝置也會下載 Phaser | 「繼續」路徑沒有 boot log；public 檔是 `max-age=0`，`<link rel=preload>` 沒用到會警告 | `usePlayPrefetch.ts`、`useScenePreload.ts`、`lib/preload.ts` |
| 78 | Phaser 用 `next.config.ts` 的 `turbopack.resolveAlias` 換成 `phaser-arcade-physics.min.js`；移除 swr、react-hook-form、@hookform/resolvers、lucide-react、class-variance-authority、@radix-ui/react-slot、tw-animate-css 與兩個沒用的 ui 元件，保留 `@next/playwright` | 省 33KB gz；這些相依零引用；`@next/playwright` 是 Danny 刻意加的 | `next.config.ts`、`phaserBuild.test.ts`、`package.json`、CLAUDE.md |
| 79 | 存檔寫入失敗時遊戲照常、頂端一行提示（狀態放 zustand 外的 `saveStatus.ts`，避免 set 旗標又觸發寫檔）；較新版本存檔整個分頁不讀不寫；舊版升級前備份到 `kepler9-save.backup.v<舊版號>`；某台終端機 session 壞掉就整台用劇本初始狀態重建 | 保護原始資料優先；部分修復要逐欄位判斷太複雜 | `gameStore.safeLocalStorage`、`saveStatus.ts`、`sessionRecord.ts`、`terminalSession.ts` |
| 80 | 素材缺地圖、tileset、sprite 時停在 Preloader 顯示全畫面提示與重新載入；只缺音效時頂端可收起提示，解碼失敗不提示 | 沒聲音也能玩 | `scenes/assetCheck.ts`、`AssetLoadErrorNotice` |
| 81 | 新指令 less、tree、cut、diff、which 只開放不教：diff 有差異與 which 找不到都不算錯誤；which 的路徑照 Debian（一般 `/usr/bin`、hint 在 `/usr/local/bin`、cd／export／help／history 內建），沒有 PATH 時用預設值且 PATH 只影響 which；tree 目錄名尾加 `/`；cut `-c` 以字元計；less 只在管線最後且沒重導向時分頁，分頁中 Esc 跟 q 一樣只離開分頁 | 同 #28 不懲罰探索；新手看不懂安靜回 1；GNU 的 `-c` 以位元組計會切壞中文；照真 less 在非終端機輸出的行為 | `commands/{less,tree,cut,diff,which}.ts`、`docsExtra.ts`、`Pager.tsx`、`pagerModel.ts` |
| 82 | 共用正解 `src/game/chapters/solutions.ts`（零 import，e2e 用相對路徑）；36 台 hint 第三段照抄測試 allowlist 為空，抽取規則認「輸入」「例如」、頓號、一行一道與「再按 Tab」；第一章 e2e 改打完整正解 | 只維護一份已驗證的正解 | `hintCommands.ts`、`e2e/helpers/deck.ts` 的 `terminalScripts` |
| 83 | 沙盒是獨立路由 `/sandbox`（列進 sitemap），標題選單最後一項「練習模式」；Alt+R 直接重置不確認，Esc 先確認再回標題；`hint` 輪流給 10 則練習建議；只讀 store 的設定、不呼叫 action；練習檔案設在 2027 年的訓練環境，測試擋主線關鍵字 | 不載 Phaser、可直連；不劇透；光敏設定要生效 | `src/app/sandbox/`、`components/sandbox/`、`game/sandbox/` |
| 84 | PlayScreen 拆成 `useTerminalSessions`、`useNovaTriggers`、`usePressureReactions`、`useSolveFlow`、`usePauseMenu`、`useChapterNavigation`、`usePhaserBridge`、`Hud`、`TerminalModal` 等；Phaser 事件訂閱用 React 19 的 `useEffectEvent` 只掛一次；拿掉 `DEFAULT_CHARACTER` | 每個 hook 可單獨測；EventBus 不再每次 render 重掛（測試鎖住 `onGameEvent` 只呼叫 5 次） | `src/components/game/` 各檔 |
| 85 | e2e 座標鉤子獨立掛在 `window.__kepler9Player`；路徑點寫死在 `e2e/helpers/deck.ts` 的 `SLOT_GEOMETRY`；本機 workers 4、retry 本機 1／CI 2、html 報告不自動開 | 六張圖碰撞層相同；Playwright 層 retry 才會標 flaky | `playerProbe.ts`、`deck.ts`、`playwright.config.ts` |
| 86 | 存檔 v3：`progress.clearedAt`、頂層 `stats`（每章 `playTimeMs`、`errors`、`hints`）、每台終端機 `scriptHash`；v2→v3 時若已有 `ch6.outroShown` 就當作已逃離（時間用 `savedAt`）；migrate 搬到純模組 `store/migrate.ts` | 一次升版涵蓋 M12-4 與 M14-1 | `store/types.ts`、`migrate.ts` |
| 87 | 劇本雜湊（FNV-1a 64 位元、鍵排序 JSON）只涵蓋 fs、banner、initialCwd、env、processes，不含 hint、NOVA 台詞、目標、teaches（那些每次都讀最新劇本）；雜湊不同且未過關的終端機用新劇本重建，保留歷史、hint 次數、錯誤數與輸出紀錄，插一行「已更新」；**舊 v2 沒有雜湊的紀錄也算改版**（未過關的會重建一次） | Danny 潤稿時最需要；現有存檔多半已過時，代價是未過關終端機裡改過的檔案會回到劇本初始 | `story/scriptHash.ts`、`terminalSession.createTerminalSession` 的 `revised` |
| 88 | 通關後標題副標「已逃離 Kepler-9」、拿掉「繼續」、第一項換成「通關紀錄」（每章與總計）；用選章重玩會讓「繼續」回來。**推翻 #34 與第九場「通關後副標停在第六章屬預期」** | 通關後再按繼續重播片尾沒有意義 | `selectIsGameFinished`、`TitleScreen.buildItems`、`ClearRecordPanel` |
| 89 | 遊玩時間只算 `/play` 在前景、本章還沒全解、沒開暫停或設定選單的時間，每 30 秒寫一次、兩次寫入間隔最多算 2 分鐘；錯誤數跟扣氧同一個定義（含過關後打錯）；重玩該章清掉該章統計，新遊戲全清；統計只列數字不評分 | 掛機與背景分頁不灌水；4.8 不懲罰探索 | `usePlayTime`、`recordCommandStats`、`ChapterEndScreen` |
| 90 | 存檔匯出匯入只放標題的「存檔管理」：匯出下載 `kepler9-save-YYYYMMDD-HHmm.json`，匯入選檔後走 migrate 與完整 zod 驗證（任一台壞掉就整個拒絕），覆蓋前確認、預設取消，成功後重載；版本較新時匯出原始字串 | 匯入要整頁重載，暫停選單不適合；zod 用動態載入不進標題 bundle | `SaveManager.tsx`、`saveImport.ts` |
| 91 | registry 維持一個 key 一個值，加型別化的 `writeRegistryValues`／`readRegistryValue`，九個 key 的執行期驗證集中在 `REGISTRY_PARSERS`（壞值比原本更嚴格地退回預設，character 不合法直接丟錯）；不採審計建議的單一 bootConfig 加 zod | spawnPoint 要地圖載完才能驗範圍，各欄位壞值的退回方式不同 | `src/game/phaser/registry.ts` |
| 92 | 指令選項切分抽成 `commands/options.ts` 的 `splitOptionsAndOperands`（`endOfOptions`、`loneDashIsOperand`、`takesValue` 判斷函式三個參數保留各指令差異）與 `parseFlagArgs`；`story/objectives.ts` 也改用它；`export` 維持自己的迴圈；六章終端機身分全部改用 `deckTerminalIdentity`，`lines()` 抽到 `chapters/helpers.ts`，36 台的 id／標題／艙區由 `identities.test.ts` 寫死守門 | `export = -n` 的錯誤順序跟共用切分不同；沙盒的 `lines()` 不綁劇本所以沒共用 | `options.ts`、`export.ts`、`chapters/helpers.ts` |
| 93 | 審查修正：`PlayScreenReady` 的章節只在掛載當下讀一次，不訂閱 store | 換章是整頁重載（#31），按下「進入下一章」到頁面真正卸載之間 store 已經是下一章，intro effect 會提前把 `chN+1.introShown` 寫掉，第 2 到 6 章開場台詞永遠不出現（ef64bd3 之前就有的 bug，整章 e2e 先種旗標所以沒抓到） | `PlayScreen.tsx` 的 `chapterNumber` |
| 94 | 章節結束畫面開著時 Esc 不開暫停選單 | 兩個 dialog 的 Enter 都掛在 window，會同時觸發（按「繼續遊戲」卻進了下一章） | `usePauseMenu` 的 `chapterEndOpen` |
| 95 | 終端機的 NOVA 開場白改用 `ch<n>.terminal.<id>.opened` 旗標去重；舊存檔在開啟當下若 transcript 已有 `nova-open-` 前綴就視為說過並補旗標，不升存檔版本 | `clear` 或 transcript 超過上限被截掉時，舊做法會重說開場白 | `TerminalModal.tsx`、`story/flags.ts` |
| 96 | 結束碼跟「算不算錯」分開：`CommandResult.exitStatus` 選填，grep 沒選到、diff 有差異、which 找不到回 `ok: true, exitStatus: 1`，`&&` 看結束碼（管線取最後一個指令），扣氧與 `;` 的整行算錯照舊看 `ok` | 教學說「左邊成功了才做右邊」，`grep NOPE f && echo 找到了` 原本會印「找到了」；同時延續 #28、#81 不扣氧 | `shell/types.ts`、`shell.ts` 的 `exitStatusOf`、三個指令 |
| 97 | 「看輸出」的過關判定也看 less 分頁內容（`objectives.visibleOutputLines`），11 台受影響，`solutions.test.ts` 守住「正解最後一步接 `\| less` 也過關」 | 玩家確實在畫面上看到答案，`man less` 自己也教 `\| less` | `objectives.ts`、ch4 的 `lastOutputLineContains` |
| 98 | `which /usr/bin/ls` 認得指令的安裝路徑；但照抄完整路徑執行不開放，回說明「直接打 ls」並算錯誤 | 開放執行的話目標判定的指令名會變成 `/usr/bin/cat`，判定全都要改；3.3 原則是不支援的寫法說清楚並給替代 | `which.commandAtInstallPath`、`messages.fullPathCommand` |
| 99 | less 的 `/`、`?` 搜尋在狀態列放真的輸入框（接輸入法與貼上），Esc 只取消搜尋、組字中的 Enter／Esc 交給輸入法；分頁器列高改量 `offsetHeight` | 原本打不進中文；開場 scaleY 動畫中量 rect 會把一頁算成 30 列 | `Pager.tsx` |
| 100 | 瀏覽器整個封鎖網站資料（讀取就丟 SecurityError）時當成沒有存檔、回報 `unavailable` 讓讀檔完成；存檔提示移到 `top-16`（讓開上方 HUD）、`/sandbox` 不顯示；素材提示移到 `top-28` | 原本標題、`/play`、沙盒都卡在讀取中且沒有提示；提示條蓋住操作提示與沙盒標題列 | `gameStore.safeLocalStorage`、`saveStatus.ts`、`SaveStatusNotice` |
| 101 | 44 張場景插圖從 PNG 改成 lossy WebP 品質 85（`nova-eye`、`nova-core` 立繪仍是 PNG）；`resize-scenes.mjs` 的遊戲用輸出改成 WebP，256px 預覽維持 PNG | Danny 為了部署要求轉檔。8.0MB 降到 2.6MB（每張 31 到 87KB）。RMSE 1.6% 到 2.9%，高於 #52 的 0.8% 門檻，但逐張比對：平均每像素差 2.5 到 4.8／255、差超過 48 的像素不到 0.07%，放大三倍目視只有雜訊格稍微變柔，沒有色塊或色偏 | 嫌糊就把 `resize-scenes.mjs` 的 `quality` 調高後重壓（原圖不在的那幾張要從 git 歷史拿 PNG 再轉），或 `git revert` 這個 commit |
| 102 | 拼字建議用 Damerau–Levenshtein（相鄰對調算一次），2 到 5 個字只接受距離 1、6 個字以上接受 2，單一字元與含非英文字母的不猜，同分時已學的優先再照註冊順序；判斷順序是完整路徑 → 忘記空格 → 站上沒有的程式 → 大小寫 → 拼字，全部仍算錯誤、照舊扣氧 | 避免亂猜；精確的程式名比模糊比對可靠；`lss` 會先被「忘記空格」攔成 `ls s` 是既有順序，沒改 | `parser/suggest.ts`、`shell.ts` 的 `describeUnknownCommand` |
| 103 | 「站上沒有的程式」清單含編輯器、套件管理、程式語言、網路工具與 Windows 命令提示字元的 cls、dir、del、copy、move、ren、md，各給專屬說明 | 台灣新手常從 cmd 過來；說法寫「這台終端機沒有」，因為真的 Linux 其實有 `dir` | `suggest.ts` 的 `findUnavailableProgram`、`messages.programNotInstalled` |
| 104 | `unset` 只開放使用、不進任何章節 `teaches`；不存在的名稱靜默成功、`-v` 接受、`-f` 與其他選項回「沒有這個選項」；`which unset` 回內建；沙盒第 9 則練習建議改成提到 unset | bash 行為；劇情核心但不改既有課表 | `commands/unset.ts`、`sandbox/practice.ts` |
| 105 | 彩蛋做 whoami、id、last、sudo、exit、logout；sudo、exit、logout 是 `ok: true` 加結束碼 1（不扣氧，`&&` 右邊不跑）；帳號表與登入紀錄可注入，沙盒換成自己的一份（只有 root、tech）；沒做 date、hostname、uname、who | 各章劇本的「現在」不同（喚醒 08:15、第二章 09:12、第四章 14:02），shell 沒有各章時鐘，固定時間會矛盾；其餘幾個不夠發毛 | `commands/{whoami,id,last,sudo,exit,accounts}.ts` |
| 106 | 帳號表：captain 1001、engineer 1002、medic 1003、comms 1004、abin 1005（都在 crew 群組）、tech 1006（不在 crew）、共用帳號 eng 2001；`last` 裡阿彬那次登入是 3/10 02:38 到 02:53 | 審查發現劇本出現過這些帳號；登入區間要包住阿彬那天凌晨留下的所有檔案時間（有測試掃六章劇本與留言） | `commands/accounts.ts`、`accounts.test.ts` |
| 107 | 提前用上的認可沿用 `tone: "success"`、用 ☆ 開頭；偵測指令名、帶旗標的教學（從各章 `teaches` 自動收集）、語法 `\|` `>` `>>` `*` `~` `$變數` `;` `&&`，全部看 token；旗標 `insight.<概念>` 不以 `ch<n>.` 開頭，整份存檔每樣只認一次；不認 hint、help、sudo、exit、logout 與教學位置在前面章節的；一次最多兩行、每行最多三項 | 認可是遊戲系統的肯定、不是 NOVA 說的，所以不用全息藍；會 bash 的玩家每台都用 grep，不能洗版；sudo 這類被拒絕的不算解法 | `story/solutionInsight.ts`、`solvedFeedback.createInsightEntry` |
| 108 | 阿彬的留言不寫進劇本快照，改成「覆蓋層」：每台終端機新建、從存檔還原、劇本改版重建時都補寫還沒找到又不存在的留言；全新建立時已找到的也補（重玩讀得到），還原時尊重玩家刪除；不算進劇本雜湊；VFS 新增只增不改的 `seedFile`、`seedDir` | 寫進快照的話，老存檔裡已過關的終端機不會重建，永遠找不到（Danny 提出的疑慮） | `story/abinNotes.ts`、`terminalSession.ts` |
| 109 | 八則留言的位置與找法見 `abinNotes.ts` 的 `ABIN_NOTES`（第一章 1、第二章 2、第三章 1、第四章 2、第五章 1、第六章 1），時間都早於 day_900（4.3：那是阿彬留給玩家的最後一則）；「找到」是這次看得到的輸出（含各段與 less）有一行含該則的 signature，只看放在這台的留言 | 劇情規則；grep 只撈到別行不算，只列檔名的 ls、find 不算 | `abinNotes.ts`、`useAbinNotes.ts` |
| 110 | 回信：第四章通訊紀錄台的留言請玩家寫 `/home/abin/reply.txt`，取第一個非空行、去控制字元、最多 40 字，之後改就用最新的，刪掉或改空白保留上一次；讀檔與匯入也套同樣的清理；有回信時第五章 T4 多一份稽核紀錄（abin 讀過）、第六章 T3 多一份 NOVA 記憶檔引用原文，不算收集品，回信改了之後已生成的證據不跟著改 | day_900 仍是最後一則留言，所以回應寫成「證據」不是新留言；稽核紀錄說 abin 上一次登入是 3/10，留白是誰讀的 | `abinNotes.ts`、`gameStore.sanitizeAbinNotes`、`saveImport.ts` |
| 111 | 「阿彬的留言」是右側面板第三個標籤，快捷鍵 Alt+A（Mac ⌥A），第一章宿舍那台過關後出現（或到過第二章、找到過任何一則）；未到過的章節不給線索、每章一行標則數；找到時插一行暗色系統行；通關紀錄多一行收集數 | A 取 Abin，避開 Firefox 選單加速鍵與 Mac 死鍵；線索不能劇透那一章才揭露的事（審查後改了第三章那則） | `AbinNotesPanel.tsx`、`SidePanels.tsx`、`ClearRecordPanel.tsx` |
| 112 | 面板快捷鍵改在 window 的 capture 階段攔截 | 審查發現 A 也是往左走的鍵，開關過暫停選單後監聽順序排到 Phaser 後面，按 Alt+A 角色會往左走 | `useSidePanelShortcuts.ts` |
| 113 | 集滿八則時片尾在「你是……」之後多一段：救援船解壓縮第六章那筆「目的地 ARGO」的上傳，認得出八份 abin 的文字檔，有回信時多一行引用 | 維持「阿彬的下落不明說」「NOVA 沒死透」的留白（4.3） | `chapters/ending.ts` |
| 114 | 存檔 v4：頂層多 `abinNotes: { found, reply }`，v3 → v4 補空的；新遊戲清、重玩與選章保留；匯出也帶這個欄位 | 收集品跨重玩保留；回信要存字串，旗標只能存 true | `store/types.ts`、`migrate.ts`、`gameStore.ts`、`saveImport.ts`、`saveExport.ts` |
| 115 | 除役倒數在 HUD 左上 O2 下方，格式 `T-81d 20:25:00`；遊戲內時間＝喚醒時間 2031-03-12 08:15 加第一章到目前章節的 `playTimeMs`，再加本次前景計時（停的條件同用時）；前四章與第五章 T1 前「站務排程」、第五章 T1 過關後與第六章「遠端除役」（琥珀）、第六章 T4 後「遠端除役 · 目標無回應」（數字全息藍）、已逃離不顯示；終端機開著時留在黑幕下 | 不先講破第五章的揭露；不加存檔欄位；劇本「82 天」是日期相減，跟精確剩餘 81 天多不衝突 | `components/game/decommission.ts`、`DecommissionCountdown.tsx` |
| 116 | 倒數的已知限制：重玩章節會清該章統計，倒數「倒回」那一章開始的時間；倒數只算遊玩時間，跟各章劇本裡的「現在」（第二章 09:12、第四章 14:02）不同步 | 要只減不增得加存檔欄位；差幾小時玩家幾乎察覺不到 | 同上 |
| 117 | 開場 boot log 在「主電源離線」之後加一行暗色「站務排程：1 項待執行（T-81d 20:25:00）」 | 跟 HUD 同一個詞，看得出是同一件事，不提除役 | `BootLog.tsx` |
| 118 | 存檔失敗提示移到 `top-24`、音效失敗提示移到 `top-44` | 審查發現存檔提示蓋住倒數、兩個提示在 768 寬互疊 | `SaveStatusNotice.tsx`、`AssetLoadErrorNotice.tsx` |
| 119 | NOVA 看狀態：六種反應依序 unsetNovaDir、abinReply、abinNote、abinHome、identity（whoami／id 查自己）、hintHeavy（本章 6 次或同台第 4 次）；旗標 `ch<n>.nova.<種類>` 每章一次；同一道指令最多一句，這道已有 NOVA 台詞（過關、第一次卡關、第 9 次錯誤）就延到下一道，pending 只在記憶體；第六章 T3 過關後換「不演了」的口吻，T4 過關後一句都不說；阿彬事件用 `handleExecuted` 的回傳值而不是 callback | 一次性事件直接跳過就永遠聽不到；callback 在過關流程前觸發，不知道這道指令 NOVA 有沒有說話；hint 台詞可以酸但不否定 hint（4.6） | `story/novaReactions.ts`、`useNovaReactions.ts` |
| 120 | 第五章 T4 安全管制台的 env 加 `NOVA_DIR=/opt/nova`，同目錄加 `audit_note.txt` 線索，玩家可以 `echo "$NOVA_DIR/"`、`unset NOVA_DIR` 再 echo 親手看到只剩 `/`；不是過關條件；第五章起 `unset NOVA_DIR` 才有 NOVA 反應並燈閃（關閉閃爍時不閃） | 排程日誌就在這台；前四章說了就劇透 | `ch5-bridge.ts`、`novaReactions.ts` |
| 121 | 第六章 T4 過關（NOVA 核心被終止）後，T5、T6 錯第 9 次不再說 NOVA 的錯誤台詞，燈閃與門聲照舊 | 既有穿幫，E 組順手修 | `usePressureReactions.ts` |
| 122 | 章節開場（第二到六章）依前一章找到的留言多一句，第五章有回信時換一句；跟著 `introShown` 每章一次 | 讓「它一直在看」延伸到地圖上 | `useNovaTriggers.ts` |
| 123 | 劇本可用 `readonlyEnv` 把自己 `env` 的變數設成唯讀（bash 的 readonly）：`unset` 拿不掉、`export 名稱=值` 改不了值，`export` 列表標 `declare -rx`；唯讀清單不存檔、建立與還原時從劇本帶入；第五章 T1 的五個站務變數、T5 的 `POD_DIR`、T6 的 `AUTH_DIR`；唯讀清單算進劇本雜湊 | 審查發現 `unset STATION_MODE` 之後 T1 永遠過不了關（判定要 env 印出它）；T5、T6 unset 後照抄第三段提示會走錯路徑；清單不算進雜湊的話，修正前就 unset 過的舊存檔還原後連 export 都補不回來 | `story/types.ts`、`schema.ts`、`shell.ts`、`unset.ts`、`export.ts`、`ch5-bridge.ts` |
| 124 | 審查列為「接受、不修」：`if` 被建議成 `id` 這類拼字雜訊；`cat 留言 ; clear` 畫面上沒看到也算找到；`rm -r` 掉留言目錄後補回的父目錄擁有者是 abin；同一頁面內刪掉留言後關開終端機不補（要重整）；每次升級存檔多留一份舊版備份 | 影響小，修的成本比效益高 | 見各項 |
| 125 | 第二輪審查修正：延後的 `abinHome`（「這裡是阿彬的家目錄」）在要說的那一道指令跑完時已經不在 `/home/abin` 底下就丟掉；第五章 T4 稽核備註改成明寫 `echo "$NOVA_DIR/"`；設計文件 4.14 註明 `abinNote`、`abinReply` 重玩不會再說；接受不修：第六章玩家可以 `kill` 掉自己的 `-sh`（原本就有的行為），之後查帳號的那句「ps 裡也有你」不成立 | 跟地點有關的台詞只有這一句；照字面「把 rm 換成 echo」會印出 `-rf /` | `novaReactions.decideNovaReaction` 的 `cwd`、`ch5-bridge.ts` |

第十八場（2026-10-16，整理 docs/ 資料夾）新增：

| # | 決策 | 理由 | 推翻時要改 |
|---|---|---|---|
| 126 | docs/ 結構：活文件留在 `docs/` 根目錄與 `notes/`（陷阱、決策、日誌），過時整段逐字搬進 `archive/`；`assets-draft/`、`screenshots/` 不搬。`progress.md` 只留開工清單、快照、里程碑表、待辦、慣例、候選六節；`game-design.md` 刪掉目錄規劃、第一版工作順序、尚未定案三節，地圖配置從第 9 節改為第 7 節，並把 15 處跟程式碼不符的敘述改成現況（只改事實不改設計，清單見 `notes/worklog.md` 第十八場）。節號改了，所以 `CLAUDE.md`、`README.md`、`ci.yml` 與程式註解裡的指向一併改；封存檔與日誌、決策表內文的舊節號不逐條改，改在檔頭放對照表 | 兩份主文件都超過 600 行，一半以上是已完成的任務細節與歷史；拆開後開新 session 要讀的東西變少，陷阱與決策也比較好找。`assets-draft/` 綁著 `.gitignore`、三個腳本與只在本機的原圖，搬了風險大、好處小。逐字搬移是為了不在整理時偷改歷史 | 要併回去就把 `notes/` 三檔接回 `progress.md`、`archive/` 兩個封存檔接回原節；`game-design.md` 第 7 節改回第 9 節時要同步改 `events.ts`、`effects.ts`、`currentObjective.ts`、`build-map.mjs` 的註解 |
| 127 | 校對 workflow 找到的三處 mtime 矛盾直接修：第一章 pod_04、pod_05 入艙表（病患編號 0418）另設 `CREW_INTAKE_DAY2_MTIME` 2028-04-18 10:30，排在阿彬 4/18 10:05 的笑話留言之後；第二章 `quarterEnd` 季末在玩家到站（`ARRIVAL_MTIME`）之後時改回最後一次例行巡檢 2031-03-01，2031 Q1 不再是未來日期；第四章 `entry.log` 的 mtime 改成 `COMMS_NOW_MTIME`（最後一行就是玩家 14:02 的登錄），`ABIN_VISIT_MTIME` 常數拿掉。另外六處矛盾改哪邊都會動劇情，列在 `progress.md` 第 3 節等 Danny | 三處都是「檔案的修改時間比檔案內容自己寫的時間早或晚」，`ls -l` 看得到、沒有任何解法或線索靠它，修了只會更一致；mtime 算進劇本雜湊，舊存檔未過關的那幾台會重建一次（#87 既有行為） | `ch1-life-support.ts` 的 `CREW_INTAKE_DAY2_MTIME`、`ch2-datacenter.ts` 的 `quarterEnd`、`ch4-comms.ts` 的 `entry.log` |

第十九場（2026-10-16 深夜，`/goal` 自主實作十一項功能：教學深度、劇情與氛圍、光敏確認、分頁互蓋、credits）新增。十一個 opus agent 各在一個 worktree 平行做、主 session 逐一合併解衝突，每項的完整規格在 `game-design.md` 4.15 到 4.25，這裡只記取捨：

| # | 決策 | 理由 | 推翻時要改 |
|---|---|---|---|
| 128 | `explain`（4.15）只在一行開頭才拿到整行原文（shell 特判），`\|`、`>` 都是被說明的內容不會執行；回傳空的 `segments` 代表「什麼都沒執行」，目標判定、NOVA 反應、認可都不用改；是遊戲系統指令（`SYSTEM_COMMANDS`、`SYSTEM_HELP_COMMANDS` 都加了） | 不加引號就能用；`explain ls \| wc -l` 不能拿來湊過關 | `Shell.executeExplain`、`explainTargetOf`、`solutionInsight.ts`、`displayGlitch.ts` |
| 129 | 選項表 `docsOptions.ts` 照各指令實作列、測試拿每個選項真的執行一次核對；參數角色超出原規格（樣式、文字、權限、帳號、程序編號……）；Tab 補選項照表的順序、對不上退回補路徑，`$` 補變數不附說明 | grep 的樣式寫成「參數 x（目前不存在）」會誤導 | `docsOptions.ts`、`completion.ts` |
| 130 | `\|\|`（4.16）：被接住的失敗段不算這一行的錯誤（下一個實際執行的段落用 `\|\|` 接才算接住），被接住的段也不能拿來過關 | 玩家刻意處理失敗；避免「目標開不了的 cat 正解」照樣過關 | `shell.ts` 的 `hasUncaughtError`、`objectives.ts` 的 `!segment.isError` |
| 131 | `$( )`：每個開一個子 shell（cwd、env、程序、hint 計數、歷史拷貝，檔案系統共用），裡面失敗不算錯、`kill` 不影響外面、`hint` 不算用過、`less` 不開分頁；替換輸出記在 `ShellExecution.substitutions` 給目標判定代入；裡面的語法錯誤在執行前擋整行；`$((` 判不支援 | 子 shell 語意；`cat $(find …)` 才算讀了那個檔；不默默把 `(1+2)` 當指令 | `runSubstitution`、`replaySubstitutions`、`tokenizer.scanSubstitution` |
| 132 | 錯誤輸出重導向只分「`ok: false` 的輸出整個算錯誤輸出」；`2> 檔案`、`2>>`、`2>&1`、`&>`、`&>>`、`1>` 做，`>&2`、`\|&`、`<<<`、`<(` 等維持不支援；`/dev/null` 只在重導向特判；被導走的失敗仍扣氧；重導向本身的錯誤一律印畫面 | 指令不分 stdout／stderr，改每個指令代價太大 | `tokenizer.ts`、`parse.ts`、`runPipeline`、`routeFailure` |
| 133 | Ctrl+R：Enter 直接執行、Esc／←／→／↑／↓／Tab 帶回那筆、Ctrl+G 還原按 Ctrl+R 之前的輸入；關鍵字變長從目前那筆往舊找、刪字從最新重找；⌘R、Ctrl+Shift+R 不攔 | 照 bash；會按 Ctrl+G 的人都懂 bash | `historySearch.ts`、`useTerminalKeyboard.handleSearchKey` |
| 134 | 輸出欄位說明（4.17）做 `ls -l`、`ps`、`top`、`last` 四種，各自只自動展開一次（記憶體內、重開終端機還原的舊輸出不自動展開）；管線最後是別的指令或導向檔案不標；切不到資料列不出按鈕；判 `-l` 用 `splitOptionsAndOperands` | 四種夠用；不干擾 `ps \| grep` 這類過濾後的輸出 | `outputFields.ts`、`OutputBlock.tsx` 的 `LegendCommandBlock` |
| 135 | 新指令（4.18）：各章時鐘 ch1 08:15、ch2 09:12、ch3 10:15、ch4 14:02、ch5 15:07、ch6 16:21（都是 2031-03-12，`meta.ts` 的 `clock`，規則是不早於該章任何檔案、程序與回信證據的時間），練習機 2027-08-14 10:30；`date` 不走真實時鐘、同一台裡不動 | 設計文件 3.3 原本「沒做 date」的條件就是要有各章的「現在」 | `CHAPTER_METAS`、劇本的 `now`、`SANDBOX_NOW` |
| 136 | `alias` 只收單一指令或管線、不進存檔、同一行先定義就生效；`which 別名` 不算錯誤但說明是別名；`xargs` 沒項目不執行、子指令失敗結束碼 123、`-I` 以整行為項目；`sed` 只做 s、p、d；`ALL_COMMANDS` 裡 sed 排在 tee 前（打錯的 `see` 建議 sed） | 照 bash 與 GNU 的最小子集；別名跟沒寫進設定檔一樣重開就沒了 | `aliases.ts`、`xargs.ts`、`sed.ts`、`index.ts` |
| 137 | 便條（4.19）每章「入口一則＋另一間房一則」共 8 則，文字不碰點名、人數、真相，寫的人只用職稱；座標在 `mapNotes.ts` 與 `build-map.mjs` 各存一份靠測試核對；外觀 tile 45（tileset 沒有紙張類）、不發光、HUD 不加提示；讀便條不存檔、不記對話紀錄、不補存角色位置 | 入口一定會經過；終端機的光是斷電時的方向指引，便條不搶 | `mapNotes.ts`、`DECK_NOTES`、`NoteZone.ts`、`MapNoteReader.tsx` |
| 138 | 便條順手修了兩個 Phaser 坑：`scene.pause()`／`resume()` 排隊（開了又關時一律排一次 resume，`terminal:close` 也共用）；鍵盤佇列重跑（`noteInteract.shouldOpenNote` 認同一個事件物件）。`TerminalZones` 理論上有同樣的鍵盤佇列問題，人手按不到那麼快，沒改 | e2e 穩定重現 | `Station.resumeFromOverlay`、`noteInteract.ts` |
| 139 | 光敏首次確認（4.20）只在標題問、存在 `settings.flickerPromptSeen`（舊存檔會被問一次、新遊戲不清、匯入照存檔）；預設選「關閉」、減少動態效果只多一句不跳過；還沒回答前標題的 CRT 閃爍也不播；面板不移動 DOM 焦點（同 ConfirmPanel）；自寫 `usePrefersReducedMotion`（motion 的只初始化一次） | 要問的對象正在讀面板；直接開 /play 的人第一次一定會被導回標題 | `FlickerPromptPanel.tsx`、`TitleFlow.tsx` |
| 140 | `/credits` 與 `/real-world` 是 server component 靜態頁，共用 `StaticPage`，授權用連結到 `public/licenses/*.txt`（OFL 1.1 正文取自 Fusion Pixel 授權檔、跟 Google Fonts 的逐字比對過）、MIT 不放全文；「製作名單」永遠在選單最後；「下一步：真的終端機」綁通關紀錄的條件、頁面本身不擋 | 最簡單而且正確；錯誤訊息那節用清單不用表格（手機會擠） | `src/app/credits`、`src/app/real-world`、`TitleScreen.buildItems` |
| 141 | 兩個分頁（4.21）：`safeLocalStorage` 記住最後讀到或寫入的字串當基準，`storage` 事件或寫入前比對發現不同就停止存檔（寫入直接略過、不丟錯）並提示重新載入；存檔不見（null）不算別的分頁改過；規則是「誰的進度過期誰停」，不做「新分頁一開就叫舊分頁停」；匯入改走 `writeImportedSave`，之後到 reload 前不再寫檔；已停止的分頁匯出改匯出 localStorage 最新的 | 只開標題看設定或進練習模式不該讓正在玩的分頁停；既有測試先 `setState` 再 `clear()` | `gameStore.ts`、`saveStatus.ts`、`SaveManager.tsx` |
| 142 | nano（4.22）：^O 立刻寫檔、離開時 `finishEditor(input, writes)` 組一次執行結果（不進歷史）；寫不進去只顯示在狀態列、不扣氧，開檔時就擋的錯誤才扣氧；寫入權限只有 nano 檢查（`>`、`touch`、`cp` 仍不檢查）；打開的內容算看得到的輸出（目標判定、阿彬留言同 less）；加了 ^S、F1／F2／F3／F6（Chrome 攔不住 Ctrl+W）、beforeunload；一行兩個 nano 只開第一個；`$( )` 裡不開 | 跟真的 nano 一樣存了可以繼續編；Windows 的 Ctrl+W 會關分頁 | `shell/editor.ts`、`Editor.tsx`、`editorModel.ts`、`runPipeline` |
| 143 | 救援船 ARGO（4.23）：片尾最後一句後出兩個選項、預設「連線」，兩個都先記下已逃離；時間線 3/12 16:51 收到信標、3/13 對接、3/14 09:02 喚醒；uid 跟站上不同（tech 1101、medic 1001 不在 crew）；nova 程序 PID 2290、`protected`；`abin/` 只放已找到的留言、檔名照時間；文字不叫玩家「技師」、不寫大寫 NOVA（測試擋）；提示符 `tech@argo` 靠 `ShellOptions.promptUserHost`；沒有重置 | 維持 4.3 的兩個留白；同一個 PID 太像在解釋 | `argo.ts`、`argoSession.ts`、`ChapterEndScreen.EndingChoices` |
| 144 | 檔案櫃（4.24）：說明只講檔案寫了什麼、引文要能在原檔找到（測試核對）；讀檔用 `getFile` 不看權限、讀劇本初始快照不讀存檔；刻意不放艦長 `log_0601.txt` 與 `day_0312.mem`（待決的時間線矛盾）；不列回信；`ArchivePanelDynamic` 動態載入；順手修了清單捲動時靜止游標搶選取 | 不把劇本沒寫的事寫成定論；六章劇本不進標題首載 | `archive.ts`、`ArchivePanel.tsx` |
| 145 | 標題選單通關後的順序（合併時定）：通關紀錄 → 救援船 ARGO → 檔案櫃 → 下一步：真的終端機 → 選章 | ARGO 接著片尾的線走，檔案櫃是參考資料，下一步離開遊戲 | `TitleScreen.buildItems` |
| 146 | 低氧（4.25）門檻 20%：亂碼比例 2% 到 8%、種子是輸出 id 加行號、純顯示；不亂碼：輸入列、每筆第一行、系統行、hint／help／explain 那整筆、less 內容；錯誤訊息與 man 照樣亂碼；長輸出保證至少壞一個字；NOVA 每 5 到 8 字插「……」停 360ms、只斷在漢字之間；O2 旁標「缺氧：顯示不穩」 | 新手要能照著提示打；要讓人知道是故意的 | `displayGlitch.ts`、`DisplayInstabilityContext.tsx`、`OxygenReadout.tsx` |
| 147 | 第二批音效推翻 4.10「只做五種」（Danny 允許）：心跳 20% 以下循環、音量 0.25 到 0.85 乘設定；低語 0.3，第 9 次錯誤 NOVA 說話那刻與第六章第一次進核心艙；音檔用 `scripts/synth-audio.mjs` 自產（CC0），ogg 用 ffmpeg 內建 vorbis、單聲道 `pan` 成雙聲道；`sfx:play heartbeat` 被忽略 | 不另外找授權素材；Homebrew ffmpeg 沒有 libvorbis | `audio.ts`、`useHeartbeat.ts`、`synth-audio.mjs` |
| 148 | 合併時的調整：explain 補上 `\|\|`、`<`、`2>` 系列的說明（`SyntaxSymbol` 擴充）；選項表補七個新指令與 nano；`PlayScreen` 的 Phaser 訂閱數 5 → 7（便條、心跳各一）；字型子集在 main 重切一次（1427 字） | 各分支獨立開發看不到彼此 | 各檔 |
| 149 | 還沒做、列為後續（「提前用上的認可」認新語法在收尾前補上了，`cat < 檔案` 這種寫法因為 `catFile` 看 cat 的參數仍過不了關）：`novaReactions` 看不到 `$( )` 裡的指令；拼字建議 `tre`、`true` 會先被判成「忘記空格 tr e」；`ls -l \| grep` 與 alias 包住的指令不標欄位說明；螢幕閱讀器會讀到亂碼 | 時間到四點前先收尾 | 見 progress.md 第 5 節 |
| 150 | 拿掉低氧的終端機文字亂碼（Danny 2026-10-16 決定），低氧只留 NOVA 斷句、心跳聲與 HUD 的「缺氧：顯示不穩」；`displayGlitch.ts` 改名 `novaStutter.ts`、`DisplayInstability` 只剩 `stutter`、`OutputBlock` 不再讀 context | 要錯 81 次以上才碰到，碰到的正是最需要讀清楚的新手；錯誤訊息（4.8 的教學手段）與要照抄進下一步的值會被弄壞，越錯越看不懂。推翻 #146 的亂碼部分 | 要加回來就還原 `glitchLines`（git 歷史 a8b7e9b 的 `displayGlitch.ts`）並在 `OutputBlock` 接回 context |

