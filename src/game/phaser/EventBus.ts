/**
 * Phaser 與 React 共用的事件匯流排（設計文件 3.1）。
 *
 * 兩邊都透過這裡的型別化函式收發 `events.ts` 定義的事件，名稱或 payload 打錯會在編譯期報錯。
 *
 * 刻意**不依賴 Phaser**：Phaser 4 在 import 當下就會讀 `window`，
 * 任何會被伺服器端渲染的 React 元件（例如 HUD）只要 import 到 Phaser 就會讓 SSR 掛掉。
 * 所以這裡自己寫一個最小的 emitter，語意跟 eventemitter3 的 on / once / off / emit 一樣。
 */

import type { GameEventMap, GameEventName } from "./events";

/** 事件處理函式的型別，payload 依事件名稱推導。 */
export type GameEventHandler<K extends GameEventName> = (payload: GameEventMap[K]) => void;

interface Listener {
	handler: (payload: unknown) => void;
	once: boolean;
}

/** 最小的型別化事件 emitter，只給 EventBus 用。 */
class GameEventEmitter {
	private readonly listeners = new Map<GameEventName, Listener[]>();

	on<K extends GameEventName>(name: K, handler: GameEventHandler<K>, once = false): void {
		const list = this.listeners.get(name) ?? [];
		list.push({ handler: handler as (payload: unknown) => void, once });
		this.listeners.set(name, list);
	}

	off<K extends GameEventName>(name: K, handler: GameEventHandler<K>): void {
		const list = this.listeners.get(name);
		if (list === undefined) {
			return;
		}
		const remaining = list.filter((listener) => listener.handler !== handler);
		if (remaining.length === 0) {
			this.listeners.delete(name);
		} else {
			this.listeners.set(name, remaining);
		}
	}

	emit<K extends GameEventName>(name: K, payload: GameEventMap[K]): void {
		const list = this.listeners.get(name);
		if (list === undefined) {
			return;
		}
		// 先拷貝再呼叫，handler 內 off 或 once 自動移除時不會跳過下一個 listener
		for (const listener of [...list]) {
			if (listener.once) {
				this.off(name, listener.handler as GameEventHandler<K>);
			}
			listener.handler(payload);
		}
	}

	removeAllListeners(): void {
		this.listeners.clear();
	}

	listenerCount(name: GameEventName): number {
		return this.listeners.get(name)?.length ?? 0;
	}
}

/**
 * 全域唯一的事件匯流排。
 *
 * 一般程式請用下面的型別化函式；直接碰 `EventBus` 只在測試清理時需要（`removeAllListeners`）。
 */
export const EventBus = new GameEventEmitter();

/** 發出事件。 */
export function emitGameEvent<K extends GameEventName>(name: K, payload: GameEventMap[K]): void {
	EventBus.emit(name, payload);
}

/**
 * 訂閱事件，回傳取消訂閱函式。
 *
 * React 端可以直接把回傳值當 `useEffect` 的 cleanup：
 * `useEffect(() => onGameEvent("room:enter", handleEnter), [handleEnter]);`
 */
export function onGameEvent<K extends GameEventName>(name: K, handler: GameEventHandler<K>): () => void {
	EventBus.on(name, handler);
	return () => {
		EventBus.off(name, handler);
	};
}

/** 只收一次的訂閱，回傳的函式可以在觸發前取消。 */
export function onceGameEvent<K extends GameEventName>(name: K, handler: GameEventHandler<K>): () => void {
	EventBus.on(name, handler, true);
	return () => {
		EventBus.off(name, handler);
	};
}

/** 取消訂閱，handler 必須是當初傳給 `onGameEvent` 或 `onceGameEvent` 的同一個函式。 */
export function offGameEvent<K extends GameEventName>(name: K, handler: GameEventHandler<K>): void {
	EventBus.off(name, handler);
}
