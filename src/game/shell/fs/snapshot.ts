/**
 * 從劇本的快照字面值（`FsSnapshot`）建立檔案系統樹。
 */

import type { FsDirNode, FsNode, FsSnapshot, FsSnapshotDir, FsSnapshotEntry, FsSnapshotFile } from "../types";
import { createDirNode, createFileNode, setChild } from "./node";
import { ROOT_PATH } from "./path";

/**
 * 根節點的名稱固定是 `/`，與 `basename("/")` 的回傳值一致。
 * 其他節點的 name 都是它在父目錄 `children` 裡的 key。
 */
export const ROOT_NAME = ROOT_PATH;

function isSnapshotFile(entry: FsSnapshotEntry): entry is FsSnapshotFile {
	return typeof entry === "object" && entry !== null && entry.$type === "file";
}

function isSnapshotDir(entry: FsSnapshotEntry): entry is FsSnapshotDir {
	return typeof entry === "object" && entry !== null && entry.$type === "dir";
}

/** 檢查快照裡的名稱是否合法，不合法直接丟 `Error`（這是劇本寫錯，不是玩家的錯）。 */
function assertValidName(name: string, parentPath: string): void {
	if (name.includes("/")) {
		throw new Error(`快照名稱不可包含 "/"：${parentPath} 底下的 "${name}"`);
	}

	if (name === "" || name === "." || name === "..") {
		throw new Error(`快照名稱不可為空字串、"." 或 ".."：${parentPath} 底下的 "${name}"`);
	}
}

function joinForMessage(parentPath: string, name: string): string {
	if (parentPath === ROOT_PATH) {
		return ROOT_PATH + name;
	}

	return `${parentPath}/${name}`;
}

/** 把一個快照項目轉成節點。`path` 只用在錯誤訊息，方便找到劇本裡寫錯的位置。 */
function buildNode(name: string, entry: FsSnapshotEntry, path: string): FsNode {
	if (typeof entry === "string") {
		return createFileNode(name, entry);
	}

	if (typeof entry !== "object" || entry === null) {
		throw new Error(`快照項目格式錯誤：${path}`);
	}

	if (isSnapshotFile(entry)) {
		if (typeof entry.content !== "string") {
			throw new Error(`$type 為 "file" 的項目必須有字串 content：${path}`);
		}

		return createFileNode(name, entry.content, {
			mtime: entry.mtime,
			owner: entry.owner,
			mode: entry.mode,
		});
	}

	if (isSnapshotDir(entry)) {
		if (typeof entry.children !== "object" || entry.children === null) {
			throw new Error(`$type 為 "dir" 的項目必須有 children 物件：${path}`);
		}

		const dir = createDirNode(name, {}, {
			mtime: entry.mtime,
			owner: entry.owner,
			mode: entry.mode,
		});
		fillChildren(dir, entry.children, path);
		return dir;
	}

	// 其他物件：每個 key 都是子項名稱
	const dir = createDirNode(name);
	fillChildren(dir, entry as FsSnapshot, path);
	return dir;
}

function fillChildren(dir: FsDirNode, snapshot: FsSnapshot, dirPath: string): void {
	for (const [childName, childEntry] of Object.entries(snapshot)) {
		assertValidName(childName, dirPath);
		const childPath = joinForMessage(dirPath, childName);
		setChild(dir, childName, buildNode(childName, childEntry, childPath));
	}
}

/**
 * 依快照遞迴建立整棵樹，回傳根目錄節點（name 為 `/`）。
 *
 * 規則（與 `FsSnapshot` 的註解一致）：
 * - 字串：檔案
 * - `$type: "file"`：檔案，可指定 mtime、owner、mode
 * - `$type: "dir"`：目錄，可指定 mtime、owner、mode，子項在 `children`
 * - 其他物件：目錄，每個 key 是子項名稱
 *
 * 名稱含 `/`、或為空字串、`.`、`..` 時丟 `Error`。
 */
export function buildRootFromSnapshot(snapshot: FsSnapshot): FsDirNode {
	const root = createDirNode(ROOT_NAME);
	fillChildren(root, snapshot, ROOT_PATH);
	return root;
}
