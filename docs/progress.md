# Shell 解謎遊戲進度追蹤

> 這份文件給「開新 session 的 LLM」與未來的自己看，回答一個問題：**現在做到哪、下一步是什麼**。
> 設計定案在 [`game-design.md`](./game-design.md)；已知陷阱在 [`notes/pitfalls.md`](./notes/pitfalls.md)；自主決策在 [`notes/decisions.md`](./notes/decisions.md)；工作日誌在 [`notes/worklog.md`](./notes/worklog.md)；已完成里程碑的逐項紀錄在 [`archive/progress-milestones-m0-m15.md`](./archive/progress-milestones-m0-m15.md)；文件地圖在 [`README.md`](./README.md)。本檔只記進度，不重複設計內容。每個里程碑都標註對應的設計文件章節，需要細節時去那裡找。

## 0. 新 session 開工檢查清單

1. 依序讀 `CLAUDE.md` → `docs/game-design.md` → 本檔 → `docs/notes/pitfalls.md`。
2. 執行 `git log --oneline -5`，對照第 1 節「現況快照」的 commit。若本機比快照新，先看新 commit 做了什麼並更新本檔，再開工。
3. 執行 `pnpm install && pnpm test && pnpm lint` 確認環境正常。
4. 看第 2 節里程碑表與第 3 節待處理雜項，找第一個 🔄 或 ⬜，那就是下一步。
5. **開工前先用 AskUserQuestion 跟 Danny 確認本次範圍**。Danny 偏好先討論再動工，設計上任何一項要改都要先問，不可自行推翻 `game-design.md` 的決策。
6. 收工前：更新第 1 節快照與第 3 節勾選、在 `notes/worklog.md` 加一筆、自主拍板的事記進 `notes/decisions.md`，一起 commit。

狀態符號：✅ 完成　🔄 進行中　⬜ 未開始　⏸️ 暫緩　❌ 取消

## 1. 現況快照

| 項目 | 內容 |
|---|---|
| 更新日期 | 2026-10-16（第十九場，02:10 收尾） |
| 最新 commit | 見 `git log --oneline 38c9b1d..HEAD`：第十九場（2026-10-16 深夜 `/goal` 自主實作，四點前收工）十一個 opus agent 各在 worktree 平行實作教學深度五項、劇情與氛圍四項、光敏確認、分頁互蓋、credits，主 session 逐一合併解衝突、修 explain 與選項表的相容、重切字型子集；之前是第十八場整理 docs/ |
| 目前階段 | **M0 到 M16 全部完成**。M16 是第十九場的十一項功能（設計文件 4.15 到 4.25），自主決策在 `notes/decisions.md` #128 起，**等 Danny 確認**。M15 是第十七場依「遊戲化實戰全書」八角框架挑的八項功能（`archive/progress-milestones-m0-m15.md`），自主決策在 `notes/decisions.md` #102 起，**等 Danny 確認**。M10 到 M14 是第十三場審計排出的優化路線（證據在 [`archive/audit-2026-10-08.md`](./archive/audit-2026-10-08.md)），第十四場由十幾個 agent 平行實作、我逐組合併驗證；這次的自主決策在 `notes/decisions.md` #62 到 #100，**等 Danny 確認**。Danny 本人還沒玩過第二章以後，也還沒看過 M10 到 M14 的新東西 |
| 程式碼狀態 | 標題（含光敏確認、觸控提示、練習模式、存檔管理、通關紀錄、救援船 ARGO、檔案櫃、下一步橋接頁、製作名單）→ 選角 → boot log → 六章地圖（第二到五章有便條）→ 片尾 → 救援船終端機。`pnpm test --run` 208 個測試檔 4686 個測試全綠，`npx tsc --noEmit`、`pnpm lint`、`pnpm build`（六個路由都靜態）乾淨；`PORT=3500 pnpm test:e2e` 77 個全綠（第一輪 1 個是選單順序的斷言，改完重跑過）。存檔格式 v4（settings 多 `flickerPromptSeen`，不升版）；指令 49 個 |
| 下一步 | Danny 試玩第十九場的東西（explain、Ctrl+R、nano、便條、低氧斷句與心跳、救援船、檔案櫃、光敏確認、/credits、/real-world）並確認 `notes/decisions.md` #128 起；第 5 節剩下的候選（拼字建議的 `tr` 雜訊、`cat < 檔案` 的過關判定等）；第 3 節的試聽（多了兩個自產音效）、潤稿與六處時間線矛盾；部署 |
| 遠端 | `origin` 是 HTTPS 網址 `https://github.com/ketyykes/nextjs-shell-game.git`，2026-10-10 Danny 自己 push 到 `70bde04`（第十六場過關密技）；之後的 commit push 前先問 Danny |

## 2. 里程碑總覽

對應 `archive/game-design-initial-plan.md` 的第一版工作順序，每一步都要能跑、能測。逐項任務、產出與 commit 見 `archive/progress-milestones-m0-m15.md`。表中「8-N」指 `archive/game-design-initial-plan.md` 第 8 節的第 N 步，其餘節號是 `game-design.md` 的現行節號。

| 里程碑 | 內容 | 狀態 | 設計文件章節 |
|---|---|---|---|
| M0 | 方向討論、設計文件、素材前置、工具鏈 | ✅ | 全部 |
| M1 | Shell 引擎與單元測試 | ✅ | 3.3、4.8、8-1 |
| M2 | 終端機 UI 與 zustand store | ✅ | 4.9、5、8-2 |
| M3 | Phaser 地圖與角色 | ✅ | 3.2、6.2、7、8-3 |
| M4 | 事件橋接與 HUD | ✅ | 3.1、4.6、8-4 |
| M5 | 第一章劇本 | ✅ | 3.4、4.4、4.8、8-5 |
| M6 | 插圖與音效 | ✅ | 4.10、6.3、8-6 |
| M7 | 存檔、標題畫面與設定 | ✅ | 4.7、8-7 |
| M8 | 第二到六章：shell 擴充、六張地圖、多章節流程、五章劇本、插圖 | ✅ | 3.3、4.2、4.3、4.8 |
| M9 | 第一版之後的小尾巴：shell 邊界、存檔 v2（角色位置）、選章、關閉閃爍管到 Phaser、按 E 像素字型、第六章 NOVA 立繪、小視窗排版 | ✅ | 4.1、4.7、4.8、4.9 |
| M10 | 玩家體驗與引導：過關回饋、目標跟著終端機、操作提示、NOVA 對話紀錄、卡關偵測、萬用字元說明、扣氧回饋、/play 入口、觸控提示 | ✅ | 4.6、4.7、4.8、4.9 |
| M11 | 地基：拆 PlayScreen 補測試、hook 穩定化、registry 型別化、整併重複、e2e flaky、hint 照抄常駐測試 | ✅ | 3.1、3.2、3.4 |
| M12 | 效能與存檔穩健：預取、插圖預載、瘦身相依、劇本改版偵測、存檔寫入失敗與損毀、素材載入失敗 | ✅ | 3.2、4.7 |
| M13 | shell 擴充：不支援語法提示、`;` `&&` 與 `~` 展開、less／tree／cut／diff／which | ✅ | 3.3、4.8 |
| M14 | 新功能：通關狀態與遊玩統計（存檔 v3）、存檔匯出匯入、沙盒練習模式 | ✅ | 4.7 |
| M15 | 遊戲化（八角框架）：shell 彩蛋、拼字建議、unset、提前用上的認可、阿彬的隱藏留言與回信（存檔 v4）、除役倒數、NOVA 看狀態 | ✅ | 3.3、4.8、4.9、4.12、4.13、4.14 |
| M16 | 第十九場十一項：explain 與選項／變數補全、`\|\|` `$( )` `<` `2>` 與 Ctrl+R、輸出欄位說明、tr／tee／xargs／sed／date／alias、地圖便條、光敏首次確認＋credits＋真實世界頁、兩個分頁互蓋防護、nano、救援船 ARGO、劇情檔案櫃、低氧後果與第二批音效 | ✅ | 4.15 到 4.25 |

## 3. 待處理雜項

不屬於任何里程碑，但會影響接手的人，做完就勾掉。

- ✅ **移除暫存的原圖追蹤**：2026-10-08 Danny 親自執行 `git rm --cached docs/assets-draft/*-original.png`，六張原圖（`nova-core`、`nova-eye`、`technician-sheet`、`technician-c`、`technician-d`、`technician-e`，約 8.7 MB）不再追蹤，檔案仍留在這台 Mac 的硬碟上，`.gitignore` 規則原本就在。
- ✅ **設計文件過時段落**：2026-10-01 已把 6.2 標題改成「自產與補充的素材」、6.3 與第 8 節（已封存到 `archive/game-design-initial-plan.md`）的張數改成實際的 8 張場景圖。
- ⬜ **真人試玩**：完成定義「沒碰過終端機的人能靠 hint 通關」還沒驗證。找一位新手玩第一章，記錄卡在哪、hint 哪一段救了他。
- ⬜ **試聽五個音效**：agent 看檔名挑的，沒人聽過，見 `archive/progress-milestones-m0-m15.md` 的 M6-3。2026-10-16 用 `afinfo` 確認十個檔案都能解碼，長度 ambient 8 秒、power 1 秒、door 0.5 秒、key 0.1 秒、nova-blip 0.05 秒，ogg 與 mp3 成對；要不要換還是得用耳朵聽。
- ⬜ **劇情文字潤稿**：六台終端機的檔案內容、NOVA 台詞、boot log、章節結尾都是 agent 初稿，`src/game/chapters/ch1-life-support.ts` 與 `src/components/title/BootLog.tsx`，改完跑 `pnpm test --run src/game/chapters` 會檢查格式與性別指涉。2026-10-16 已做過一輪客觀校對（錯字、簡體或大陸用語、標點、性別指涉，六章、片尾、boot log、留言、NOVA 反應台詞），零筆；剩下的是風格與手感，要 Danny 自己讀。
- ✅ **補產 12 張插圖**：2026-10-01 codex 額度用完時缺的第五章後三間、`ch5_outro`、第六章六間 `nv_*`、`ch6_outro`、`ending`，2026-10-06 第十場補齊，`AVAILABLE_SCENES` 已列滿 44 張（含第一章 8 張）。
- ⬜ **第二到六章劇情潤稿與試玩**：五章劇本（`src/game/chapters/ch2-*.ts` 到 `ch6-*.ts`）全是 agent 初稿，Danny 還沒玩過。第二章冷卻日誌「三年來兩人份熱負載」的第二個人，2026-10-08 Danny 定案為冷凍艙裡的玩家，劇本不明講、維持現狀（見 `game-design.md` 4.3「兩人份熱負載」）。第六章 T6 NOVA 最後一句「祝旅途平安，技師」同日定案保留，就是要暗示 NOVA 還活著（見 `game-design.md` 4.3「NOVA 沒死透」）。劇情留白已全部定案，剩潤稿與試玩。（`day_312` 差一與其他十處時間線矛盾已在第十二場修掉，見 `notes/decisions.md` #49 到 #51；2026-10-16 校對又修了三處 mtime，見 #127。）
- ✅ **刪模板殘留檔**：2026-10-08 Danny 授權後已刪 `src/app/favicon.ico` 與五個 create-next-app 的 SVG，build 後 `/icon.png` 照常生成、1861 測試全綠。
- ✅ **淘汰的原圖只在 Danny 的 Mac 上**：這是環境備註不是待辦，2026-10-16 改記到 `notes/pitfalls.md`。
- ⬜ **六處時間線矛盾，要 Danny 決定**（2026-10-16 校對 workflow 的跨章比對找到，改哪邊都會動劇情，所以沒自動改）：
  1. 阿彬最後一則留言叫 `day_900.txt`（mtime 2031-03-10），但依 #49 的錨點（2027-07-26 是第 1 天，第二章 `day_313` 是撤離日）那天是第 1324 天，第六章同一天的記憶檔就叫 `day_1324.mem`。檔名被 `solutions.ts`、測試、設計文件 4.12 引用；是記成「阿彬算亂了」還是改名。
  2. 第二章撤離日誌第 9 段（23:00 到 23:15）寫「對外通訊中斷」，第四章三處（`route.conf` 設定、`entry.log` 刪 `callsign.txt`、`pointing.log` 停止追蹤）都是 23:58，`ping.log` 在 06-02 00:00 八座中繼站還全有回應。
  3. 第三章公告「影響：通訊艙供電中斷」與 outro「通訊艙那邊也有電了」，但第四章 intro 說「這裡的燈一直都是亮的」，而且 `tx.log`、`pointing.log`、`ping.log` 三年來一直在寫。
  4. 第五章艦長日誌 `log_0601.txt`（mtime 06-01 21:30）說「回滾腳本準備好了，明早執行」「今天鎖了三次艙門」，但第二章撤離日誌 23:45 才提出回滾方案、00:00 核可、02:45 準備完成，`door_events.log` 當天 21:40 前沒有 NOVA 鎖門紀錄。
  5. 第六章 `day_0312.mem`（mtime 06-01 22:16）寫「船員決議回滾 NOVA。我聽到了」，早於第二章 23:45 的提案；反駁 agent 認為可讀成 NOVA 旁聽到私下共識、之後才正式提案，不算硬傷，列在這裡讓 Danny 判斷。
  6. 第一章 pod_04、pod_05 入艙表的病患編號帶 0418 但 mtime 是 04-17（已修成 04-18，#127）；第二章 2031 Q1 冷卻日誌 mtime 是 03-28、在玩家到站之後（已修）；第四章 `entry.log` 最後一行是玩家 03-12 14:02 的登錄、mtime 卻是 03-10（已修）。這三項不用決定，列出來讓 Danny 知道劇本雜湊變了，舊存檔裡未過關的那幾台會重建並插「已更新」一行（#87）。
- ✅ **`generate-ch2-6.sh` 找的是 `.png`**：第十五場場景圖改成 WebP 後，腳本的跳過判斷與參考圖退路仍找 `public/scenes/scene-*.png`，2026-10-16 改成 `.webp`。

## 4. 協作慣例

- **先討論再動工**：重大設計選項整理成表格與建議，用 AskUserQuestion 一次問三到四題。Danny 選「再討論」就繼續討論，不要急著寫程式。ASCII 圖解釋畫面配置對他很有效。
- **commit 規範**：Conventional Commit，主旨繁體中文，不加 AI 署名 footer，依性質拆分（docs、feat、chore、test 分開）。
- **程式風格**：註解與說明繁體中文台灣用語，命名英文，型別 PascalCase，變數與函式 camelCase，避免巢狀三元。
- **文件分工**：設計變更改 `game-design.md`；進度改本檔；陷阱加 `notes/pitfalls.md`；自主決策記 `notes/decisions.md`；日誌記 `notes/worklog.md`。

## 5. 第一版之後的候選工作

沒有排定順序，Danny 決定要不要做。第十三場審計出的項目已排進 `archive/progress-milestones-m0-m15.md` 的 M10 到 M14 並在第十四場全部完成，沒選的列在 `archive/audit-2026-10-08.md` 末尾。

- **真人試玩與調整**：第 3 節的試玩、試聽（含第十九場自產的心跳與低語）、潤稿（含第二到六章）。
- **第十九場收尾時列為後續的小項**（`notes/decisions.md` #149）：`catFile` 這類看參數的目標讓 `cat < 檔案` 過不了關（4.9 的「只看結果不看寫法」在 `<` 上不成立）；`novaReactions` 看 `$( )` 裡的指令；拼字建議把 `tre`、`true` 判成「忘記空格 `tr e`」（建議剩下的字三個以上才判忘記空格）；alias 包住的指令與 `ls -l | grep` 不標欄位說明；`>`、`touch`、`cp` 也檢查寫入權限（nano 有檢查）；`nano x && cat x` 的 cat 會先跑。
- **上次列的構想還沒做的**：章末複習台、每日挑戰、沙盒任務卡、每輪不同細節、通關分享卡、自訂章節匯入、教室統計匯出、對比與焦點隔離（A30、A32）、PWA 離線（A52）、錯誤邊界與匿名埋點（A47、A48）；⚠ 困難模式（A43）、觸控支援仍跟設計定案衝突。
- **部署**：`pnpm build` 已過、六個路由都是靜態，可直接上 Vercel 或任何靜態主機；CI 已在第十二場設好（`.github/workflows/ci.yml`），部署後記得設 `NEXT_PUBLIC_SITE_URL`（sitemap 與 OG 圖的網域都吃它）。
