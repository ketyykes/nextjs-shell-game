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
```

## 專案架構

### 目錄結構

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API 路由 (目前為空)
│   ├── layout.tsx         # 根佈局 (含 Geist 字型設定)
│   ├── page.tsx           # 首頁
│   └── globals.css        # 全域樣式
├── components/
│   └── ui/                # shadcn/ui 元件
│       └── button.tsx     # 按鈕元件
└── lib/
    └── utils.ts           # 工具函式 (cn 函式)
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
5. **Tailwind CSS v4**: 注意此版本的 Tailwind 設定方式可能與 v3 不同
6. **動畫**: 使用 `motion` 套件，匯入路徑為 `motion/react`（例如 `import { motion } from "motion/react"`），動畫元件需搭配 `"use client"`
7. **圖示**: lucide-react 1.x 已移除所有品牌圖示（如 GitHub、Twitter），圖示預設帶有 `aria-hidden`

## 環境設定

- `.env.example`: 環境變數範本
- `.env.local`: 本地環境變數 (已在 .gitignore 中)
