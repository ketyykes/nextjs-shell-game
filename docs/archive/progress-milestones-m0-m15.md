# 里程碑任務清單 M0 到 M15（已封存）

> 原 `docs/progress.md` 第 3 節，2026-10-16 封存。M0 到 M15 全部完成，逐項的產出位置、commit 與動工時的「注意」欄保留在這裡供查考；里程碑總覽仍在 [`docs/progress.md`](../progress.md) 第 2 節。
>
> 文內的「第 N 節」「決策 #N」「第 9 節配置」是封存當時的節號：`progress.md` 第 4 節 → `progress.md` 第 3 節、第 5 節 → [`notes/pitfalls.md`](../notes/pitfalls.md)、第 8 節 → [`notes/decisions.md`](../notes/decisions.md)、第 9 節 → `progress.md` 第 5 節；`game-design.md` 第 9 節（地圖配置）→ 第 7 節；`audit-2026-10-08.md` → [`archive/audit-2026-10-08.md`](./audit-2026-10-08.md)。

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

### M15 遊戲化：八角框架 ✅

2026-10-15 第十七場。Danny 先請我依「遊戲化實戰全書」的八角框架（Octalysis）盤點功能，再下 `/goal` 要求八項都做、指揮 Opus 5.5 平行實作並自我驗證。八角框架的診斷：右下角（稀缺、不確定、損失）很重，左上與右側（發展與成就、賦予創造力、所有權、社會影響力）偏空，所以這批以右腦與白帽動力為主，不做徽章、排名這類外在獎勵（4.7「只陳述不評分」）。

| 任務 | 八角動力 | 狀態 | 產出 |
|---|---|---|---|
| M15-1 shell 彩蛋 | 7 不確定性與好奇心 | ✅ | `whoami`、`id`（你是 uid 1006、不在 crew 群組）、`last`（阿彬 3/10 凌晨登入過）、`sudo`（「這件事會被回報」）、`exit`／`logout`；只開放使用、不扣氧，沙盒有自己的一份帳號與登入紀錄 |
| M15-2 拼字建議 | 2 發展與成就（新手不卡） | ✅ | `parser/suggest.ts` 的 Damerau–Levenshtein、大小寫提示、站上沒有的程式（vim、apt、python、ssh、Windows 的 dir 等）專屬說明 |
| M15-3 `unset` 指令 | 7 好奇心（劇情核心） | ✅ | `commands/unset.ts`；劇本可用 `readonlyEnv` 設唯讀變數（第五章 T1） |
| M15-4 提前用上的認可 | 3 賦予創造力與回饋 | ✅ | `story/solutionInsight.ts`：過關那一行用了還沒教的指令、旗標或語法，插一行 ☆ 認可，整份存檔每樣只認一次 |
| M15-5 阿彬的隱藏留言 | 4 所有權、7 好奇心 | ✅ | `story/abinNotes.ts`：八則留言以覆蓋層補寫進終端機（已過關的也拿得到），右側面板第三個標籤（Alt+A），集滿片尾多一段 |
| M15-6 回信 | 5 社會影響力與同理心 | ✅ | 第四章寫 `/home/abin/reply.txt`，第五章稽核紀錄、第六章 NOVA 記憶檔引用；存檔 v4 |
| M15-7 除役倒數可見化 | 1 重大使命、6 稀缺 | ✅ | HUD 左上 O2 下方的倒數，前四章標「站務排程」，第五章 T1 後「遠端除役」，第六章 T4 後「目標無回應」；boot log 一行 |
| M15-8 NOVA 看狀態 | 7 好奇心、8 損失與避免（被監看） | ✅ | `story/novaReactions.ts`：讀留言、回信、走進阿彬的家目錄、查自己的帳號、hint 用太多、`unset NOVA_DIR` 各有一句；第五章 T4 可親手重現那三秒；章節開場依前一章找到的留言多一句 |

**完成定義**：八項都有單元測試、e2e 與實際瀏覽器操作驗證；兩輪唯讀審查找到的問題都已修正（第 8 節 #106、#111、#112、#118、#123、#125），接受不修的列在 #124、#125。新文字（留言、反應台詞、片尾加段）是 agent 初稿，待 Danny 潤稿與試玩。
