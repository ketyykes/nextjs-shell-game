/**
 * 預先下載並評估 PhaserGame 模組（連同約 1.4MB 的 Phaser 引擎 chunk），審計 A1。
 *
 * 跟 `PhaserGameDynamic` 的 `import("./PhaserGame")` 是同一個 chunk、同一份模組，
 * 預載過的話進 `/play` 時 next/dynamic 直接拿到快取，不用再等下載與評估。
 * Phaser 在 import 當下就讀 window，所以只能在瀏覽器端（effect 裡）呼叫；這裡是動態 import，
 * 不會進標題頁的同步 bundle，也不會在 SSR 執行。
 */

import { preloadOnce } from "@/lib/preload";

export const preloadPhaserGame = preloadOnce(() => import("./PhaserGame"));
