/**
 * 背景預載的共用小工具：排進主執行緒的閒置時段、同一份資源只載一次、圖片排隊一次載一張。
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

export interface ImagePreloader {
	/** 把圖排進佇列；已載過或排隊中的會略過。 */
	preload: (urls: readonly string[]) => void;
}

/**
 * 背景預載圖片的佇列：依清單順序一次只下載一張、低優先、非同步解碼，不跟主要資源搶連線與頻寬。
 *
 * 載過的 Image 物件留在 `started` 裡不放掉，瀏覽器的記憶體快取才不會被回收，
 * 之後同一個網址的 `<img>` 直接拿快取顯示，不用再發請求（public 檔案是 max-age=0，走 HTTP 快取還要重新驗證）。
 */
export function createImagePreloader(createImage: () => HTMLImageElement = () => new Image()): ImagePreloader {
	const started = new Map<string, HTMLImageElement>();
	const queue: string[] = [];
	let loading = false;

	function loadNext() {
		const url = queue.shift();
		if (url === undefined) {
			loading = false;
			return;
		}
		loading = true;
		const image = createImage();
		image.fetchPriority = "low";
		image.decoding = "async";
		image.onload = loadNext;
		// 失敗也換下一張；真正顯示時 <img> 會自己再試
		image.onerror = loadNext;
		started.set(url, image);
		image.src = url;
	}

	return {
		preload(urls) {
			for (const url of urls) {
				if (!started.has(url) && !queue.includes(url)) {
					queue.push(url);
				}
			}
			if (!loading) {
				loadNext();
			}
		},
	};
}

let sharedImagePreloader: ImagePreloader | null = null;

/** 全站共用一條預載佇列：標題流程排過的圖，進 `/play` 再排會略過。只在瀏覽器端呼叫。 */
export function preloadImages(urls: readonly string[]): void {
	if (sharedImagePreloader === null) {
		sharedImagePreloader = createImagePreloader();
	}
	sharedImagePreloader.preload(urls);
}
