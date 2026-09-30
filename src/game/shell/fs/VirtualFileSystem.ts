/**
 * 虛擬檔案系統的實作。
 */

import type { FsDirNode, FsFileNode, FsNode, FsSnapshot, SerializedFs, VirtualFs } from "../types";
import { FsError, HOME_DIR } from "../types";
import { cloneNode, createFileNode, getChild, setChild } from "./node";
import { ROOT_PATH, basename, dirname, resolvePath, splitPath } from "./path";
import { buildRootFromSnapshot } from "./snapshot";

/** 建立虛擬檔案系統時的選項。 */
export interface VirtualFileSystemOptions {
	/** 家目錄，`~` 會展開成這個路徑，預設 `HOME_DIR`。 */
	home?: string;
}

/** `list` 的選項。 */
export interface ListOptions {
	/** 是否列出 `.` 開頭的隱藏檔，預設 false。 */
	includeHidden?: boolean;
}

/** 目前唯一支援的序列化格式版本。 */
const SERIALIZED_VERSION = 1;

/**
 * 依名稱排序節點。固定用 `en` 語系，避免 Node 與瀏覽器預設語系不同造成排序不一致。
 */
function compareByName(a: FsNode, b: FsNode): number {
	return a.name.localeCompare(b.name, "en");
}

export class VirtualFileSystem implements VirtualFs {
	/** 家目錄的絕對路徑。 */
	readonly home: string;

	private readonly root: FsDirNode;

	/**
	 * 直接用一棵樹建立。傳入的樹會被直接使用（不拷貝），
	 * 一般情況請用 `fromSnapshot` 或 `fromSerialized`。
	 */
	constructor(root: FsDirNode, options: VirtualFileSystemOptions = {}) {
		this.root = root;
		this.home = options.home ?? HOME_DIR;
	}

	/** 從劇本快照建立。 */
	static fromSnapshot(snapshot: FsSnapshot, options: VirtualFileSystemOptions = {}): VirtualFileSystem {
		return new VirtualFileSystem(buildRootFromSnapshot(snapshot), options);
	}

	/** 從 `serialize()` 的結果還原。會深拷貝一份，之後改動不會影響傳入的資料。 */
	static fromSerialized(data: SerializedFs, options: VirtualFileSystemOptions = {}): VirtualFileSystem {
		if (data.version !== SERIALIZED_VERSION) {
			throw new Error(`不支援的檔案系統序列化版本：${String(data.version)}`);
		}

		if (data.root.type !== "dir") {
			throw new Error("序列化資料的根節點必須是目錄");
		}

		return new VirtualFileSystem(cloneNode(data.root), options);
	}

	resolvePath(cwd: string, input: string): string {
		return resolvePath(cwd, input, this.home);
	}

	getNode(cwd: string, input: string): FsNode {
		const node = this.lookup(this.resolvePath(cwd, input), input);

		// 跟真的 shell 一樣：對檔案加結尾斜線（例如 `cat wake_up.txt/`）視為「不是目錄」
		if (node.type === "file" && input.endsWith("/")) {
			throw new FsError("ENOTDIR", input);
		}

		return node;
	}

	getDir(cwd: string, input: string): FsDirNode {
		const node = this.getNode(cwd, input);

		if (node.type !== "dir") {
			throw new FsError("ENOTDIR", input);
		}

		return node;
	}

	getFile(cwd: string, input: string): FsFileNode {
		const node = this.getNode(cwd, input);

		if (node.type !== "file") {
			throw new FsError("EISDIR", input);
		}

		return node;
	}

	exists(cwd: string, input: string): boolean {
		try {
			this.getNode(cwd, input);
			return true;
		} catch (error) {
			if (error instanceof FsError) {
				return false;
			}

			throw error;
		}
	}

	list(cwd: string, input: string, options: ListOptions = {}): FsNode[] {
		const dir = this.getDir(cwd, input);
		const includeHidden = options.includeHidden ?? false;
		const nodes = Object.values(dir.children).filter((node) => {
			if (includeHidden) {
				return true;
			}

			return !node.name.startsWith(".");
		});

		return nodes.sort(compareByName);
	}

	readFile(cwd: string, input: string): string {
		return this.getFile(cwd, input).content;
	}

	writeFile(cwd: string, input: string, content: string): void {
		const absolutePath = this.resolvePath(cwd, input);

		if (absolutePath === ROOT_PATH) {
			throw new FsError("EISDIR", input);
		}

		const parentNode = this.lookup(dirname(absolutePath), input);

		if (parentNode.type !== "dir") {
			throw new FsError("ENOTDIR", input);
		}

		const name = basename(absolutePath);
		const existing = getChild(parentNode, name);
		const now = new Date().toISOString();

		if (existing === undefined) {
			setChild(parentNode, name, createFileNode(name, content, { mtime: now }));
			// 新增項目會改到目錄內容，跟真的檔案系統一樣更新父目錄的 mtime
			parentNode.mtime = now;
			return;
		}

		if (existing.type === "dir") {
			throw new FsError("EISDIR", input);
		}

		existing.content = content;
		existing.mtime = now;
	}

	serialize(): SerializedFs {
		return {
			version: SERIALIZED_VERSION,
			root: cloneNode(this.root),
		};
	}

	/**
	 * 依正規化後的絕對路徑逐段走訪。
	 * 錯誤裡的 path 用 `displayPath`（玩家輸入的原字串）。
	 */
	private lookup(absolutePath: string, displayPath: string): FsNode {
		let current: FsNode = this.root;

		for (const segment of splitPath(absolutePath)) {
			if (current.type !== "dir") {
				throw new FsError("ENOTDIR", displayPath);
			}

			const child = getChild(current, segment);

			if (child === undefined) {
				throw new FsError("ENOENT", displayPath);
			}

			current = child;
		}

		return current;
	}
}
