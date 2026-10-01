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
| 更新日期 | 2026-10-01 |
| 最新 commit | `fd9ef4e test: 加入 Phaser 模組、地圖契約、PhaserGame 元件的單元測試並更新 /play e2e 為走到終端機按 E` |
| 目前階段 | M3 Phaser 地圖與角色 ✅ 完成，M4 事件橋接與 HUD ⬜ 尚未開工（M4-1 事件型別與 M4-2 開關終端機已在 M3 順手做完） |
| 程式碼狀態 | `/play` 是完整地圖：角色走動碰撞、斷電光圈、六台終端機發光、走近按 E 開 shell 彈窗、Esc 關閉、重整接續。`pnpm test --run` 35 個測試檔 560 個測試全綠，`pnpm test:e2e` 6 個全綠 |
| 下一步 | M4-3 過關演出與 M4-4 NOVA 對話框，見第 3 節。`Station.lightMask.setPowered(true)` 與 `collisionLayer` 已留好掛點 |
| 遠端 | `origin` 是 SSH 網址 `git@github.com:ketyykes/nextjs-shell-game.git`，本機與 `origin/main` 同步 |

## 2. 里程碑總覽

對應 `game-design.md` 第 8 節的工作順序，每一步都要能跑、能測。

| 里程碑 | 內容 | 狀態 | 設計文件章節 |
|---|---|---|---|
| M0 | 方向討論、設計文件、素材前置、工具鏈 | ✅ | 全部 |
| M1 | Shell 引擎與單元測試 | ✅ | 3.3、4.8、8-1 |
| M2 | 終端機 UI 與 zustand store | ✅ | 4.9、5、8-2 |
| M3 | Phaser 地圖與角色 | ✅ | 3.2、6.2、9、8-3 |
| M4 | 事件橋接與 HUD | ⬜ | 3.1、4.6、8-4 |
| M5 | 第一章劇本 | ⬜ | 3.4、4.4、4.8、8-5 |
| M6 | 插圖與音效 | ⬜ | 4.10、6.3、8-6 |
| M7 | 存檔、標題畫面與設定 | ⬜ | 4.7、8-7 |

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
| M2-6 CRT 效果 | ✅ | `src/components/game/CrtOverlay.tsx`（掃描線、暗角、閃爍各自 prop，`prefers-reduced-motion` 自動關閃爍）、`OxygenVignette.tsx`（低於 30% 的琥珀暗角）。`/play` 底部有三個開關的暫時設定列，M7-5 做正式選單後移除 |
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

### M4 事件橋接與 HUD ⬜

目標：地圖與終端機能來回切換，過關有演出。

- ✅ **M4-1 事件型別**（3.1）：`src/game/phaser/events.ts`，M3 完成。多了 `terminal:nearby` 與 `scene:ready`。
- ✅ **M4-2 開關終端機**（4.6）：M3 完成，見 `TerminalZone.ts` 與 `PlayScreen.tsx`。
- ⬜ **M4-3 過關演出**（4.4）：T4 燈逐盞亮加走廊盡頭人影一幀；T6 主艙門開。
- ⬜ **M4-4 NOVA 對話框**（4.9）：右下角固定，立繪 `nova-eye` 在左、文字在右，打字動畫，幾秒後自動淡出。
- ⬜ **M4-5 HUD**（4.8、5）：目前目標面板、左上角 O2 百分比、已學指令側邊面板。
- **完成定義**：從地圖開終端機解一題，關掉後看到演出。

### M5 第一章劇本 ⬜

目標：從 T1 玩到 T6 通關。

- ⬜ **M5-1 schema 與旗標**（3.4、7）：`src/game/story/{schema,flags,objectives}.ts`，zod 定義章節與終端機 schema。
- ⬜ **M5-2 ch1-life-support.ts**（4.4）：六台終端機各自的初始 FS、目標判定函式、三段式 hint、NOVA 台詞與觸發條件、進房台詞。所有文字不得指涉主角性別、年齡、名字，NOVA 叫玩家「技師」。
- ⬜ **M5-3 卡關偵測**（4.8）：同一台終端機連續五次錯誤或三分鐘沒進展，NOVA 用劇情台詞給 hint 第一段的內容。
- ⬜ **M5-4 環境反應階梯與氧氣值**（4.8）：3 次燈閃、6 次遠處門聲、9 次 NOVA 台詞；每次錯誤 O2 掉 1%，最低 5%，過關回 100%。
- ⬜ **M5-5 章節結束**（4.7）：過場插圖、NOVA 結尾台詞、指令回顧卡、自動存檔、「第二章開發中」回標題。
- **完成定義**：一位沒碰過終端機的人能靠 hint 通關第一章。

### M6 插圖與音效 ⬜

- ⬜ **M6-1 codex 產圖**（6.3）：還缺六個艙區各一張場景插圖與開場、結尾兩張過場，共 8 張。NOVA 立繪與 sprite 已完成。用 `-i` 附 `nova-eye-original.png` 或 tileset 預覽當風格參考，提示詞放 stdin，見第 5 節陷阱。
- ⬜ **M6-2 素材搬移**：`nova-eye`、`nova-core` 縮小版搬到 `public/scenes/`。
- ⬜ **M6-3 音效**（4.10）：Kenney Sci-fi Sounds 與 Interface Sounds 挑五種：環境嗡鳴、按鍵、門開、電力恢復、NOVA blip。Phaser SoundManager 為唯一出口，React 透過 `sfx:play` 請 Phaser 播。
- **完成定義**：八張圖接上對應終端機與過場；五種音效可在設定靜音。

### M7 存檔、標題畫面與設定 ⬜

- ⬜ **M7-1 標題畫面**（4.7）：黑底、Kepler-9 像素標題、CRT 掃描線。「繼續」只在有存檔時出現，「新遊戲」有存檔要確認覆蓋。
- ⬜ **M7-2 選角**（4.7）：四個站立 sprite 放大顯示，方向鍵切換。
- ⬜ **M7-3 開場 boot log**（4.7）：終端機打字動畫跑喚醒程序，名單查詢卡在「查無此人」，NOVA 第一句話，淡入地圖。
- ⬜ **M7-4 暫停選單**（4.7）：地圖上 Esc 開啟，繼續、回標題、重玩本章。
- ⬜ **M7-5 設定選單**（4.7、4.10）：文字速度、關閉閃爍、關閉掃描線、音量、靜音。
- **完成定義**：關掉瀏覽器再開能從上次的終端機接續。

## 4. 待處理雜項

不屬於任何里程碑，但會影響接手的人，做完就勾掉。

- ⬜ **移除暫存的原圖追蹤**：Danny 在 2026-09-22 說「下次再將圖片移除」。等另一台電腦已經 clone 並確認拿到原圖後，執行下面指令並 commit，檔案會留在硬碟上，`.gitignore` 規則已經在：
  ```bash
  git rm --cached docs/assets-draft/*-original.png
  ```
  目前被追蹤的六張：`nova-core`、`nova-eye`、`technician-sheet`、`technician-c`、`technician-d`、`technician-e` 的 `-original.png`，合計約 8.7 MB。
- ⬜ **設計文件過時段落**：`game-design.md` 6.2 的標題「還沒找到的素材」已不準確，角色 sprite 已完成；第 8 節第 6 項寫「九張圖」，6.3 寫「約 13 張」，實際剩 8 張。下次改設計文件時一併整理。
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
- **Git 憑證**：這台 Mac 的 `gh` 與 HTTPS keychain 都是失效的其他帳號，push 用 SSH。抓公開 repo 資料用 `curl`，不要用 `gh api`。
- **Next.js 16 與 Phaser**：Phaser 會碰 `window`，只能在 client component 內用 `next/dynamic` 加 `ssr: false` 載入。寫 Next.js 相關程式前先讀 `node_modules/next/dist/docs/` 的對應章節，這版與訓練資料有差異。
- **版本限制**：TypeScript 停在 6.x、ESLint 停在 9.x，原因見 `CLAUDE.md`。
- **Vitest**：設定在 `vitest.config.mts`，只掃 `src/**/*.{test,spec}.{ts,tsx}`，環境 jsdom，`@/` 別名已設。純邏輯測試可在檔案頂端加 `// @vitest-environment node` 加速。測試共用的 fixture 檔不要用 `.test` 後綴（例如 `testFixtures.ts`），否則會被當測試跑。
- **Phaser 4 在 import 時就讀 `window`**：任何會被 SSR 的 React 元件都不能 import 到 Phaser，連 `Phaser.Events.EventEmitter` 也不行，所以 `EventBus.ts` 是自己寫的零相依 emitter。React 端只 import `@/game/phaser/EventBus`、`events`、`constants`，不要 import `@/game/phaser`（index 會帶進 main.ts 與場景）。Phaser 的單元測試在 node 與 jsdom 都跑不起來（jsdom 沒 canvas），所以 Phaser 類別只抽純函式測（`movement.ts`、`nearby.ts`、`RoomTracker.ts`、`mapObjects.ts`），視覺行為靠 e2e 與截圖。
- **Phaser 鍵盤的三個坑**：（1）`createCursorKeys()` 會連 SPACE、SHIFT 一起 capture，而且 capture 是整個 window 共用，終端機輸入框會打不出空白，所以 Player 用 `addKeys` 分開註冊、WASD 不 capture；（2）`JustDown` 靠 `Key.onUp` 會清掉的旗標，keydown 與 keyup 同一幀時（自動化測試的 `press`）會漏掉，要用 `key.on("down")` 事件；（3）`game.destroy()` 是排到下一個 step 才拆 canvas，React StrictMode 同步建立再立刻 destroy 會留下兩層 canvas，`PhaserGame` 改成 `requestAnimationFrame` 延後一幀建立。
- **地圖契約**：圖層與物件命名在 `src/game/phaser/constants.ts`，腳本 `scripts/build-map.mjs` 與 `Station.ts` 兩邊都照它；`map.test.ts` 會檢查 `deck1.json` 跟 `buildMap(DEFAULT_LAYOUT)` 一致，所以用 Tiled 手改地圖後要同步更新腳本或改測試。Tiled 1.9 以後的 `class` 欄位 Phaser 不讀，物件要用 `type`。警示條邊框是「地板的邊緣」放 `floor` 層可走，真正的牆是深色片放 `walls` 層。
- **store 的使用規則**：`@/game/store` 的 index 帶 React hook，只能在 client component import，純邏輯或 server component 用 `@/game/store/types`。**讀檔完成前不要呼叫任何 action**（每次 `set` 都會寫 localStorage，會把預設值蓋掉存檔），依賴存檔的畫面都要先等 `useStoreHydration()` 回 true。selector 不要回傳新組的物件，多欄位用 `useShallow`。
- **Terminal 元件的整合規則**：`shell` 必須是同一個實例（`useState` 保住），每次 render 都 `new Shell` 會重置 cwd 與歷史。`entries` 由父層持有並整批替換，`clear` 會傳空陣列。掛載當下就在 `entries` 裡的 dialogue 不重播打字動畫，要播的 NOVA 台詞得在掛載後才 push。Esc 有 `preventDefault` 沒有 `stopPropagation`，之後 Phaser 或暫停選單聽 Esc 時要在終端機開著時擋掉。
- **Vitest 與 CSS Module**：`postcss.config.mjs` 用字串宣告 `@tailwindcss/postcss`，Vite 解析不了，所以 `vitest.config.mts` 設了 `css.postcss: { plugins: [] }`，單元測試不跑 Tailwind。vitest 沒開 globals，Testing Library 不會自動 cleanup，元件測試要手動 `afterEach(cleanup)`。
- **字型尺寸**：VT323 的 x-height 偏小，終端機字級不要低於 20px；Fusion Pixel 用 12 的整數倍最清楚。Next dev 模式左下角有 Next.js 的圓形工具按鈕，會蓋住 `/play` 的設定列，正式 build 沒有。
- **Shell 引擎的已知邊界**（M1 刻意不做，之後章節需要再補）：
  - 快照的 key 不可含 `/`、空字串、`.`、`..`；目錄裡不要放名叫 `$type` 的子項，那是型別標記。
  - 路徑的 `..` 是純字串化簡，`wake_up.txt/..` 不會報 ENOTDIR；對檔案加結尾斜線會報 ENOTDIR。`~user` 不支援。
  - 解析器對整行掃全形字元，包括引號內；彎引號 `“”‘’` 也算全形（中文輸入法按 `"` 會打出來）。引號外的反斜線不當跳脫，`cat a\ b` 會切成兩個參數。
  - 補全只處理游標在結尾，用空白切 token 不走 tokenizer；`cd ..` 與 `cd ~` 不帶斜線按 Tab 沒有候選。
  - `ls -l` 的日期固定用 UTC 顯示，劇本寫 mtime 時要自己算好想給玩家看的時間。
  - `messages.notADirectory` 的文案偏向 `cd`，`ls wake_up.txt/inner` 這種路徑中間是檔案的情況語意稍偏，之後可讓它帶指令名。

## 6. 協作慣例

- **先討論再動工**：重大設計選項整理成表格與建議，用 AskUserQuestion 一次問三到四題。Danny 選「再討論」就繼續討論，不要急著寫程式。ASCII 圖解釋畫面配置對他很有效。
- **commit 規範**：Conventional Commit，主旨繁體中文，不加 AI 署名 footer，依性質拆分（docs、feat、chore、test 分開）。
- **程式風格**：註解與說明繁體中文台灣用語，命名英文，型別 PascalCase，變數與函式 camelCase，避免巢狀三元。
- **設計變更**：改 `game-design.md`，不在本檔重寫設計。進度變更改本檔。

## 7. 工作日誌

每次 session 收工加一筆，最新在最上面。格式：日期、做了什麼、commit 範圍、下一步。

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
