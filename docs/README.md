# 文件地圖

## 開新 session 先讀什麼

依序讀 [`../CLAUDE.md`](../CLAUDE.md)（指令、架構、慣例）→ [`game-design.md`](./game-design.md)（設計定案）→ [`progress.md`](./progress.md)（第 0 節是開工檢查清單）→ [`notes/pitfalls.md`](./notes/pitfalls.md)（動手前先看有沒有人踩過）。

## 檔案一覽

| 檔案 | 用途 | 什麼時候改 |
|---|---|---|
| [`game-design.md`](./game-design.md) | 設計定案：目標、決策紀錄、技術架構、遊戲設計、畫面、素材流程、甲板地圖配置 | 設計有變更時 |
| [`progress.md`](./progress.md) | 開工清單、現況快照、里程碑總覽、待處理雜項、協作慣例、候選工作 | 每次收工 |
| [`notes/decisions.md`](./notes/decisions.md) | 自主執行時拍板的取捨（待 Danny 確認），每條附推翻時要改的地方 | 自己拍板一件事時，接著編號加一列 |
| [`notes/pitfalls.md`](./notes/pitfalls.md) | 已知陷阱與環境備註 | 踩到新坑、或舊坑已經不存在時 |
| [`notes/worklog.md`](./notes/worklog.md) | 每一場的工作日誌 | 每次收工加一筆 |
| [`cheatsheet.html`](./cheatsheet.html) | 開發者用過關密技：六章正解、跳章存檔程式、演出鉤子 | 劇本正解或存檔格式變了時 |
| [`archive/audit-2026-10-08.md`](./archive/audit-2026-10-08.md) | 第十三場優化審計，M10 到 M14 的證據 | 不改（封存） |
| [`archive/progress-milestones-m0-m15.md`](./archive/progress-milestones-m0-m15.md) | M0 到 M15 的任務清單與實作紀錄 | 不改（封存） |
| [`archive/game-design-initial-plan.md`](./archive/game-design-initial-plan.md) | 初版目錄規劃、第一版範圍與工作順序、當時尚未定案的項目 | 不改（封存） |
| [`screenshots/`](./screenshots/) | 根目錄 README 用的遊戲截圖 | 畫面大改、截圖過時時 |
| [`assets-draft/`](./assets-draft/) | 素材原圖、預覽與產圖腳本（`*-original.png` 不進版控） | 重新產圖或切圖時；`.gitignore` 與腳本都綁這個路徑，不要搬 |

## 維護規則

- 設計變更改 `game-design.md`；進度改 `progress.md`。
- 踩到的坑加進 `notes/pitfalls.md`；自主拍板的取捨接著編號記進 `notes/decisions.md`；日誌記在 `notes/worklog.md`。
- 整段過時的內容搬進 `archive/`（逐字搬，檔頭寫封存原因與現況看哪裡），並更新這份地圖與 `archive/README.md`。
