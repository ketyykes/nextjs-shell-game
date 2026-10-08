/**
 * Preloader 載完之後判斷素材有沒有缺（M12-6）。抽成純函式，因為 Phaser 在 node 與 jsdom 都跑不起來。
 *
 * 兩個來源：
 * - loader 的 `loaderror`：網路層失敗（404、離線），每個檔案發一次，音效也算。
 * - 關鍵素材（tileset、地圖、角色 sprite）是否真的進了 cache：JSON 解析失敗、圖片解碼失敗這類「下載成功但處理失敗」
 *   loader 不會發 `loaderror`，只能載完再查。少了任何一個 Station 建地圖或角色時就會在 Phaser 迴圈裡丟例外。
 *
 * 音效只看 `loaderror`：解碼失敗（例如某些 headless 瀏覽器）由 AudioManager 安靜略過，不打擾玩家。
 */

/** 經 EventBus 交給 React 的內容，跟 `events.ts` 的 `assets:error` payload 一致。 */
export interface AssetLoadFailure {
	/** 載不到的檔案網址，關鍵素材在前，不重複。 */
	files: string[];
	/** true 代表關鍵素材缺了，遊戲沒辦法開始（Station 不會啟動）；false 只是音效沒聲音，遊戲照常。 */
	fatal: boolean;
}

/**
 * @param loadErrors loader 發過 `loaderror` 的檔案
 * @param critical 關鍵素材與它有沒有進 cache
 * @returns 沒有任何問題時回傳 null
 */
export function summarizeAssetFailure(
	loadErrors: ReadonlyArray<{ url: string }>,
	critical: ReadonlyArray<{ url: string; loaded: boolean }>,
): AssetLoadFailure | null {
	const files = new Set<string>();
	let fatal = false;

	for (const asset of critical) {
		if (!asset.loaded) {
			files.add(asset.url);
			fatal = true;
		}
	}
	for (const failure of loadErrors) {
		files.add(failure.url);
	}

	if (files.size === 0) {
		return null;
	}
	return { files: [...files], fatal };
}
