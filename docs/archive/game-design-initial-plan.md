# 設計文件的初版規劃（已封存）

> 原 docs/game-design.md 第 7、8、10 節，2026-10-16 封存。第 7 節目錄規劃是 2026-09-22 的預定結構，現況以 CLAUDE.md 的目錄樹為準；第 8 節的七步在 2026-10-01 全部完成（progress.md 的 M1 到 M7），之後擴到六章並做了 M8 到 M15；第 10 節列的三項都已定案（sprite 見 6.2、存檔見 4.7、音效見 4.10），還在等 Danny 確認的自主決策在 notes/decisions.md。

## 7. 目錄規劃

```
src/
├── app/
│   ├── play/page.tsx          # 遊戲頁面，dynamic import PhaserGame
│   └── sandbox/page.tsx       # 練習模式（4.11），只有終端機
├── components/
│   ├── terminal/              # Terminal、OutputBlock、DialogueBlock、PromptInput
│   ├── game/                  # PhaserGame、ObjectivePanel、NovaDialogue、CommandCheatSheet
│   └── ui/                    # shadcn 元件
├── game/
│   ├── phaser/
│   │   ├── main.ts            # Phaser 設定與 StartGame
│   │   ├── EventBus.ts        # 事件橋接
│   │   ├── events.ts          # 事件名稱與 payload 型別
│   │   └── scenes/            # Boot、Preloader、Station
│   ├── shell/
│   │   ├── fs/                # 虛擬檔案系統
│   │   ├── parser/            # 指令解析、管線、重導向
│   │   ├── commands/          # 每個指令一個檔案
│   │   └── shell.ts           # 執行入口
│   ├── story/
│   │   ├── schema.ts          # zod schema
│   │   ├── flags.ts           # 劇情旗標
│   │   └── objectives.ts      # 目標判定
│   ├── chapters/
│   │   └── ch1-life-support.ts
│   ├── sandbox/               # 練習模式的檔案系統與 shell session
│   └── store/                 # zustand store 與 persist
public/
├── tiles/                     # tileset
├── sprites/                   # 角色
├── scenes/                    # codex 產的插圖
└── maps/                      # 地圖資料
docs/
└── game-design.md             # 本文件
```

## 8. 第一版範圍與工作順序

第一版只做第一章，順序如下，每一步都要能跑、能測。

1. **Shell 引擎與單元測試**：pwd、ls、ls -a、ls -l、cd、cat、hint、help，路徑解析、Tab 補全、歷史。
2. **終端機 UI 與 store**：先不接 Phaser 與劇情，能在頁面上打指令看結果。
3. **Phaser 地圖與角色**：載入 tileset、畫第一章地圖、角色走動與碰撞、走近終端機提示。
4. **事件橋接**：按 E 開終端機、Esc 關、過關後地圖演出。
5. **第一章劇本**：六台終端機的檔案系統、NOVA 台詞、目標判定、三段式提示。
6. **圖片**：codex 產八張場景圖並接上（艙區插圖卡、開場與結尾過場）。
7. **存檔與標題畫面**：localStorage、繼續遊戲、重新開始。

## 10. 尚未定案

| 項目 | 狀態 |
|---|---|
| 角色 sprite | 已定案，A、C、D、E 四版正式檔在 `public/sprites/`，見 6.2 |
| 存檔細節 | 已定案，見 4.7 |
| 音效與音樂 | 已定案，見 4.10 |
