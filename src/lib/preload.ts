/**
 * 背景預載的共用小工具：排進主執行緒的閒置時段、同一份資源只載一次。
 * 只在瀏覽器端（effect 或事件裡）呼叫，不在 render 期間呼叫。
 */

export interface ScheduleIdleOptions {
	/** 先等這麼久再開始排閒置時段，例如讓開場動畫先跑完。預設 0。 */
	delayMs?: number;
	/** 閒置時段遲遲不來時最多等多久就硬跑（requestIdleCallback 的 timeout）。預設 2000。 */
	timeoutMs?: number;
}

const DEFAULT_IDLE_TIMEOUT_MS = 2000;
/** 沒有 requestIdleCallback（Safari）時用 setTimeout 代替的延遲。 */
const FALLBACK_IDLE_DELAY_MS = 200;

/**
 * 把工作排進主執行緒的閒置時段，回傳取消函式（卸載時呼叫）。
 * Safari 沒有 requestIdleCallback，退回 setTimeout。
 */
export function scheduleIdle(task: () => void, options: ScheduleIdleOptions = {}): () => void {
	const { delayMs = 0, timeoutMs = DEFAULT_IDLE_TIMEOUT_MS } = options;
	let delayTimer: ReturnType<typeof setTimeout> | null = null;
	let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
	let idleHandle: number | null = null;

	function requestIdle() {
		delayTimer = null;
		if (typeof window.requestIdleCallback === "function") {
			idleHandle = window.requestIdleCallback(task, { timeout: timeoutMs });
			return;
		}
		fallbackTimer = setTimeout(task, FALLBACK_IDLE_DELAY_MS);
	}

	if (delayMs > 0) {
		delayTimer = setTimeout(requestIdle, delayMs);
	} else {
		requestIdle();
	}

	return () => {
		if (delayTimer !== null) {
			clearTimeout(delayTimer);
		}
		if (fallbackTimer !== null) {
			clearTimeout(fallbackTimer);
		}
		if (idleHandle !== null && typeof window.cancelIdleCallback === "function") {
			window.cancelIdleCallback(idleHandle);
		}
	};
}

/**
 * 把載入函式包成「只載一次」：載入中或成功後重複呼叫都回傳同一個 Promise。
 * 預載是錦上添花，失敗（例如斷線）不丟出例外，下次呼叫會重試；真正用到時的載入會自己報錯。
 */
export function preloadOnce(load: () => Promise<unknown>): () => Promise<void> {
	let pending: Promise<void> | null = null;
	return () => {
		if (pending === null) {
			pending = load().then(
				() => undefined,
				() => {
					pending = null;
				},
			);
		}
		return pending;
	};
}
