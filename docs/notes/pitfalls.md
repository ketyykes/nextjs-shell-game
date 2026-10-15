# 已知陷阱與環境備註

> 原 `docs/progress.md` 第 5 節，2026-10-16 拆出。新坑直接加在這裡。

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
