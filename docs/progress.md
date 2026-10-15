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
| 更新日期 | 2026-10-16 |
| 最新 commit | 見 `git log --oneline 9fc5286..HEAD`：第十七場（`/goal` 自主實作 M15）42 個 commit，五組 agent 平行實作八項遊戲化功能，兩輪唯讀審查找出的問題都修掉；2026-10-16 第十八場整理 docs/（拆檔、封存；程式邏輯沒動，只更新註解裡的文件引用） |
| 目前階段 | **M0 到 M15 全部完成**。M15 是第十七場依「遊戲化實戰全書」八角框架挑的八項功能（`archive/progress-milestones-m0-m15.md`），自主決策在 `notes/decisions.md` #102 起，**等 Danny 確認**。M10 到 M14 是第十三場審計排出的優化路線（證據在 [`archive/audit-2026-10-08.md`](./archive/audit-2026-10-08.md)），第十四場由十幾個 agent 平行實作、我逐組合併驗證；這次的自主決策在 `notes/decisions.md` #62 到 #100，**等 Danny 確認**。Danny 本人還沒玩過第二章以後，也還沒看過 M10 到 M14 的新東西 |
| 程式碼狀態 | 標題（含觸控提示、練習模式、存檔管理、通關紀錄）→ 選角 → boot log → 六章地圖 → 片尾。`pnpm test --run` 167 個測試檔 3318 個測試全綠，`npx tsc --noEmit`、`pnpm lint`、`pnpm build` 乾淨；`PORT=3330 pnpm test:e2e` 58 個全綠、沒有 flaky（e2e 走路是讀座標的閉環，本機 4 個 worker）。存檔格式 v4 |
| 下一步 | 第 5 節的候選工作：Danny 試玩（特別是 M15 的阿彬留言、NOVA 反應、除役倒數與 M10 到 M14 的新東西）、確認 `notes/decisions.md` #62 起的自主決策、第 3 節的試聽與潤稿（M15 新增的留言、NOVA 反應台詞、片尾加段也是 agent 初稿）、部署。審計末尾「這次沒選的項目」仍可挑 |
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

## 3. 待處理雜項

不屬於任何里程碑，但會影響接手的人，做完就勾掉。

- ✅ **移除暫存的原圖追蹤**：2026-10-08 Danny 親自執行 `git rm --cached docs/assets-draft/*-original.png`，六張原圖（`nova-core`、`nova-eye`、`technician-sheet`、`technician-c`、`technician-d`、`technician-e`，約 8.7 MB）不再追蹤，檔案仍留在這台 Mac 的硬碟上，`.gitignore` 規則原本就在。
- ✅ **設計文件過時段落**：2026-10-01 已把 6.2 標題改成「自產與補充的素材」、6.3 與第 8 節（已封存到 `archive/game-design-initial-plan.md`）的張數改成實際的 8 張場景圖。
- ⬜ **真人試玩**：完成定義「沒碰過終端機的人能靠 hint 通關」還沒驗證。找一位新手玩第一章，記錄卡在哪、hint 哪一段救了他。
- ⬜ **試聽五個音效**：agent 看檔名挑的，沒人聽過，見 `archive/progress-milestones-m0-m15.md` 的 M6-3。
- ⬜ **劇情文字潤稿**：六台終端機的檔案內容、NOVA 台詞、boot log、章節結尾都是 agent 初稿，`src/game/chapters/ch1-life-support.ts` 與 `src/components/title/BootLog.tsx`，改完跑 `pnpm test --run src/game/chapters` 會檢查格式與性別指涉。
- ✅ **補產 12 張插圖**：2026-10-01 codex 額度用完時缺的第五章後三間、`ch5_outro`、第六章六間 `nv_*`、`ch6_outro`、`ending`，2026-10-06 第十場補齊，`AVAILABLE_SCENES` 已列滿 44 張（含第一章 8 張）。
- ⬜ **第二到六章劇情潤稿與試玩**：五章劇本（`src/game/chapters/ch2-*.ts` 到 `ch6-*.ts`）全是 agent 初稿，Danny 還沒玩過。第二章冷卻日誌「三年來兩人份熱負載」的第二個人，2026-10-08 Danny 定案為冷凍艙裡的玩家，劇本不明講、維持現狀（見 `game-design.md` 4.3「兩人份熱負載」）。第六章 T6 NOVA 最後一句「祝旅途平安，技師」同日定案保留，就是要暗示 NOVA 還活著（見 `game-design.md` 4.3「NOVA 沒死透」）。劇情留白已全部定案，剩潤稿與試玩。（`day_312` 差一與其他十處時間線矛盾已在第十二場修掉，見 `notes/decisions.md` #49 到 #51。）
- ✅ **刪模板殘留檔**：2026-10-08 Danny 授權後已刪 `src/app/favicon.ico` 與五個 create-next-app 的 SVG，build 後 `/icon.png` 照常生成、1861 測試全綠。
- ⬜ **淘汰的原圖只在 Danny 的 Mac 上**：`nova-portrait`、`nova-v2`、`nova-v3`、`nova-id`、`nova-mannequin`、`nova-lowres`、`technician-b` 的 `-original.png` 沒進版控也不需要，另一台電腦看不到是正常的。
- ⬜ **`generate-ch2-6.sh` 找的是 `.png`**：第十五場場景圖改成 WebP 後，腳本第 61、64 行的跳過判斷與參考圖退路仍找 `public/scenes/scene-*.png`，重跑前要改成 `.webp`。

## 4. 協作慣例

- **先討論再動工**：重大設計選項整理成表格與建議，用 AskUserQuestion 一次問三到四題。Danny 選「再討論」就繼續討論，不要急著寫程式。ASCII 圖解釋畫面配置對他很有效。
- **commit 規範**：Conventional Commit，主旨繁體中文，不加 AI 署名 footer，依性質拆分（docs、feat、chore、test 分開）。
- **程式風格**：註解與說明繁體中文台灣用語，命名英文，型別 PascalCase，變數與函式 camelCase，避免巢狀三元。
- **文件分工**：設計變更改 `game-design.md`；進度改本檔；陷阱加 `notes/pitfalls.md`；自主決策記 `notes/decisions.md`；日誌記 `notes/worklog.md`。

## 5. 第一版之後的候選工作

沒有排定順序，Danny 決定要不要做。第十三場審計出的項目已排進 `archive/progress-milestones-m0-m15.md` 的 M10 到 M14 並在第十四場全部完成，沒選的列在 `archive/audit-2026-10-08.md` 末尾。

- **真人試玩與調整**：第 3 節的試玩、試聽、潤稿（含第二到六章）。
- **部署**：`pnpm build` 已過、三個路由都是靜態，可直接上 Vercel 或任何靜態主機；CI 已在第十二場設好（`.github/workflows/ci.yml`），部署後記得設 `NEXT_PUBLIC_SITE_URL`（sitemap 與 OG 圖的網域都吃它）。
