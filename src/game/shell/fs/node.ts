/**
 * 檔案系統節點的工廠函式與小工具。
 */

import type { FsDirNode, FsFileNode, FsNode } from "../types";
import { DIR_SIZE, PLAYER_USER } from "../types";

/** 預設修改時間，只是佔位，劇本會用 `$type` 寫法覆寫。 */
export const DEFAULT_MTIME = "2031-03-10T00:00:00Z";

/** 檔案的預設權限。 */
export const DEFAULT_FILE_MODE = "rw-r--r--";

/** 目錄的預設權限。 */
export const DEFAULT_DIR_MODE = "rwxr-xr-x";

/** 建立節點時可覆寫的欄位。 */
export interface NodeMetaOptions {
	mtime?: string;
	owner?: string;
	mode?: string;
}

/** 建立檔案節點，未指定的欄位使用預設值。 */
export function createFileNode(name: string, content: string, options: NodeMetaOptions = {}): FsFileNode {
	return {
		type: "file",
		name,
		content,
		mtime: options.mtime ?? DEFAULT_MTIME,
		owner: options.owner ?? PLAYER_USER,
		mode: options.mode ?? DEFAULT_FILE_MODE,
	};
}

/**
 * 建立目錄節點，未指定的欄位使用預設值。
 * 傳入的 `children` 會逐項複製到新物件（淺拷貝），避免與呼叫端共用同一個 Record。
 */
export function createDirNode(
	name: string,
	children: Record<string, FsNode> = {},
	options: NodeMetaOptions = {},
): FsDirNode {
	const dir: FsDirNode = {
		type: "dir",
		name,
		children: {},
		mtime: options.mtime ?? DEFAULT_MTIME,
		owner: options.owner ?? PLAYER_USER,
		mode: options.mode ?? DEFAULT_DIR_MODE,
	};

	for (const [childName, child] of Object.entries(children)) {
		setChild(dir, childName, child);
	}

	return dir;
}

/** 節點大小：檔案是內容的 UTF-8 位元組數，目錄固定回傳 `DIR_SIZE`。 */
export function getNodeSize(node: FsNode): number {
	if (node.type === "dir") {
		return DIR_SIZE;
	}

	return new TextEncoder().encode(node.content).length;
}

/**
 * 取得目錄底下的子節點，不存在回傳 `undefined`。
 * 只看自身屬性，避免玩家輸入 `constructor`、`__proto__` 之類的名稱時拿到原型鏈上的東西。
 */
export function getChild(dir: FsDirNode, name: string): FsNode | undefined {
	if (!Object.prototype.hasOwnProperty.call(dir.children, name)) {
		return undefined;
	}

	return dir.children[name];
}

/**
 * 設定目錄底下的子節點。
 * 用 `defineProperty` 而非直接賦值，名稱是 `__proto__` 時也會變成一般的自身屬性。
 */
export function setChild(dir: FsDirNode, name: string, node: FsNode): void {
	Object.defineProperty(dir.children, name, {
		value: node,
		enumerable: true,
		writable: true,
		configurable: true,
	});
}

/** 深拷貝節點（含整棵子樹）。 */
export function cloneNode<T extends FsNode>(node: T): T;
export function cloneNode(node: FsNode): FsNode {
	if (node.type === "file") {
		return { ...node };
	}

	const copy: FsDirNode = { ...node, children: {} };

	for (const [childName, child] of Object.entries(node.children)) {
		setChild(copy, childName, cloneNode(child));
	}

	return copy;
}
