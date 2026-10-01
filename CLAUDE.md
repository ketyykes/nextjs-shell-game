# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

這是一個使用 Next.js 16 (App Router)、React 19、TypeScript 與 shadcn/ui 元件庫的現代化模板專案。

## 技術堆疊

- **Framework**: Next.js 16.3.5 (App Router，預設使用 Turbopack)
- **React**: 19.3.0 (React Server Components)
- **TypeScript**: 6.x，嚴格模式啟用（暫不升級到 7，原因見「版本限制」）
- **樣式**: Tailwind CSS v4 + tw-animate-css
- **UI 元件**: shadcn/ui (New York style)
- **圖示**: lucide-react 1.x
- **表單**: react-hook-form + zod + @hookform/resolvers
- **資料取得**: SWR
- **動畫**: motion（從 `motion/react` 匯入，不要再使用 `framer-motion`）
- **Lint**: ESLint 9.x + eslint-config-next 平面設定（暫不升級到 10，原因見「版本限制」）
- **套件管理器**: pnpm

## 開發指令

```bash
# 開發模式 (Next.js 16 預設使用 Turbopack，不需加 --turbopack)
pnpm dev

# 建置專案
pnpm build

# 啟動正式環境伺服器
pnpm start

# 執行 ESLint 檢查 (實際執行 eslint .，Next.js 16 已移除 next lint)
pnpm lint

# 單元測試 (Vitest，預設 watch 模式；一次性執行用 pnpm test --run)
pnpm test

# e2e 測試 (Playwright，會自動啟動 pnpm dev；本機已有 :3000 就直接沿用)
pnpm test:e2e
# 3000 被別的專案佔住、遊戲 dev server 在 3001 時改指埠 (next dev 與 Playwright 吃同一個 PORT)
PORT=3001 pnpm test:e2e

# 重切角色 sprite sheet (原圖在 docs/assets-draft/，輸出到 public/sprites/)
pnpm sprites:slice                # 處理腳本 SHEETS 清單全部
pnpm sprites:slice technician-d   # 只處理指定角色

# 重新產生六張甲板地圖 deck1 到 deck6 (改 scripts/build-map.mjs 的 buildDeckLayout 後跑；deck1 必須維持不變)
pnpm map:build

# 把 codex 產的場景原圖縮成 640x360 (public/scenes) 與 256x144 預覽 (docs/assets-draft/scenes)
node scripts/resize-scenes.mjs
```

## 測試

- **Vitest** (`vitest.config.mts`)：環境 jsdom，`@/` 別名已對應 `src/`，只掃 `src/**/*.{test,spec}.{ts,tsx}`，所以 `e2e/` 不會被撿到。純邏輯測試（例如 shell 引擎）在檔案頂端加 `// @vitest-environment node` 可省掉 jsdom 開銷。
- **Playwright** (`playwright.config.ts`)：測試放 `e2e/`，只跑 chromium，`baseURL` 是 `http://localhost:${PORT ?? 3000}`，報告用 html reporter。`happy-path.spec.ts` 從標題一路解完第一章再進第二章（約 80 秒），`chapters.spec.ts` 用 `seedSave` 直接種「已到第 N 章」的存檔逐章走完；走路與解謎的共用工具在 `e2e/helpers/deck.ts`，六個甲板平面圖相同所以路線共用。地圖上走路用「貼牆滑行」而不是純計時，原因與坑見 `docs/progress.md` 第 5 節。

### TDD 流程

新功能與修 bug 一律先寫測試，走紅 → 綠 → 重構：

1. **紅**：先寫一個描述預期行為的測試，執行 `pnpm test --run <檔案路徑>`，確認它**因為正確的理由失敗**（斷言不符，而非 import 錯誤或拼字錯誤）。沒看到紅燈不准寫實作。
2. **綠**：只寫讓這個測試通過的最少程式碼，不順手加沒有測試覆蓋的功能。
3. **重構**：測試保持綠燈的前提下整理命名、抽共用邏輯；重構期間不改測試的斷言。
4. 一次只推進一個行為，循環到功能完成；收尾前跑 `pnpm test --run` 全部與 `pnpm lint`。

細則：

- **修 bug**：先寫一個能重現 bug 的失敗測試，再修。測試名稱描述正確行為，不寫「fix bug」。
- **測試位置**：與被測檔案同目錄同名，`foo.ts` → `foo.test.ts`、`Foo.tsx` → `Foo.test.tsx`。
- **測什麼**：測公開行為（輸入 → 輸出、使用者看到的畫面），不測私有實作細節；元件測試用 Testing Library 依角色與文字查詢。
- **層級選擇**：純邏輯（shell 引擎、story、store）用 Vitest + node 環境；React 元件用 Vitest + jsdom；跨 Phaser 與終端機的整條流程才寫 Playwright e2e。
- **不准為了變綠而改測試**：測試失敗時先判斷是實作錯還是需求變了；需求變了要說明理由再改測試。
- **commit 拆分**：測試與實作可同一個 `feat`/`fix` commit；只補測試時用 `test` commit。

## 專案架構

### 目錄結構

遊戲程式的完整預定目錄結構（`src/components/terminal/`、`src/game/phaser/` 等）見 [`docs/game-design.md`](./docs/game-design.md) 第 7 節，這裡只列現況。

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # 根佈局 (掛三種像素字型的 CSS 變數，lang zh-Hant)
│   ├── fonts.ts           # next/font 定義：VT323、Press Start 2P、Fusion Pixel
│   ├── fonts/             # Fusion Pixel woff2 與授權
│   ├── page.tsx           # 標題畫面，只渲染 TitleFlow
│   ├── play/page.tsx      # 遊戲頁面，只渲染 PlayScreen
│   └── globals.css        # 全域樣式 (Tailwind v4 的 @theme、--game-* 配色、font-terminal/font-title)
├── components/
│   ├── ui/                # shadcn/ui 元件
│   ├── terminal/          # Terminal 元件群：外框、輸出區、NOVA 對話、輸入列、鍵盤 hook
│   ├── title/             # TitleFlow (標題→選角→boot log→插圖卡→/play)、SettingsMenu、選單導覽 hook
│   └── game/              # PlayScreen (地圖、終端機彈窗、HUD、NOVA、暫停、章節結束)、PhaserGame(Dynamic)、CRT 等
├── game/
│   ├── phaser/            # Phaser 4：events.ts 與 constants.ts 是契約，EventBus 零相依，scenes/ 與 objects/
│   ├── store/             # zustand store 與 localStorage 存檔；types.ts 是存檔格式契約
│   ├── story/             # 劇本契約：types.ts、zod schema、目標判定組合函式、劇情旗標
│   ├── chapters/          # 六章劇本 (ch1-life-support.ts … ch6-nova-core.ts)，index.ts 是註冊表，ending.ts 是片尾，載入時 validateChapter
│   └── shell/             # Shell 引擎，純 TypeScript，零 React/Phaser 相依
│       ├── types.ts       # 所有 shell 模組的共用契約，改介面先改這裡
│       ├── shell.ts       # 執行入口 Shell 類別 (execute、complete、toState)
│       ├── messages.ts    # 所有繁中錯誤訊息集中於此，指令不得自己寫錯誤字串
│       ├── completion.ts  # Tab 補全
│       ├── history.ts     # 指令歷史 (上下鍵)
│       ├── fs/            # 虛擬檔案系統、路徑解析、快照建樹、序列化
│       ├── parser/        # tokenizer、全形偵測、忘記空格建議
│       └── commands/      # 每個指令一個檔案，index.ts 是註冊表，docs.ts 是 man 說明資料
└── lib/
    └── utils.ts           # 工具函式 (cn 函式)
e2e/                        # Playwright 測試 (home、play、happy-path 第一章、chapters 第二到六章)，helpers/deck.ts 是走路工具
scripts/slice-sprites.mjs   # sprite sheet 切格腳本 (pnpm sprites:slice)
scripts/build-map.mjs       # 六張甲板地圖產生腳本，輸出 Tiled JSON (pnpm map:build)
scripts/resize-scenes.mjs   # 場景原圖縮圖腳本
public/sprites/             # 四位角色的 32x48 sprite sheet (128x192，4x4 格)
public/tiles/               # Buch Sci-fi Interior tileset (448x192，14x6 格，32px)
public/maps/deck{1..6}.json # 六章地圖 (40x24 格、同一張平面圖、艙區名不同)，由 build-map.mjs 產生，可用 Tiled 開啟
public/scenes/              # NOVA 立繪 (256px) 與各章場景插圖 (640x360)，原圖在 docs/assets-draft/scenes/ 不進版控
public/audio/               # 五種 CC0 音效 (Kenney)，ogg 與 mp3
docs/assets-draft/scenes/generate.sh  # 第一章八張插圖的 codex 批次產圖腳本 (M6-1)；generate-ch2-6.sh 是第二到六章的
docs/
├── game-design.md          # 設計定案 (第 7 節是遊戲程式的預定目錄結構)
├── progress.md             # 進度、下一步、已知陷阱
└── assets-draft/           # 素材原圖與預覽 (*-original.png 原則上不進版控)
```

### 重要設定

1. **路徑別名**: `@/*` 對應到 `./src/*`
2. **shadcn/ui 設定** (components.json):
   - Style: new-york
   - Base Color: slate
   - CSS Variables: 啟用
   - 元件別名：`@/components`, `@/components/ui`, `@/lib`

3. **TypeScript**:
   - Target: ES2017
   - JSX: react-jsx（Next.js 16 強制設定）
   - 嚴格模式啟用
   - 支援 Next.js plugin

4. **ESLint** (eslint.config.mjs):
   - 直接匯入 `eslint-config-next/core-web-vitals` 與 `eslint-config-next/typescript`
   - 不使用 `@eslint/eslintrc` 的 FlatCompat

## 版本限制

執行 `pnpm outdated` 時，以下兩項會顯示有新版，但目前**不要**直接升級：

- **TypeScript 停在 6.x**：`typescript@7` 不再提供 JavaScript 編譯器 API，`typescript-eslint` 偵測到 TS 7 會直接拋錯，導致 `eslint-config-next/typescript` 無法運作。待 typescript-eslint 支援 TS 7.1+ 後再升。
- **ESLint 停在 9.x**：`eslint-plugin-react` 尚無支援 ESLint 10 的版本，而 `eslint-config-next` 依賴它，ESLint 10 會在載入規則時崩潰。待 eslint-plugin-react 與 eslint-config-next 跟上後再升。
- pnpm 安裝時對 eslint 9.x 顯示 deprecated 警告屬預期現象。

## 新增 shadcn/ui 元件

使用 shadcn/ui CLI 新增元件：

```bash
npx shadcn@latest add [component-name]
```

元件會自動安裝到 `src/components/ui/` 目錄。

## 開發注意事項

1. **App Router 優先**: 此專案使用 Next.js 16 的 App Router，所有頁面和佈局應放在 `src/app/` 目錄
2. **React Server Components**: 預設所有元件都是伺服器元件，需要客戶端互動時使用 `"use client"` 指令
3. **樣式工具**: 使用 `cn()` 函式 (來自 `@/lib/utils`) 合併 Tailwind CSS 類別名稱
4. **表單驗證**: 使用 react-hook-form + zod 進行型別安全的表單驗證
5. **Tailwind CSS v4**: 沒有 `tailwind.config.js`；設定寫在 `src/app/globals.css` 的 `@import "tailwindcss"` 與 `@theme inline` 區塊，PostCSS 只掛 `@tailwindcss/postcss`
6. **動畫**: 使用 `motion` 套件，匯入路徑為 `motion/react`（例如 `import { motion } from "motion/react"`），動畫元件需搭配 `"use client"`
7. **圖示**: lucide-react 1.x 已移除所有品牌圖示（如 GitHub、Twitter），圖示預設帶有 `aria-hidden`
8. **除錯鉤子**: 開發模式下 `/play` 掛 `window.__kepler9.emit(事件名, payload)`，可在瀏覽器 console 直接發 EventBus 事件（例如 `puzzle:solved`）觸發演出，正式 build 不掛
9. **Phaser**: Phaser 4 在 import 當下就讀 `window`，所以只有 `src/game/phaser/main.ts` 與 `scenes/`、`objects/` 可以 import `phaser`，React 端只能 import `@/game/phaser/EventBus`、`events`、`constants`（都零相依）。遊戲透過 `PhaserGameDynamic`（`next/dynamic` + `ssr: false`）載入，`PhaserGame` 延後一幀 `startGame` 防 StrictMode 疊兩層 canvas。場景裡訂閱 EventBus 或建 sound 的清理要同時掛 `SHUTDOWN` 與 `DESTROY`（`game.destroy()` 只發後者）。官方 `phaserjs/template-nextjs` 是 Pages Router，不能照抄。更多坑見 `docs/progress.md` 第 5 節

## 協作慣例

- **commit**: Conventional Commit，主旨繁體中文，不加 AI 署名 footer，依性質拆分（docs、feat、chore、test 分開）。
- **codex plugin**: `.claude/settings.json` 已啟用 `codex@openai-codex`，產圖流程與 `-i` 參數陷阱見 `docs/progress.md` 第 5 節。
- **設計 vs 進度**: 設計變更改 `docs/game-design.md`，進度變更改 `docs/progress.md`，不在本檔重寫。

## 環境設定

- `.env.example`: 環境變數範本
- `.env.local`: 本地環境變數 (已在 .gitignore 中)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 遊戲設計文件

這個專案要做的是「shell 解謎遊戲」，方向、劇情、技術選型與待討論項目都記錄在 [`docs/game-design.md`](./docs/game-design.md)。動工前先讀它，設計有變更時直接改那份文件。

目前進度、下一步與已知陷阱記錄在 [`docs/progress.md`](./docs/progress.md)。開新 session 時先照它的第 0 節檢查清單走；每次收工要更新它的現況快照、任務勾選與工作日誌，並一起 commit。
