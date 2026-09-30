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

# 重切角色 sprite sheet (原圖在 docs/assets-draft/，輸出到 public/sprites/)
pnpm sprites:slice                # 處理腳本 SHEETS 清單全部
pnpm sprites:slice technician-d   # 只處理指定角色
```

## 測試

- **Vitest** (`vitest.config.mts`)：環境 jsdom，`@/` 別名已對應 `src/`，只掃 `src/**/*.{test,spec}.{ts,tsx}`，所以 `e2e/` 不會被撿到。純邏輯測試（例如 shell 引擎）在檔案頂端加 `// @vitest-environment node` 可省掉 jsdom 開銷。
- **Playwright** (`playwright.config.ts`)：測試放 `e2e/`，只跑 chromium，`baseURL` 是 `http://localhost:3000`，報告用 html reporter。

## 專案架構

### 目錄結構

目前 `src/` 仍是模板骨架，遊戲程式碼尚未開工；遊戲程式的預定目錄結構（`src/game/`、`src/components/terminal/` 等）見 [`docs/game-design.md`](./docs/game-design.md) 第 7 節，這裡只列現況。

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # 根佈局 (含 Geist 字型設定)
│   ├── page.tsx           # 首頁
│   ├── page.test.tsx      # 首頁的 Vitest 測試
│   └── globals.css        # 全域樣式 (Tailwind v4 的 @theme 在這裡)
├── components/
│   └── ui/                # shadcn/ui 元件
│       ├── button.tsx
│       └── shimmer-button.tsx
└── lib/
    └── utils.ts           # 工具函式 (cn 函式)
e2e/                        # Playwright 測試
scripts/slice-sprites.mjs   # sprite sheet 切格腳本 (pnpm sprites:slice)
public/sprites/             # 四位角色的 32x48 sprite sheet (128x192，4x4 格)
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
8. **Phaser**: 會碰 `window`，只能在 client component 內用 `next/dynamic` 加 `ssr: false` 載入；用 `useLayoutEffect` 建立、卸載時 `game.destroy(true)`，並防 StrictMode 重複建立。官方 `phaserjs/template-nextjs` 是 Pages Router，不能照抄

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
