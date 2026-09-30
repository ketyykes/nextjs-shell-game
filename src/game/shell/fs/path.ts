/**
 * 虛擬檔案系統的路徑工具。
 *
 * 全部都是純字串運算，不檢查路徑是否存在；
 * `..` 採「字面」處理（直接刪掉前一段），不會先確認前一段是不是目錄。
 */

/** 根目錄路徑。 */
export const ROOT_PATH = "/";

/**
 * 把絕對路徑正規化：處理 `.`、`..`、多餘斜線與結尾斜線。
 * `..` 超過根目錄時停在 `/`。
 * 若傳入的字串不是 `/` 開頭，視為從根目錄開始。
 *
 * @example normalizePath("//a///b/./c/../") // "/a/b"
 */
export function normalizePath(absolute: string): string {
	const segments: string[] = [];

	for (const part of absolute.split("/")) {
		if (part === "" || part === ".") {
			continue;
		}

		if (part === "..") {
			// 已經在根目錄時 pop 空陣列不會出錯，自然停在 `/`
			segments.pop();
			continue;
		}

		segments.push(part);
	}

	return ROOT_PATH + segments.join("/");
}

/**
 * 把路徑切成每一段名稱，會先正規化。根目錄回傳空陣列。
 *
 * @example splitPath("/home/tech/") // ["home", "tech"]
 */
export function splitPath(path: string): string[] {
	const normalized = normalizePath(path);

	if (normalized === ROOT_PATH) {
		return [];
	}

	return normalized.slice(1).split("/");
}

/**
 * 把多段路徑接起來並正規化。
 *
 * @example joinPath("/home", "tech", "../abin") // "/home/abin"
 */
export function joinPath(...parts: string[]): string {
	return normalizePath(parts.join("/"));
}

/**
 * 取得上層目錄路徑，會先正規化。根目錄的上層仍是根目錄。
 *
 * @example dirname("/home/tech") // "/home"
 */
export function dirname(path: string): string {
	const segments = splitPath(path);

	if (segments.length <= 1) {
		return ROOT_PATH;
	}

	return ROOT_PATH + segments.slice(0, -1).join("/");
}

/**
 * 取得最後一段名稱，會先正規化。根目錄回傳 `/`（與根節點的 name 一致）。
 *
 * @example basename("/home/tech/wake_up.txt") // "wake_up.txt"
 */
export function basename(path: string): string {
	const segments = splitPath(path);

	if (segments.length === 0) {
		return ROOT_PATH;
	}

	return segments[segments.length - 1];
}

/**
 * 把玩家輸入的任何形式路徑轉成正規化的絕對路徑，不檢查是否存在。
 *
 * - 空字串：回傳目前工作目錄
 * - `~`：家目錄
 * - `~/xxx`：家目錄底下的 xxx
 * - `/` 開頭：絕對路徑
 * - 其他：以 `cwd` 為基準的相對路徑
 *
 * `~user` 這類寫法不支援，會被當成一般的相對路徑名稱。
 */
export function resolvePath(cwd: string, input: string, home: string): string {
	if (input === "") {
		return normalizePath(cwd);
	}

	if (input === "~") {
		return normalizePath(home);
	}

	if (input.startsWith("~/")) {
		return joinPath(home, input.slice(2));
	}

	if (input.startsWith("/")) {
		return normalizePath(input);
	}

	return joinPath(cwd, input);
}
