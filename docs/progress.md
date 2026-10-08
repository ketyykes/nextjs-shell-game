# Shell 解謎遊戲進度追蹤

> 這份文件給「開新 session 的 LLM」與未來的自己看，回答一個問題：**現在做到哪、下一步是什麼**。
> 設計定案在 [`game-design.md`](./game-design.md)，本檔只記進度，不重複設計內容。每個任務都標註對應的設計文件章節，需要細節時去那裡找。

## 0. 新 session 開工檢查清單

1. 依序讀 `CLAUDE.md` → `docs/game-design.md` → 本檔。
2. 執行 `git log --oneline -5`，對照第 1 節「現況快照」的 commit。若本機比快照新，先看新 commit 做了什麼並更新本檔，再開工。
3. 執行 `pnpm install && pnpm test && pnpm lint` 確認環境正常。
4. 在第 3 節找第一個 🔄 或 ⬜ 的任務，那就是下一步。
5. **開工前先用 AskUserQuestion 跟 Danny 確認本次範圍**。Danny 偏好先討論再動工，設計上任何一項要改都要先問，不可自行推翻 `game-design.md` 的決策。
6. 收工前：更新第 1 節快照、第 3 節勾選狀態、第 6 節加一筆工作日誌，並把本檔一起 commit。

狀態符號：✅ 完成　🔄 進行中　⬜ 未開始　⏸️ 暫緩　❌ 取消

## 1. 現況快照

| 項目 | 內容 |
|---|---|
| 更新日期 | 2026-10-09 |
| 最新 commit | 見 `git log --oneline -20`：第十四場（`/loop` 自主實作）從 `ef64bd3` 起約 120 個 commit，做完 M10 到 M14 全部 26 項，再用三個整合審查 agent 找出 12 個跨組 bug 並修掉 |
| 目前階段 | **M0 到 M14 全部完成**。M10 到 M14 是第十三場審計排出的優化路線（證據在 [`audit-2026-10-08.md`](./audit-2026-10-08.md)），第十四場由十幾個 agent 平行實作、我逐組合併驗證；這次的自主決策在第 8 節 #62 到 #100，**等 Danny 確認**。Danny 本人還沒玩過第二章以後，也還沒看過 M10 到 M14 的新東西 |
| 程式碼狀態 | 標題（含觸控提示、練習模式、存檔管理、通關紀錄）→ 選角 → boot log → 六章地圖 → 片尾。`pnpm test --run` 148 個測試檔 2811 個測試全綠，`npx tsc --noEmit`、`pnpm lint`、`pnpm build` 乾淨；`PORT=3300 pnpm test:e2e` 48 個全綠、沒有 flaky（e2e 走路改成讀座標的閉環，本機 4 個 worker）。存檔格式 v3 |
| 下一步 | 第 9 節的候選工作：Danny 試玩（特別是 M10 的引導、M13 的新指令、沙盒、存檔管理與通關紀錄）、確認第 8 節 #62 到 #100、第 4 節的試聽與潤稿、部署。審計末尾「這次沒選的項目」仍可挑 |
| 遠端 | `origin` 是 HTTPS 網址 `https://github.com/ketyykes/nextjs-shell-game.git`，2026-10-08 Danny 親自 push 到 `ef64bd3`；之後的 commit push 前先問 Danny |

## 2. 里程碑總覽

對應 `game-design.md` 第 8 節的工作順序，每一步都要能跑、能測。

| 里程碑 | 內容 | 狀態 | 設計文件章節 |
|---|---|---|---|
| M0 | 方向討論、設計文件、素材前置、工具鏈 | ✅ | 全部 |
| M1 | Shell 引擎與單元測試 | ✅ | 3.3、4.8、8-1 |
| M2 | 終端機 UI 與 zustand store | ✅ | 4.9、5、8-2 |
| M3 | Phaser 地圖與角色 | ✅ | 3.2、6.2、9、8-3 |
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

## 3. 任務清單

### M0 規劃與素材前置 ✅

| 任務 | 狀態 | 產出 | commit |
|---|---|---|---|
| 技術選型與遊戲方向討論 | ✅ | `docs/game-design.md` 第 2 節決策紀錄 | `4e4a16f` |
| 劇情、六章結構、第一章六台終端機 | ✅ | `docs/game-design.md` 4.1 到 4.4 | `4e4a16f` |
| 流程、教學曲線、UI 風格、音效定案 | ✅ | `docs/game-design.md` 4.6 到 4.10 | `4e4a16f` |
| 安裝 Phaser 4.2.1、啟用 codex plugin | ✅ | `package.json`、`.claude/settings.json` | `277d044` |
| Buch Sci-fi Interior tileset 下載與預覽 | ✅ | `docs/assets-draft/tileset-buch-scifi.png`（448x192，14x6 格，32px） | `4e4a16f` |
| 主角外觀四版 A、C、D、E 定案 | ✅ | `docs/assets-draft/technician-*.png` 預覽 | `6ba843c` |
| NOVA 立繪定案為非人形 | ✅ | `docs/assets-draft/nova-eye.png`、`nova-core.png` | `3cb12b2` |
| sprite 切格腳本 | ✅ | `scripts/slice-sprites.mjs`、`pnpm sprites:slice`、sharp | `93e9abd` |
| 四張正式 sprite sheet | ✅ | `public/sprites/technician-{a,c,d,e}.png`（128x192，4x4 格 32x48） | `369a6fa` |
| 原圖暫時納入版控以便跨機器接續 | ✅ | 六張 `*-original.png` 用 `git add -f` 加入 | `c1e75ce` |

### M1 Shell 引擎與單元測試 ✅

目標：不碰 UI，純 TypeScript 模組加 Vitest，能在測試裡跑完第一章六台終端機的正解指令序列。程式在 `f548b83`，測試在 `5efe4d9`。

| 任務 | 狀態 | 產出 |
|---|---|---|
| M1-1 目錄骨架與虛擬檔案系統 | ✅ | `src/game/shell/types.ts`（所有模組的共用契約）、`fs/{path,node,snapshot,VirtualFileSystem}.ts`。快照格式：字串是檔案、`$type: "file"`／`"dir"` 帶 metadata、其他物件是目錄 |
| M1-2 指令解析器 | ✅ | `parser/{fullwidth,tokenizer,parse,suggest}.ts`。管線與重導向已能切成 token，執行時回「尚未支援」 |
| M1-3 第一章指令 | ✅ | `commands/{pwd,ls,cd,cat,help,hint,man,history,clear}.ts`，註冊表在 `commands/index.ts` 的 `ALL_COMMANDS` |
| M1-4 友善錯誤訊息模組 | ✅ | `messages.ts`，所有繁中錯誤文字集中在此，指令不得自己寫錯誤字串 |
| M1-5 Tab 補全與歷史 | ✅ | `completion.ts`、`history.ts` |
| M1-6 Vitest 測試 | ✅ | 每個模組一個測試檔，`shell.test.ts` 跑 T1 到 T6 正解序列。指令測試共用 `commands/testFixtures.ts` 的第一章假 FS |

**給 M2 的介面摘要**：UI 只需要 `new Shell(options)`，然後呼叫 `execute(input)` 拿 `ShellExecution`（`lines`、`isError`、`clearScreen`、`cwd`）、`complete(input)` 拿 Tab 候選、`historyUp()`／`historyDown()`、`prompt()` 拿提示符。存檔用 `toState()`，還原用 `Shell.fromState(state, VirtualFileSystem.fromSerialized(state.fs), hints)`。指令說明資料在 `commands/docs.ts` 的 `COMMAND_DOCS`，側邊面板直接用。

### M2 終端機 UI 與 store ✅

目標：在 `/play` 頁面上打指令看結果，重新整理後歷史與進度還在。先不接 Phaser 與劇情。commit `090e169` 到 `7925b2b`。

| 任務 | 狀態 | 產出 |
|---|---|---|
| M2-1 zustand 與 persist | ✅ | `src/game/store/{types,gameStore,selectors,index}.ts`。存檔 key `kepler9-save`、`version: 1`，四塊：progress（含 `chapter`、`learnedCommands`、`oxygen`）、settings、terminals（每台的 `Shell.toState()` 加輸出紀錄）、storyFlags |
| M2-2 字型 | ✅ | `src/app/fonts.ts`、`src/app/fonts/fusion-pixel-12px-proportional-zh_hant.woff2`（v2026.09.25，約 910 KB，OFL）。Tailwind class `font-terminal`（VT323 + Fusion Pixel）、`font-title`（Press Start 2P） |
| M2-3 Terminal 元件群 | ✅ | `src/components/terminal/`：Terminal、TerminalFrame（inline SVG 9-slice）、OutputBlock、DialogueBlock、PromptInput、useTerminalKeyboard、useTypewriter |
| M2-4 Magic UI Terminal 評估 | ❌ | 試裝看過：外框是固定圓角加 macOS 三色圓點、`max-w-lg`、靠 `useInView` 觸發的展示型序列動畫，沒有輸入列，跟像素邊框與標題列對不上；打字動畫自己寫十幾行。已移除，全部自製 |
| M2-5 鍵盤處理 | ✅ | Enter、Tab（多候選時列在輸出區）、↑↓、Esc、輸入法組字中不處理（`isComposing` 與 Safari `keyCode 229`）、全形字元即時琥珀提示 |
| M2-6 CRT 效果 | ✅ | `src/components/game/CrtOverlay.tsx`（掃描線、暗角、閃爍各自 prop，`prefers-reduced-motion` 自動關閃爍）、`OxygenVignette.tsx`（低於 30% 的琥珀暗角）。`/play` 底部原本有三個開關的暫時設定列，M7-5 做正式選單後已移除 |
| /play 整合 | ✅ | `src/app/play/page.tsx` 加 `src/components/game/PlayScreen.tsx`；`src/game/chapters/ch1-life-support.ts` 先放 T1 的檔案系統、hint、banner。e2e 在 `e2e/play.spec.ts` |

**M2 暫時的簡化，之後要改**：第一次開 T1 就把它教的 pwd、ls、cat 算學會（M5 改成過關才學會）；終端機固定開 `ch1-t1`，關閉後只顯示「重新開啟」按鈕（M4 由 Phaser 事件開關）；配色與字型只套在 `/play`，首頁還是模板。

### M3 Phaser 地圖與角色 ✅

目標：角色能在第一章地圖走動、撞牆、走近終端機看到提示。commit `b6df716` 到 `fd9ef4e`。

| 任務 | 狀態 | 產出 |
|---|---|---|
| M3-1 素材就位 | ✅ | `public/tiles/tileset-buch-scifi.png`；`docs/assets-draft/tileset-buch-grid.png` 是標了 0 起算格子編號的對照圖，挑 tile 時看它 |
| M3-2 地圖 | ✅ | 改用腳本產生而非手畫：`scripts/build-map.mjs`（`pnpm map:build`）依第 9 節配置輸出 Tiled 1.10 格式的 `public/maps/deck1.json`，可直接用 Tiled 打開精修。四個 tile 層 floor、walls、objects、collision；`markers` 物件層放 spawn、T1 到 T6（type `terminal`，properties `terminalId`、`title`、`roomId`）、七個 `room` 矩形、`airlock` 門。內建 BFS 連通性檢查。房間配置表見腳本頂端的 `DEFAULT_LAYOUT` |
| M3-3 Phaser 骨架 | ✅ | `src/game/phaser/{events,constants,EventBus,main,index}.ts`、`scenes/{keys,Boot,Preloader,Station,mapObjects}.ts`。選角透過 `game.registry` 傳給 Preloader |
| M3-4 PhaserGame 元件 | ✅ | `src/components/game/PhaserGame.tsx` 加 `PhaserGameDynamic.tsx`（`next/dynamic` + `ssr: false`）。延後一幀才 `startGame`，StrictMode 的立即卸載不會建到第一個實例 |
| M3-5 角色 | ✅ | `objects/Player.ts` 加純函式 `movement.ts`。方向鍵有 capture、WASD 沒有，終端機開著時 `setInputEnabled(false)` 並關掉全域 capture。腳部碰撞盒 20x14、offset (6, 34)。鏡頭 zoom 2、lerp 0.1 |
| M3-6 終端機互動區 | ✅ | `objects/TerminalZone.ts`（發光脈動、靠近固定亮、「按 E」文字、E 鍵事件發 `terminal:open` 並暫停場景）、`objects/RoomTracker.ts`（發 `room:enter`）、純函式 `nearby.ts` |
| M3-7 燈光遮罩 | ✅ | `objects/LightMask.ts`：RenderTexture 填黑再用徑向漸層 texture `erase` 挖洞，角色半徑 96、每台終端機半徑 40。`setPowered(true)` 1.5 秒淡出到全亮，M4 配電箱過關時呼叫 |
| /play 整合 | ✅ | `PlayScreen.tsx` 監聽 `terminal:open`／`terminal:nearby`／`room:enter`，彈窗蓋在變暗的地圖上，Esc 發 `terminal:close`。HUD 有 O2、艙區名稱、「按 E 開啟 ○○」。T2 到 T6 先放佔位劇本（`notice.txt`），M5-2 換真的。e2e 用鍵盤從出生點走到 T1 按 E |

**M3 順手做掉的 M4 項目**：M4-1 事件型別（`events.ts`）與 M4-2 開關終端機（按 E 開、Phaser 暫停、鍵盤交給 shell、Esc 關、Phaser 恢復、地圖變暗）都完成了。M4 剩 M4-3 過關演出、M4-4 NOVA 對話框、M4-5 HUD 的目標面板與已學指令側邊面板。

### M4 事件橋接與 HUD ✅

目標：地圖與終端機能來回切換，過關有演出。commit `e2bac61` 到 `6d5ce2a`（與 M5-1、M5-2 同一批）。

| 任務 | 狀態 | 產出 |
|---|---|---|
| M4-1 事件型別 | ✅ | `src/game/phaser/events.ts`，M3 完成。多了 `terminal:nearby` 與 `scene:ready` |
| M4-2 開關終端機 | ✅ | M3 完成，見 `TerminalZone.ts` 與 `PlayScreen.tsx` |
| M4-3 過關演出 | ✅ | `objects/effects.ts`（純函式：亮燈順序、人影位置、門格座標）、`ShadowFigure.ts`、`LightMask.powerOnSequence`。T4：0ms 配電室亮、450ms 走廊亮、650ms 人影在**視野邊緣**閃 120ms 加鏡頭微震、之後每 450ms 亮一間、2900ms 整層淡出。T6：移除門 tile 與阻擋格、鏡頭閃全息藍。終端機開著時演出延到關閉才播。重整後由 `startGame` 的 `solvedTerminals` 經 registry 直接套最終狀態，不播動畫 |
| M4-4 NOVA 對話框 | ✅ | `NovaDialogue.tsx` 加 `useNovaQueue.ts`。右下角固定、立繪 `public/scenes/nova-eye.png`、打字動畫、停留時間依字數（4 到 9 秒）、淡出後 `onShown` 推進佇列；同前綴只說一次 |
| M4-5 HUD | ✅ | `ObjectivePanel.tsx`（左下角目前目標、過關打勾 3 秒、`n/6` 進度）、`CommandCheatSheet.tsx`（右側可展開的已學指令，點指令看 man 說明）、O2 在 `PlayScreen` 的 `Hud` |
| 過關流程 | ✅ | `PlayScreen.handleExecuted`：錯誤扣氧；成功且 `evaluateObjective` 為 true 就 `markTerminalSolved`、`restoreOxygen`、`learnCommand`（存完整的 `ls -a` 字串，shell 只學指令名）、`touchSave`、發 `puzzle:solved`、NOVA 過關台詞內嵌進終端機、關閉後地圖對話框再說最後一句 |

### M5 第一章劇本 ✅

目標：從 T1 玩到 T6 通關。M5-3 到 M5-5 在 commit `ddc50e9` 與 `722bf56`。

- ✅ **M5-1 schema 與旗標**（3.4、7）：`src/game/story/{types,schema,objectives,flags,rooms,index}.ts`。zod 4 `strictObject`，多餘欄位也擋；`validateChapter` 在劇本模組載入時就跑。目標判定組合函式：`commandIs`、`catFile`、`cdInto`、`lsWithFlag`、`outputContains`、`all`、`any`；PlayScreen 用 `createObjectiveContext` 加 `evaluateObjective`。
- ✅ **M5-2 ch1-life-support.ts**（4.4）：六台終端機的檔案系統、目標、三段式 hint、NOVA 三時機台詞、章節 `intro`／`outro` 都寫了，測試用真的 Shell 跑每台的正解序列並檢查文字不含性別指涉。正解序列表見 `src/game/chapters/ch1-life-support.test.ts`。劇情文字是初稿，Danny 可直接改檔案內容，測試會抓格式錯誤。
- ✅ **M5-3 卡關偵測**（4.8）：`src/game/story/pressure.ts` 加 `src/components/game/useTerminalPressure.ts`。連續五次錯誤或三分鐘沒進展，NOVA 在終端機內嵌說 `nova.onStuck`（沒寫就套 `hints[0]`），同一台過關前只說一次。
- ✅ **M5-4 環境反應階梯與氧氣值**（4.8）：累積錯誤每 9 次循環一輪：3 燈閃（`ambient:flicker`，關閉閃爍設定時不發）、6 門聲（`sfx:play door`）、9 NOVA 台詞（章節 `novaErrorLines` 輪流）。計數存在 store 的 `errorCount`，過關歸零。氧氣在 M4 已做。
- ✅ **M5-5 章節結束**（4.7）：`ChapterEndScreen.tsx` 三階段：outro 插圖與 NOVA 結尾台詞逐句打字、指令回顧卡、結束選項（M8 起有下一章時是「進入第 N 章」與「回標題」，第六章後接片尾；沒有下一章也沒有片尾時才顯示「下一章開發中」）。六台都過關且終端機關著時顯示，`ch1.outroShown` 旗標只播一次，掛載時自動存檔。
- **完成定義**：一位沒碰過終端機的人能靠 hint 通關第一章。**這點還沒有真人驗證**，e2e 已從標題走完六台（`happy-path.spec.ts`），Danny 第六場起已開始試玩，但還沒有「沒碰過終端機的新手」實測。

### M6 插圖與音效 ✅

commit `01f018d`、`a29520c`。

- ✅ **M6-1 codex 產圖**（6.3）：`docs/assets-draft/scenes/generate.sh` 批次產八張，先產冷凍艙當風格基準，其餘用 `-i` 附它。codex 0.155.1 輸出 1672x941 的 16:9，一張約 80 秒。原圖 `scene-*-original.png` 不進版控（`.gitignore` 已加 `scenes/` 規則），256px 預覽在 `docs/assets-draft/scenes/`，640x360 正式檔在 `public/scenes/`。對照圖看過：八張風格一致。
- ✅ **M6-2 素材搬移**：`nova-eye`、`nova-core` 256px 預覽版在 `public/scenes/`。
- ✅ **M6-3 音效**（4.10）：`public/audio/{ambient,key,door,power,nova-blip}.{ogg,mp3}` 加 `LICENSE-kenney.txt`。來源：ambient 是 Sci-fi `spaceEngineLow_002` 裁成 8 秒循環，key 是 Interface `click_001`，door 是 `doorOpen_000`，power 是 `lowFrequency_explosion_001`，nova-blip 是 Interface `select_007`。**沒有人實際聽過**，agent 是看檔名挑的，不合就換（備選寫在 `src/game/phaser/audio.ts` 附近的回報：key 可換 `tick_004`，blip 可換 `select_003`）。`AudioManager` 在 `src/game/phaser/audio.ts`。
- **完成定義**：八張圖接上對應**艙區**（第一次進艙區的插圖卡）與開場、結尾過場；五種音效可在設定靜音與調音量。

### M7 存檔、標題畫面與設定 ✅

commit `722bf56`。元件在 `src/components/title/`，流程容器是 `TitleFlow.tsx`，首頁 `src/app/page.tsx` 只渲染它。

- ✅ **M7-1 標題畫面**（4.7）：`TitleScreen.tsx`。黑底、`font-title` 的 KEPLER-9、CRT 覆蓋層跟設定。「繼續」只在 `savedAt` 不為 null 時出現；「新遊戲」有存檔時先出內嵌確認面板（不用 `window.confirm`，會卡住自動化）。
- ✅ **M7-2 選角**（4.7）：`CharacterSelect.tsx`，四個站立幀放大四倍，←→ 切換、Enter 確認、Esc 返回。選完角就 `touchSave`，中途離開回來能按「繼續」。
- ✅ **M7-3 開場 boot log**（4.7）：`BootLog.tsx` 用 `TerminalFrame` 逐行打字 13 行，查無此人三次後略過，最後 NOVA 第一句（`intro[0]`）；Enter 跳過、再 Enter 繼續。接著 `SceneCard` 顯示開場插圖 2.6 秒再進 `/play`，其餘 `intro` 句子在地圖上接著說。
- ✅ **M7-4 暫停選單**（4.7）：`PauseMenu.tsx`，地圖上 Esc 開（終端機、設定、章節結束畫面開著時不處理）。繼續、設定、重玩本章（內嵌確認後清進度保留外觀與設定，重新載入頁面）、回標題。開著時發 `game:pause` 讓 Phaser 停角色。
- ✅ **M7-5 設定選單**（4.7、4.10）：`SettingsMenu.tsx`，文字速度四段、閃爍、掃描線、暗角、音量、靜音，標題與地圖都能開；音量與靜音透過 `audio:settings` 即時套用。
- **完成定義**：關掉瀏覽器再開能從上次的終端機接續 — 輸出紀錄、cwd、歷史、過關、燈亮與門開狀態都會還原；**角色位置不存**，重開一律從冷凍艙出生點開始（決策 #15）。

### M8 第二到六章 ✅

2026-10-01 第八場，Danny 下 `/goal` 要求「做到 1～6 章、不確定就記錄不停下來、允許平行 subagent、TDD、playwright-cli 測試」。契約先行（`shell/types.ts`、`messages.ts`、`story/types.ts`、`phaser/events.ts` 的 42 個艙區與 `SolvedEffect`、`story/decks.ts` 的終端機表），兩波共十個 opus agent，主 session 做 store／PlayScreen／章節結束／e2e／整合。決策見第 8 節 #23 到 #36。

| 任務 | 狀態 | 產出 |
|---|---|---|
| M8-1 shell 引擎擴充 | ✅ | `parser/`：管線 `\|`、重導向 `>` `>>`、變數 `$NAME`／`${NAME}`（單引號不展開）、四種解析錯誤；`shell.ts`：萬用字元（`fs.glob`，只在路徑最後一段）、管線逐段執行與 `stdin`、副作用（cd、env、processes）、`ShellSessionState` 多 `env`、`processes`；`VirtualFileSystem`：`appendFile`、`mkdir`、`touch`、`remove`、`move`、`copy`、`setMode`、`glob`，`readFile` 檢查 `canRead` 丟 EACCES |
| M8-2 十九個指令 | ✅ | 第二章 `head`、`tail`、`wc`、`grep`（字面比對）、`find`；第三章 `mkdir`、`touch`、`cp`、`mv`、`rm`；第四章 `echo`、`sort`、`uniq`；第五章 `export`、`env`、`chmod`；第六章 `ps`、`top`、`kill`。說明資料拆在 `docsFilter.ts`、`docsFiles.ts`、`docsSystem.ts`，`docs.ts` 合併 |
| M8-3 六張地圖與 Phaser | ✅ | `build-map.mjs` 的 `buildDeckLayout(n)`，deck1 逐位元不變；`Preloader` 依 registry `chapter` 載圖；`Station` 依 `terminalEffects` 分派 powerRestored／openDoor／shadowFlash／flicker／blackout，`startDark` 決定開場亮不亮；`objects/effects.ts` 多了 `resolveSolvedState` 等純函式 |
| M8-4 多章節流程 | ✅ | `chapters/index.ts` 註冊表（`getChapter`、`getNextChapter`、`findTerminal`、`isChapterComplete`、`chapterTeaches`）；store `advanceChapter`、`resetChapter`；旗標 `ch<n>.introShown`／`outroShown`／`room.<id>.entered`；`ChapterEndScreen` 多 `nextChapter` 與 `ending`（片尾在 `chapters/ending.ts`）；`TitleFlow` 副標顯示目前章節；`PlayScreen` 全部改用目前章節 |
| M8-5 五章劇本 | ✅ | `ch2-datacenter.ts`、`ch3-engineering.ts`、`ch4-comms.ts`、`ch5-bridge.ts`、`ch6-nova-core.ts`，各六台、各自的 `.test.ts` 用真的 Shell 跑正解（`SOLUTIONS` 表）並檢查檔案數與大小上限（40 個、20 KB）、性別指涉。撤離當晚時間軸統一：04:36:58 回滾開始、04:37:09 `unset NOVA_DIR`、04:37:12 `rm -rf "$NOVA_DIR/"`、04:37:15 2% 中止、04:40 主艙門鎖 |
| M8-6 e2e | ✅ | `e2e/helpers/deck.ts`（`playChapter` 六章共用路線、`seedSave`、`passChapterEnd`）、`happy-path.spec.ts`（第一章從標題到進第二章）、`chapters.spec.ts`（第二到六章各一個）。playwright-cli 另外實際開過第三章開場斷電與第六章片尾截圖確認 |
| M8-7 插圖 | ✅ | `generate-ch2-6.sh` 用 codex 背景產 36 張（五章各六間艙區加結尾過場、一張片尾），第八場產到第 24 張 codex 額度用完，第十場補齊剩下 12 張；`scripts/resize-scenes.mjs` 縮圖，`story/scenes.ts` 的 `AVAILABLE_SCENES` 列已產出的、`scenes.test.ts` 跟目錄比對 |

**完成定義**：六章都能從標題一路玩到片尾（e2e 驗過）；一位新手能靠 hint 通關這點仍沒有真人驗證。

### M9 第一版之後的小尾巴 ✅

2026-10-06 第十場，Danny 要求把第 9 節的七項做掉並驗證，四個設計決策用 AskUserQuestion 拍板（全部照建議）：存位置並升 v2、選章只開放到過的章節且只清該章、grep 照真的 grep、進核心艙之後換 nova-core。決策見第 8 節 #40 到 #46。

| 任務 | 狀態 | 產出 |
|---|---|---|
| M9-1 shell 邊界 | ✅ | `commands/grepPattern.ts`（BRE／ERE 轉 JS RegExp，`-E`、`-F`，九種不合法樣式訊息）；萬用字元每一段都展開；`chmod` 逗號組合與四位數八進位；`sort -u` 依比較結果去重；重導向先建檔；`uniq [輸入 [輸出]]`。agent 用 Docker 的 GNU grep 3.8 與 coreutils 9.1 實測對照 |
| M9-2 存檔 v2 | ✅ | `SAVE_VERSION` 2，`progress` 多 `furthestChapter` 與 `position`（章節、座標、艙區）；`migrateSaveData` 把 v1 轉 v2；`clearChapter` 抽成純函式，`resetChapter`／`selectChapter` 共用；Phaser 端 `objects/position.ts` 的 `PositionReporter`（停下才發 `player:stopped`）與 `resolveSpawnPoint` |
| M9-3 選章 | ✅ | `ChapterSelectPanel.tsx`，`TitleScreen` 到過兩章以上才出現「選章」，確認後 `selectChapter`；選第一章重走 boot log |
| M9-4 關閉閃爍管到 Phaser | ✅ | `effects.effectSafety`；registry `flickerEnabled` 加 `effects:settings` 事件；人影改 1.4 秒淡入淡出、鏡頭不震、開門不閃光、`flicker` 演出與排隊中的燈閃都擋 |
| M9-5 按 E 像素字型 | ✅ | `objects/pixelFont.ts` 讀 `--font-fusion-pixel`，12px、解析度 1；`document.fonts.load` 後 `style.update(true)` 強制重畫 |
| M9-6 第六章 NOVA 立繪 | ✅ | `story/flags.novaPortraitFor`，`NovaDialogue` 的 `portrait` prop |
| M9-7 小視窗排版 | ✅ | 1280 以下「按 E 開啟」提示往上移、NOVA 對話框在 1024 以下疊到目標面板上方；e2e 檢查 1280、1024、768 三種寬度互不重疊 |
| M9-8 反斜線與 grep -w／-o | ✅ | 第十一場：`tokenizer.ts` 引號外的 `\` 跳脫下一個字元（`cd my\ dir`、`\|`、`\$HOME`），雙引號內多認 `\$`；`grepPattern.ts` 的 `wholeWord` 用前後環視包樣式、`matches` 給 `-o`，`-F` 也改走 RegExp；`grep -w`、`-o` 與 man 說明。用 Docker 的 GNU grep 3.8（`C.UTF-8`）對照 |

### M10 到 M14 優化路線 ✅

2026-10-08 第十三場，七面向審計加逐項驗證後，Danny 用四輪 AskUserQuestion 勾選。每項的問題描述、證據行號與懷疑者的修正意見在 [`audit-2026-10-08.md`](./audit-2026-10-08.md)，表格「審計」欄是該檔的編號。「注意」欄是驗證時發現的限制，動工時照它做。順序：M10 是 Danny 指定的第一批；M11 到 M14 是我排的，M13 排在 M14 前面是為了讓沙盒用得到新指令。

**M10 玩家體驗與引導**

| 任務 | 審計 | 狀態 | 注意 |
|---|---|---|---|
| M10-1 過關明確回饋：終端機插「目標達成」系統行、重用 power 音效、標題列標已完成 | A10 | ✅ | 4.10 只有五種音效，不新增音檔；ObjectivePanel 被 z-40 黑幕壓暗 |
| M10-2 目標跟著終端機走：開著時顯示該台目標、HUD 優先指向附近那台、ch1 T3 到 T6 補地點描述 | A12 | ✅ | `currentObjective` 在 `PlayScreen` 取第一台未解 |
| M10-3 操作提示常駐：第一章 HUD 顯示「方向鍵移動 · E 互動 · Esc 選單」直到 T1 過關 | A9 | ✅ | 審計說插圖卡壓住操作句不成立，問題只在說一次就消失 |
| M10-4 NOVA 對話紀錄面板：本章地圖台詞可回看 | A35 | ✅ | 不推翻 #6 與 #61；被 `dropStaleRoomMessages` 丟掉的也要進紀錄 |
| M10-5 卡關偵測擴大：合法但沒進展也算卡關、可間隔再提醒 | A8 | ✅ | **改 M5-3「每台只救一次」的規格**，動工時同步改 game-design 4.8 |
| M10-6 萬用字元與 Tab 說明：`CONCEPT_DOCS` 補 `*`、Tab、`..`／`~`，ch2 T2 的 onOpen 或 onStuck 提到 `*` | A14、A38 | ✅ | 不把 man 搬到第一章（4.3 刻意排第五章）；`teaches` 加 "Tab" 會被 help 當指令列出，要另外處理 |
| M10-7 hint 用盡措辭：三台第三段要代入路徑，不再宣稱「上面就是完整答案」 | A13 | ✅ | |
| M10-8 已學指令面板鍵盤化：終端機開著時也能用快捷鍵開 | A15 | ✅ | 快捷鍵不能跟終端機輸入撞 |
| M10-9 扣氧即時回饋：O2 數字閃琥珀並浮出 -1，數值不動 | A11 | ✅ | 不加警示音（4.10）、不跟第 3 次燈閃重疊；game-design 4.8 補一句 |
| M10-10 `/play` 沒存檔導回標題，sitemap 拿掉 `/play` | G5 | ✅ | `e2e/play.spec.ts` 靠空存檔直連，要改用 `seedSave` |
| M10-11 觸控裝置提示：偵測觸控裝置顯示「需要實體鍵盤」 | A34 | ✅ | 只提示，不做虛擬方向鍵 |

**M11 地基：架構與測試**

| 任務 | 審計 | 狀態 | 注意 |
|---|---|---|---|
| M11-1 hint 照抄常駐測試，e2e 與單元測試共用同一份正解 | A24、A27 | ✅ | 抽取 regex 抓不到中文參數（ch4 T2）與沒有「輸入」字樣的（ch6 T6），allowlist 要逐台說明 |
| M11-2 拆 PlayScreen 並補單元測試 | A18、A25 | ✅ | M10 會先往 PlayScreen 加東西，拆的時候一起帶走 |
| M11-3 hook 與 selector 穩定化：`useNovaQueue`、`useTerminalPressure` 回傳值 useMemo，PlayScreen 改 `useShallow` | A4、A19 | ✅ | 目前沒有實際壞掉的情境，屬預防 |
| M11-4 Phaser registry 型別化 | A20 | ✅ | |
| M11-5 整併重複：五章的終端機身分小幫手改用 `decks.ts` 的 `deckTerminalIdentity`、十個指令的選項切分抽共用 | A21、A22 | ✅ | |
| M11-6 e2e flaky：走路改讀角色座標的閉環走法，Playwright 層 retry 標 flaky | A23 | ✅ | 審計對 Phaser `fixedStep` 的根因分析有誤，見驗證段；座標鉤子沿用 #7 只在開發模式掛 |

**M12 效能與存檔穩健**

| 任務 | 審計 | 狀態 | 注意 |
|---|---|---|---|
| M12-1 預取 `/play` 與 Phaser chunk | A1 | ✅ | 包在 idle callback 或只在 boot 階段觸發，避免標題動畫卡頓 |
| M12-2 本章插圖背景預載 | A3 | ✅ | 在 `scene:ready` 才預載救不到第一間房，要更早開始 |
| M12-3 瘦身相依：Phaser 換 arcade 版、清模板殘留相依與沒用的 ui 元件 | A5、A7 | ✅ | |
| M12-4 劇本改版偵測：存檔記劇本內容雜湊，未過關的終端機遇到新版就重建、保留歷史與計數 | G1 | ✅ | Danny 潤稿時最需要；會動存檔格式，跟 M14-1 的 v3 一起規劃 |
| M12-5 寫入失敗與損毀：接 QuotaExceededError、terminals 壞掉時不再按 E 無聲失敗、較新版本存檔不硬轉 | A16、A17、A50 | ✅ | |
| M12-6 素材載入失敗提示：Preloader 處理 loaderror，顯示繁中提示與重新載入 | 淘汰項的附帶發現 | ✅ | error boundary 接不到 Phaser 迴圈裡的例外，要走 loader 事件 |

**M13 shell 擴充**

| 任務 | 審計 | 狀態 | 注意 |
|---|---|---|---|
| M13-1 不支援語法給明確提示：`\|\|`、`&`、`<`、`2>`、`$()`、反引號回 ParseError；`cd` 參數過多報錯 | G2 | ✅ | 跟 M13-2 一起做，已支援的就不報 |
| M13-2 實作 `;`、`&&` 與開頭 `~` 展開 | G2 | ✅ | 改 game-design 3.3 支援語法清單 |
| M13-3 新指令 less、tree、cut、diff、which，**只開放使用**加 man 說明，不編進劇本 | A39 | ✅ | less 要做真的分頁器（終端機 UI 全螢幕模式），不做「cat 加 --More--」的假版，見設計第 1 節與 #57、#60；which 要配合 PATH 概念 |

**M14 新功能**

| 任務 | 審計 | 狀態 | 注意 |
|---|---|---|---|
| M14-1 通關狀態與遊玩統計：片尾後標題顯示已逃離、記錄每章時間與錯誤、hint 次數，章節結束顯示 | A41、A42 | ✅ | 存檔升 v3；推翻第九場「通關後副標停在第六章屬預期」與 #34 的一部分 |
| M14-2 存檔匯出匯入 | A45、A49 | ✅ | 匯入要走 migrate 與 schema 驗證 |
| M14-3 沙盒練習模式：標題新入口，預載一組練習檔案、可重置、所有指令開放、不存檔不扣氧 | A40 | ✅ | 擴充 4.7 標題選單；`Terminal` 元件本身不綁 store，可直接用 |

## 4. 待處理雜項

不屬於任何里程碑，但會影響接手的人，做完就勾掉。

- ✅ **移除暫存的原圖追蹤**：2026-10-08 Danny 親自執行 `git rm --cached docs/assets-draft/*-original.png`，六張原圖（`nova-core`、`nova-eye`、`technician-sheet`、`technician-c`、`technician-d`、`technician-e`，約 8.7 MB）不再追蹤，檔案仍留在這台 Mac 的硬碟上，`.gitignore` 規則原本就在。
- ✅ **設計文件過時段落**：2026-10-01 已把 6.2 標題改成「自產與補充的素材」、6.3 與第 8 節的張數改成實際的 8 張場景圖。
- ⬜ **真人試玩**：完成定義「沒碰過終端機的人能靠 hint 通關」還沒驗證。找一位新手玩第一章，記錄卡在哪、hint 哪一段救了他。
- ⬜ **試聽五個音效**：agent 看檔名挑的，沒人聽過，見 M6-3。
- ⬜ **劇情文字潤稿**：六台終端機的檔案內容、NOVA 台詞、boot log、章節結尾都是 agent 初稿，`src/game/chapters/ch1-life-support.ts` 與 `src/components/title/BootLog.tsx`，改完跑 `pnpm test --run src/game/chapters` 會檢查格式與性別指涉。
- ✅ **補產 12 張插圖**：2026-10-01 codex 額度用完時缺的第五章後三間、`ch5_outro`、第六章六間 `nv_*`、`ch6_outro`、`ending`，2026-10-06 第十場補齊，`AVAILABLE_SCENES` 已列滿 44 張（含第一章 8 張）。
- ⬜ **第二到六章劇情潤稿與試玩**：五章劇本（`src/game/chapters/ch2-*.ts` 到 `ch6-*.ts`）全是 agent 初稿，Danny 還沒玩過。第二章冷卻日誌「三年來兩人份熱負載」的第二個人，2026-10-08 Danny 定案為冷凍艙裡的玩家，劇本不明講、維持現狀（見 `game-design.md` 4.3「兩人份熱負載」）。第六章 T6 NOVA 最後一句「祝旅途平安，技師」同日定案保留，就是要暗示 NOVA 還活著（見 `game-design.md` 4.3「NOVA 沒死透」）。劇情留白已全部定案，剩潤稿與試玩。（`day_312` 差一與其他十處時間線矛盾已在第十二場修掉，見第 8 節 #49 到 #51。）
- ✅ **刪模板殘留檔**：2026-10-08 Danny 授權後已刪 `src/app/favicon.ico` 與五個 create-next-app 的 SVG，build 後 `/icon.png` 照常生成、1861 測試全綠。
- ⬜ **淘汰的原圖只在 Danny 的 Mac 上**：`nova-portrait`、`nova-v2`、`nova-v3`、`nova-id`、`nova-mannequin`、`nova-lowres`、`technician-b` 的 `-original.png` 沒進版控也不需要，另一台電腦看不到是正常的。

## 5. 已知陷阱與環境備註

寫程式前先看，都是踩過的坑。

- **codex 產圖附參考圖**：`-i <FILE>...` 是可變數量參數，會把後面的提示詞吃成圖片路徑。正確寫法是提示詞從 stdin 餵、選項用 `--` 結束：
  ```bash
  cd docs/assets-draft && codex exec --skip-git-repo-check -s workspace-write -i nova-eye-original.png -- <<'PROMPT'
  請用你的 image_generation 工具產生一張圖：……。產生後把圖片存成目前目錄下的 <name>-original.png
  PROMPT
  ```
  一張約兩分鐘，1254x1254，codex 會先存到 `~/.codex/generated_images/<session>/` 再複製過來。
- **NOVA 不要再產人臉版**：六種人形方向 Danny 都沒採用，定案非人形。
- **sprite 重切**：原圖有 alpha 1 到 31 的極淡雜訊與碎屑，`scripts/slice-sprites.mjs` 已處理（清雜訊、每格只留最大連通區塊、每列各自縮放、腳底對齊第 47 列）。新增角色時把原圖加進腳本的 `SHEETS` 陣列再跑 `pnpm sprites:slice`。
- **Git 憑證**：`origin` 已改回 HTTPS，2026-10-08 Danny 用它 push 成功，HTTPS 憑證現在可用。`gh` 是否仍是失效的其他帳號沒有重新確認過，抓公開 repo 資料照舊用 `curl`，不要用 `gh api`。
- **Next.js 16 與 Phaser**：Phaser 會碰 `window`，只能在 client component 內用 `next/dynamic` 加 `ssr: false` 載入。寫 Next.js 相關程式前先讀 `node_modules/next/dist/docs/` 的對應章節，這版與訓練資料有差異。
- **版本限制**：TypeScript 停在 6.x、ESLint 停在 9.x，原因見 `CLAUDE.md`。
- **Vitest**：設定在 `vitest.config.mts`，只掃 `src/**/*.{test,spec}.{ts,tsx}`，環境 jsdom，`@/` 別名已設。純邏輯測試可在檔案頂端加 `// @vitest-environment node` 加速。測試共用的 fixture 檔不要用 `.test` 後綴（例如 `testFixtures.ts`），否則會被當測試跑。
- **Phaser 4 在 import 時就讀 `window`**：任何會被 SSR 的 React 元件都不能 import 到 Phaser，連 `Phaser.Events.EventEmitter` 也不行，所以 `EventBus.ts` 是自己寫的零相依 emitter。React 端只 import `@/game/phaser/EventBus`、`events`、`constants`，不要 import `@/game/phaser`（index 會帶進 main.ts 與場景）。Phaser 的單元測試在 node 與 jsdom 都跑不起來（jsdom 沒 canvas），所以 Phaser 類別只抽純函式測（`movement.ts`、`nearby.ts`、`RoomTracker.ts`、`mapObjects.ts`），視覺行為靠 e2e 與截圖。
- **Phaser 場景的 SHUTDOWN 與 DESTROY 是兩條路**：場景 `stop`／`restart` 走 `SHUTDOWN`，但 React 卸載時的 `game.destroy()` 只發 `DESTROY`（`Systems.destroy` 不會先 shutdown）。訂閱全域 EventBus 或建立 sound 的清理要兩個事件都掛（Station 用一個只跑一次的 `cleanup`）。2026-10-01 踩過：回標題或 Fast Refresh 重建遊戲後，舊 Station 的 `sfx:play` 訂閱還在，而 sound 已被 SoundManager 整批銷毀（`currentConfig` 變 null），下一個按鍵聲炸「Cannot set properties of null (setting 'seek')」。`AudioManager` 也多聽每個 sound 的 `DESTROY` 把它從清單拿掉當第二道保險，`audio.test.ts` 有用假 scene 重現。
- **e2e 的埠**：`playwright.config.ts` 吃 `PORT` 環境變數（預設 3000），這台 Mac 的 3000 常被別的專案佔住、遊戲 dev server 跑在 3001 時用 `PORT=3001 pnpm test:e2e`。e2e 若在第一步就等不到 canvas 而頁面是別的網站的 404，就是撞到這個。client-side 導頁後 Next 的路由播報器（`#__next-route-announcer__`）會複誦頁面標題，`getByText("KEPLER-9")` 會撞到兩個元素，改用 `getByRole("heading")`。
- **Phaser 鍵盤的三個坑**：（1）`createCursorKeys()` 會連 SPACE、SHIFT 一起 capture，而且 capture 是整個 window 共用，終端機輸入框會打不出空白，所以 Player 用 `addKeys` 分開註冊、WASD 不 capture；（2）`JustDown` 靠 `Key.onUp` 會清掉的旗標，keydown 與 keyup 同一幀時（自動化測試的 `press`）會漏掉，要用 `key.on("down")` 事件；（3）`game.destroy()` 是排到下一個 step 才拆 canvas，React StrictMode 同步建立再立刻 destroy 會留下兩層 canvas，`PhaserGame` 改成 `requestAnimationFrame` 延後一幀建立。
- **地圖契約**：圖層與物件命名在 `src/game/phaser/constants.ts`，腳本 `scripts/build-map.mjs` 與 `Station.ts` 兩邊都照它；`map.test.ts` 會檢查 `deck1.json` 跟 `buildMap(DEFAULT_LAYOUT)` 一致，所以用 Tiled 手改地圖後要同步更新腳本或改測試。Tiled 1.9 以後的 `class` 欄位 Phaser 不讀，物件要用 `type`。警示條邊框是「地板的邊緣」放 `floor` 層可走，真正的牆是深色片放 `walls` 層。
- **store 的使用規則**：`@/game/store` 的 index 帶 React hook，只能在 client component import，純邏輯或 server component 用 `@/game/store/types`。**讀檔完成前不要呼叫任何 action**（每次 `set` 都會寫 localStorage，會把預設值蓋掉存檔），依賴存檔的畫面都要先等 `useStoreHydration()` 回 true。selector 不要回傳新組的物件，多欄位用 `useShallow`。
- **Terminal 元件的整合規則**：`shell` 必須是同一個實例（`useState` 保住），每次 render 都 `new Shell` 會重置 cwd 與歷史。`entries` 由父層持有並整批替換，`clear` 會傳空陣列。掛載當下就在 `entries` 裡的 dialogue 不重播打字動畫，要播的 NOVA 台詞得在掛載後才 push。Esc 有 `preventDefault` 也有 `stopPropagation`（原因見下一條）。 less 分頁器開著時輸出區與輸入列藏起來（不卸載），點終端機任何地方焦點回到分頁器，搜尋模式時回到搜尋框；分頁器只攔它認得的鍵，F5、F12、Tab 照常給瀏覽器。
- **window 的 keydown 監聽會接到「讓它掛上去的那個事件」**：暫停選單的 Esc 監聽（M11-2 起在 `usePauseMenu`）掛在 window，而且在終端機關閉（state 變更）的同一個 keydown 事件裡由 effect 重新掛回去。React 對離散事件會同步 flush effect，而 DOM 規範只禁止「同一個 target 在派送中新增的監聽」被觸發，window 是上層的另一個 target，所以同一下 Esc 關了終端機又打開暫停選單。2026-10-01 第七場踩到，修法是終端機的 Escape handler 加 `stopPropagation`。同類結構（元件 A 處理某鍵後卸載、元件 B 在 window 聽同一個鍵）都會中招，先懷疑這個。之前 e2e 的回標題測試用重試迴圈「按到暫停選單開為止」，剛好把這個 bug 蓋掉了，e2e 裡的重試迴圈要小心。
- **暫停選單開著時 Phaser 場景沒暫停**：`game:pause` 只關角色輸入，場景照跑（燈光脈動、NOVA 對話不受影響），所以 Phaser 這邊聽的鍵（E 開終端機）要自己擋。`TerminalZones.setInteractEnabled` 由 Station 在 `game:pause`／`game:resume` 切換；之後新增 Phaser 端的按鍵都要走同一條路。
- **e2e 走路是讀座標的閉環（M11-6）**：開發模式下 Station 把角色狀態掛在 `window.__kepler9Player.read()`（`{x, y, roomId, inputEnabled}`，sprite 中心座標；正式 build 不掛；刻意不併進 `__kepler9`，因為 `usePhaserBridge` 會整個指定再整個 delete 那個物件）。`e2e/helpers/deck.ts` 的 `walkToTerminal(page, index, title)`、`walkToCorridor(page, x)` 從任何位置規劃路徑點（房間 → 門口內側 → 走廊中線 y 352 → 目標門口 → 終端機前），在頁面裡逐幀讀座標，到放開點就放開，並量放開後滑多遠修正下一次，最後以「按 E 開啟 ○○」為準。不要再寫 `waitForTimeout` 計時走路。幾個坑：（1）門一格寬、碰撞盒 20，中心要在門中心 ±6 px 內，所以穿門那段 x 容錯是 6，同時按水平鍵讓角色沿牆滑進門；（2）橫越走廊一律沿中線，貼著上下牆走會被同一欄的對面門吸進去（門都在 x 208、592、976）；（3）keydown 和 keyup 落在同一幀時 Phaser 讀不到按下，「點一下」可能完全沒動，閉環要求至少動 0.5 px 才算到；（4）改平面圖（`build-map.mjs`）要同步改 `deck.ts` 的 `SLOT_GEOMETRY`；（5）查 flaky 時加 `E2E_WALK_DEBUG=1`，會印出每段的輪數、卡住次數和滑行估計值。脫困邏輯（對準另一軸、往反方向退）約 900 段路都沒觸發過，實戰沒驗到。
- **劇本的三個坑（第八場）**：（1）`deckTerminal()` 回傳的物件多一個 `slot`，`terminalDefinitionSchema` 是 strictObject，直接 `...deckTerminal(n, i)` 展開會驗證失敗，用 `deckTerminalIdentity(n, i)`；（2）性別檢查的正規表示式 `/[他她]|…/` 連「其他」「他們」都擋，劇本文字要改寫成「別的」「那些」；（3）每台終端機的 FS 會序列化進 localStorage，單台控制在 40 個檔案、20 KB，各章測試有檢查。前一台的成果要「預先放進」後一台的快照（每台 FS 獨立）。
- **e2e 的平行度**：閉環後走路不怕掉幀，本機 workers 是 4（8 個 worker、load 61 下也全綠，只是整章測試會拉長到 2 分鐘以上、逼近 180 秒逾時）。Playwright 本機 retry 1、CI 2，重跑才過的測試會在 list 報告標成 flaky；判讀看報告裡的 flaky 數。html 報告不自動開，失敗時用 `pnpm exec playwright show-report`。單跑某章用 `-g "第 2 章"`。導頁與動畫的固定 5 秒等待（例如選章後的 `toHaveURL`）在機器很忙時理論上仍可能逾時。
- **Vitest 與 CSS Module**：`postcss.config.mjs` 用字串宣告 `@tailwindcss/postcss`，Vite 解析不了，所以 `vitest.config.mts` 設了 `css.postcss: { plugins: [] }`，單元測試不跑 Tailwind。vitest 沒開 globals，Testing Library 不會自動 cleanup，元件測試要手動 `afterEach(cleanup)`。
- **字型尺寸**：VT323 的 x-height 偏小，終端機字級不要低於 20px；Fusion Pixel 用 12 的整數倍最清楚。Next dev 模式左下角有 Next.js 的圓形工具按鈕，會蓋住 `/play` 的設定列，正式 build 沒有。
- **Shell 引擎的已知邊界**（M9 補完之後仍刻意不做，之後章節需要再補）：
  - 快照的 key 不可含 `/`、空字串、`.`、`..`；目錄裡不要放名叫 `$type` 的子項，那是型別標記。
  - 路徑的 `..` 是純字串化簡，`wake_up.txt/..` 不會報 ENOTDIR；對檔案加結尾斜線會報 ENOTDIR。`~user` 不支援。
  - 解析器對整行掃全形字元，包括引號內；彎引號 `“”‘’` 也算全形（中文輸入法按 `"` 會打出來）。反斜線跳脫過的 word 整個不做萬用字元展開（跟引號同一個簡化，bash 只讓被跳脫的那個字元失效），例如 `\*.log*` 的結尾 `*` 也不展開。
  - 補全只處理游標在結尾，用空白與 `;`、`|`、`&` 切 token 不走 tokenizer；`cd ..` 與 `cd ~` 不帶斜線按 Tab 沒有候選。
  - `ls -l` 的日期固定用 UTC 顯示，劇本寫 mtime 時要自己算好想給玩家看的時間。
  - `messages.notADirectory` 的文案偏向 `cd`，`ls wake_up.txt/inner` 這種路徑中間是檔案的情況語意稍偏，之後可讓它帶指令名。
  - grep 不支援 `[.ch.]`、`[=e=]`、`-G`、`-P`、`-x`；`-i [[:upper:]]` 不跟 glibc 一樣配到中文。
  - `chmod` 的 `u+`、一兩位數字、五位數以上判為不合法；沒有 umask，不寫類別的 `+`、`-` 三組都改；四位數的第一位（setuid 等）接受但忽略。`sort` 沒有 `-f`。
- **存檔 v2 與 e2e**：`seedSave` 刻意寫 v1 讓 migrate 在真瀏覽器跑一次。角色停下就存位置，所以「回標題再繼續」會出現在剛才停下的地方；走路工具是閉環，從任何位置出發都走得到。
- **e2e 的 `textContent()` 會無限等待**：元素不存在時 Playwright 的 `locator.textContent()` 預設沒有逾時，舊的 `alignToTerminal` 曾因此卡到整個測試 180 秒逾時、微調重試根本沒機會跑；查詢可能不存在的元素要給 `{ timeout }`（`walkToTerminal` 確認「按 E」提示時給 2 秒）。

## 6. 協作慣例

- **先討論再動工**：重大設計選項整理成表格與建議，用 AskUserQuestion 一次問三到四題。Danny 選「再討論」就繼續討論，不要急著寫程式。ASCII 圖解釋畫面配置對他很有效。
- **commit 規範**：Conventional Commit，主旨繁體中文，不加 AI 署名 footer，依性質拆分（docs、feat、chore、test 分開）。
- **程式風格**：註解與說明繁體中文台灣用語，命名英文，型別 PascalCase，變數與函式 camelCase，避免巢狀三元。
- **設計變更**：改 `game-design.md`，不在本檔重寫設計。進度變更改本檔。

## 7. 工作日誌

每次 session 收工加一筆，最新在最上面。格式：日期、做了什麼、commit 範圍、下一步。

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
- 四輪問答勾選結果寫成第 3 節的 M10 到 M14，證據與修正意見存在 `docs/audit-2026-10-08.md`（行號是 `11d50c6` 的狀態）。
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

## 8. 自主執行時的決策（待 Danny 確認）

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

## 9. 第一版之後的候選工作

沒有排定順序，Danny 決定要不要做。第十三場審計出的項目已排進第 3 節的 M10 到 M14 並在第十四場全部完成，沒選的列在 `audit-2026-10-08.md` 末尾。

- **真人試玩與調整**：第 4 節的試玩、試聽、潤稿（含第二到六章）。
- **部署**：`pnpm build` 已過、三個路由都是靜態，可直接上 Vercel 或任何靜態主機；CI 已在第十二場設好（`.github/workflows/ci.yml`），部署後記得設 `NEXT_PUBLIC_SITE_URL`（sitemap 與 OG 圖的網域都吃它）。
