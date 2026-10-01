/**
 * Phaser 模組的公開出口。
 *
 * 注意：這裡會連帶 import `main.ts` 與 Phaser 本體。React 端若只需要事件，
 * 直接 import `@/game/phaser/EventBus` 與 `@/game/phaser/events` 即可，不必經過這裡。
 */

export { startGame, SCENE_KEYS, REGISTRY_KEYS } from "./main";
export type { StartGameOptions, SceneKey } from "./main";
export { EventBus, emitGameEvent, onGameEvent, onceGameEvent, offGameEvent } from "./EventBus";
export type { GameEventHandler } from "./EventBus";
export * from "./events";
export * from "./constants";
