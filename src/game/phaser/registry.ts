/**
 * `game.registry` 的型別化契約：`startGame` 寫入、場景讀取（決策 #9、#25）。
 *
 * Phaser 的 registry 本身沒有型別（`get` 回 `any`），所以：
 * - 每個 key 的值型別寫在 `RegistryValues`，寫入端只能整包寫 `writeRegistryValues`，漏一個 key 編譯不過
 * - 讀取端一律走 `readRegistryValue`，執行期驗證集中在這個檔案的 `REGISTRY_PARSERS`，場景裡不再手寫驗證或 `as`
 *
 * 這個檔案不可以 import Phaser（只用 type import），讓 Vitest 在 node 環境直接測。
 * 新增一個選項：在 `RegistryValues`、`REGISTRY_KEYS`、`StartGameOptions`、`registryValuesFromOptions`、
 * `REGISTRY_PARSERS` 各加一行（前兩個與最後一個漏了會編譯失敗），再到場景用 `readRegistryValue` 讀；
 * React 端要傳值的話還要改 `PhaserGame.tsx` 的 props 與 ref 同步。
 */

import type { CharacterId } from "@/game/store/types";
import { CHAPTER_COUNT, type SolvedEffect } from "./events";

// ---------------------------------------------------------------------------
// 契約：key 與值型別
// ---------------------------------------------------------------------------

/** registry 裡每個 key 的值型別（已補上預設值、驗證過的樣子）。 */
export interface RegistryValues {
	/** 選角結果。Preloader 依它載入角色 sprite。 */
	character: CharacterId;
	/** 目前章節（1 到 `CHAPTER_COUNT`），Preloader 用它載入 `maps/deck{n}.json`。 */
	chapter: number;
	/** 開場是否斷電（只有角色周圍一圈光）。Station 建遮罩時讀。 */
	startDark: boolean;
	/** 終端機 id → 過關演出，Station 收到 `puzzle:solved` 或重整還原時查它決定演出。 */
	terminalEffects: Record<string, SolvedEffect>;
	/** 已過關的終端機 id（例如 `["ch1-t4"]`），Station 重整後不播動畫直接套最終狀態。 */
	solvedTerminals: string[];
	/** 音量，0 到 1。`AudioManager` 建構時讀，之後的變動走 `audio:settings` 事件。 */
	volume: number;
	/** 是否靜音。`AudioManager` 建構時讀。 */
	muted: boolean;
	/** 存檔裡的角色位置，null 就用地圖出生點。是否在地圖範圍內由 Station 載完地圖後判斷（`resolveSpawnPoint`）。 */
	spawnPoint: { x: number; y: number } | null;
	/** 設定的「閃爍」。Station 建立時讀，之後走 `effects:settings` 事件。 */
	flickerEnabled: boolean;
}

export type RegistryKey = keyof RegistryValues;

/** registry 的 key 字串，`main.ts` 與 `index.ts` 會 re-export。 */
export const REGISTRY_KEYS = {
	character: "character",
	chapter: "chapter",
	startDark: "startDark",
	terminalEffects: "terminalEffects",
	solvedTerminals: "solvedTerminals",
	volume: "volume",
	muted: "muted",
	spawnPoint: "spawnPoint",
	flickerEnabled: "flickerEnabled",
} as const satisfies { [K in RegistryKey]: K };

// ---------------------------------------------------------------------------
// 寫入端
// ---------------------------------------------------------------------------

/** `startGame` 的選項；選填的欄位由 `registryValuesFromOptions` 補預設值。 */
export interface StartGameOptions {
	character: CharacterId;
	/** 目前章節（1 到 6），Preloader 依它載入 `maps/deck{n}.json`。 */
	chapter: number;
	/** 開場是否斷電（只有角色周圍一圈光）。省略等同 false（全亮）。 */
	startDark?: boolean;
	/** 終端機 id → 過關演出，Station 收到 `puzzle:solved` 或重整還原時查表。省略等同空物件。 */
	terminalEffects?: Readonly<Record<string, SolvedEffect>>;
	/** 已過關的終端機 id，重整後還原地圖狀態用（燈全亮、門已開），不播演出。省略等同空陣列。 */
	solvedTerminals?: readonly string[];
	/** 音量，0 到 1。省略等同 1。 */
	volume?: number;
	/** 是否靜音。省略等同 false。 */
	muted?: boolean;
	/** 存檔裡這一章的角色位置，省略或 null 就從地圖出生點開始。 */
	spawnPoint?: { x: number; y: number } | null;
	/** 設定的「閃爍」，false 時人影改淡入淡出、鏡頭不震不閃、燈不閃。省略等同 true。 */
	flickerEnabled?: boolean;
}

/** 拷貝演出對照表（每個 effect 也複製一份），劇本物件之後被改動也不影響場景讀到的值。 */
function copyTerminalEffects(effects: Readonly<Record<string, SolvedEffect>>): Record<string, SolvedEffect> {
	const copy: Record<string, SolvedEffect> = {};
	for (const [terminalId, effect] of Object.entries(effects)) {
		copy[terminalId] = { ...effect };
	}
	return copy;
}

/** 補上預設值並拷貝陣列與物件，之後 store 或劇本被改動也不會影響場景讀到的值。 */
export function registryValuesFromOptions(options: StartGameOptions): RegistryValues {
	let spawnPoint: RegistryValues["spawnPoint"] = null;
	if (options.spawnPoint) {
		spawnPoint = { x: options.spawnPoint.x, y: options.spawnPoint.y };
	}

	return {
		character: options.character,
		chapter: options.chapter,
		startDark: options.startDark ?? false,
		terminalEffects: copyTerminalEffects(options.terminalEffects ?? {}),
		solvedTerminals: [...(options.solvedTerminals ?? [])],
		volume: options.volume ?? 1,
		muted: options.muted ?? false,
		spawnPoint,
		flickerEnabled: options.flickerEnabled ?? true,
	};
}

/**
 * registry 需要的最小介面。Phaser 的 `DataManager`（`game.registry`、場景的 `this.registry`）符合它，
 * 測試可以用 `Map` 包一層。
 */
export interface RegistryStore {
	get(key: string): unknown;
	set(key: string, value: unknown): unknown;
}

/**
 * 整包寫進 registry，`RegistryValues` 每個 key 都會寫到。
 * 直接用屬性名當 key：`REGISTRY_KEYS` 的 `satisfies` 保證每個 key 字串就是屬性名本身。
 */
export function writeRegistryValues(registry: RegistryStore, values: RegistryValues): void {
	for (const [key, value] of Object.entries(values)) {
		registry.set(key, value);
	}
}

// ---------------------------------------------------------------------------
// 讀取端：執行期驗證集中在這裡
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/** 每個角色 id 都要列一次，`CharacterId` 加了新值這裡會編譯失敗。 */
const CHARACTER_IDS: Record<CharacterId, true> = { a: true, c: true, d: true, e: true };

function isCharacterId(value: unknown): value is CharacterId {
	return typeof value === "string" && Object.hasOwn(CHARACTER_IDS, value);
}

/** 選角沒有合理的預設值，讀不到代表沒透過 `startGame` 啟動，直接丟錯。 */
export function parseCharacter(value: unknown): CharacterId {
	if (!isCharacterId(value)) {
		throw new Error(`[registry] character 不是合法的角色（${String(value)}），請透過 startGame 啟動遊戲`);
	}
	return value;
}

/** 不是 1 到 `CHAPTER_COUNT` 的整數就當第 1 章。 */
export function parseChapter(value: unknown): number {
	if (typeof value !== "number" || !Number.isInteger(value)) {
		return 1;
	}
	if (value < 1 || value > CHAPTER_COUNT) {
		return 1;
	}
	return value;
}

/** 單一演出的格式檢查，合法就回傳只含必要欄位的新物件，不合法回傳 null。 */
function parseSolvedEffect(value: unknown): SolvedEffect | null {
	if (!isPlainObject(value)) {
		return null;
	}
	switch (value.kind) {
		case "powerRestored":
			return { kind: "powerRestored" };
		case "shadowFlash":
			return { kind: "shadowFlash" };
		case "flicker":
			return { kind: "flicker" };
		case "blackout":
			return { kind: "blackout" };
		case "openDoor":
			if (typeof value.doorId !== "string" || value.doorId.length === 0) {
				return null;
			}
			return { kind: "openDoor", doorId: value.doorId };
		default:
			return null;
	}
}

/** 不是物件就當空表；格式不對的項目直接丟掉，其餘拷貝一份回傳。 */
export function parseTerminalEffects(value: unknown): Record<string, SolvedEffect> {
	const result: Record<string, SolvedEffect> = {};
	if (!isPlainObject(value)) {
		return result;
	}
	for (const [terminalId, raw] of Object.entries(value)) {
		const effect = parseSolvedEffect(raw);
		if (effect === null) {
			continue;
		}
		result[terminalId] = effect;
	}
	return result;
}

/** 不是陣列就當空陣列，非字串的項目丟掉。 */
export function parseSolvedTerminals(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((item): item is string => typeof item === "string");
}

/** x、y 都是有限數字才算存了位置，否則回 null（用地圖出生點）。 */
export function parseSpawnPoint(value: unknown): RegistryValues["spawnPoint"] {
	if (!isPlainObject(value)) {
		return null;
	}
	const { x, y } = value;
	if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
		return null;
	}
	return { x, y };
}

/** 每個 key 的驗證：壞值退回預設，不讓場景拿到型別不對的東西。 */
const REGISTRY_PARSERS: { [K in RegistryKey]: (value: unknown) => RegistryValues[K] } = {
	character: parseCharacter,
	chapter: parseChapter,
	// 只有明確的 true 才摸黑
	startDark: (value) => value === true,
	terminalEffects: parseTerminalEffects,
	solvedTerminals: parseSolvedTerminals,
	volume: (value) => (isFiniteNumber(value) ? value : 1),
	muted: (value) => value === true,
	spawnPoint: parseSpawnPoint,
	// 只有明確的 false 才關（壞值一律維持預設的開啟）
	flickerEnabled: (value) => value !== false,
};

/** 讀一個 key 並驗證，型別由 key 決定。 */
export function readRegistryValue<K extends RegistryKey>(registry: RegistryStore, key: K): RegistryValues[K] {
	const parse: (value: unknown) => RegistryValues[K] = REGISTRY_PARSERS[key];
	return parse(registry.get(REGISTRY_KEYS[key]));
}
