/**
 * 虛擬檔案系統的實作。
 */

import type { FsDirNode, FsFileNode, FsNode, FsSnapshot, SerializedFs, VirtualFs } from "../types";
import { canRead, FsError, HOME_DIR, isValidMode, PLAYER_USER } from "../types";
import { cloneNode, createDirNode, createFileNode, deleteChild, getChild, setChild } from "./node";
import { ROOT_PATH, basename, dirname, joinPath, resolvePath, splitPath } from "./path";
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

/** `mkdir` 的選項。 */
export interface MkdirOptions {
	/** `mkdir -p`：連父目錄一起建，已存在的目錄不報錯。 */
	parents?: boolean;
}

/** `remove` 的選項。 */
export interface RemoveOptions {
	/** `rm -r`：允許刪除目錄（連同內容）。 */
	recursive?: boolean;
}

/** `copy` 的選項。 */
export interface CopyOptions {
	/** `cp -r`：允許複製目錄（整棵子樹）。 */
	recursive?: boolean;
}

/** `move`、`copy` 解析出來的目的地：放進哪個目錄、叫什麼名字，以及完整的絕對路徑。 */
interface TransferDestination {
	parent: FsDirNode;
	name: string;
	absolutePath: string;
}

/** 目前唯一支援的序列化格式版本。 */
const SERIALIZED_VERSION = 1;

/**
 * 依名稱排序節點。固定用 `en` 語系，避免 Node 與瀏覽器預設語系不同造成排序不一致。
 */
function compareByName(a: FsNode, b: FsNode): number {
	return a.name.localeCompare(b.name, "en");
}

/** 現在時間的 ISO 8601 字串，寫入類操作的 mtime 都用它。 */
function currentTime(): string {
	return new Date().toISOString();
}

/** `path` 是否就是 `ancestor`，或在 `ancestor` 底下（兩者都是正規化後的絕對路徑）。 */
function isSameOrInside(path: string, ancestor: string): boolean {
	if (ancestor === ROOT_PATH) {
		return true;
	}

	return path === ancestor || path.startsWith(`${ancestor}/`);
}

/** 玩家輸入的最後一段（去掉結尾斜線後）是不是 `.` 或 `..`。 */
function endsWithDotSegment(input: string): boolean {
	const segments = input.replace(/\/+$/, "").split("/");
	const last = segments[segments.length - 1];

	return last === "." || last === "..";
}

/** 字串裡有沒有萬用字元 `*` 或 `?`。 */
function hasWildcard(pattern: string): boolean {
	return pattern.includes("*") || pattern.includes("?");
}

/** 把萬用字元樣式轉成正規表示式：`*` 配任意多個字元、`?` 配一個字元，其他字元照字面。 */
function globToRegExp(pattern: string): RegExp {
	let source = "";

	for (const char of Array.from(pattern)) {
		if (char === "*") {
			source += ".*";
		} else if (char === "?") {
			source += ".";
		} else {
			source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
	}

	return new RegExp(`^${source}$`, "u");
}

/**
 * 萬用字元展開時接路徑：保留玩家的寫法，空字串（目前目錄）直接接名稱，結尾已有 `/` 時不重複。
 *
 * @example joinGlobPath("logs", "a.log") // "logs/a.log"
 */
function joinGlobPath(parent: string, name: string): string {
	if (parent === "") {
		return name;
	}

	if (parent.endsWith("/")) {
		return `${parent}${name}`;
	}

	return `${parent}/${name}`;
}

/**
 * 檢查 `mv` 能不能把 `source` 放到已經有 `existing` 的位置：
 * 檔案蓋檔案可以；檔案蓋目錄丟 `EISDIR`；目錄蓋檔案丟 `ENOTDIR`；
 * 目錄蓋目錄只有對方是空目錄時可以，否則丟 `EEXIST`（真的 mv 是 Directory not empty）。
 */
function assertMoveFits(source: FsNode, existing: FsNode | undefined, displayPath: string): void {
	if (existing === undefined) {
		return;
	}

	if (source.type === "file" && existing.type === "dir") {
		throw new FsError("EISDIR", displayPath);
	}

	if (source.type === "dir" && existing.type === "file") {
		throw new FsError("ENOTDIR", displayPath);
	}

	if (existing.type === "dir" && Object.keys(existing.children).length > 0) {
		throw new FsError("EEXIST", displayPath);
	}
}

/**
 * 檢查 `cp` 能不能把 `source` 放到已經有 `existing` 的位置（整棵檢查）：
 * 檔案蓋檔案可以；檔案蓋目錄丟 `EISDIR`；目錄蓋檔案丟 `ENOTDIR`；目錄蓋目錄合併，逐一檢查子項。
 */
function assertCopyFits(source: FsNode, existing: FsNode | undefined, displayPath: string): void {
	if (existing === undefined) {
		return;
	}

	if (source.type === "file" && existing.type === "dir") {
		throw new FsError("EISDIR", displayPath);
	}

	if (source.type === "dir" && existing.type === "file") {
		throw new FsError("ENOTDIR", displayPath);
	}

	if (source.type === "dir" && existing.type === "dir") {
		for (const [childName, child] of Object.entries(source.children)) {
			assertCopyFits(child, getChild(existing, childName), displayPath);
		}
	}
}

/**
 * 把 `source` 的複製品放到 `parent` 底下叫 `name`。
 * 複製品的 mtime 是現在、擁有者是玩家、權限保留；目的地已有同名目錄時合併內容（跟真的 `cp -r` 一樣）。
 * 呼叫前要先用 `assertCopyFits` 確認沒有衝突。
 */
function placeCopy(parent: FsDirNode, name: string, source: FsNode, now: string): void {
	if (source.type === "file") {
		setChild(parent, name, createFileNode(name, source.content, { mtime: now, owner: PLAYER_USER, mode: source.mode }));
		return;
	}

	const existing = getChild(parent, name);
	let target: FsDirNode;

	if (existing !== undefined && existing.type === "dir") {
		target = existing;
		target.mtime = now;
	} else {
		target = createDirNode(name, {}, { mtime: now, owner: PLAYER_USER, mode: source.mode });
		setChild(parent, name, target);
	}

	for (const [childName, child] of Object.entries(source.children)) {
		placeCopy(target, childName, child, now);
	}
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
		const file = this.getFile(cwd, input);

		if (!canRead(file)) {
			throw new FsError("EACCES", input);
		}

		return file.content;
	}

	writeFile(cwd: string, input: string, content: string): void {
		this.writeContent(cwd, input, content, "overwrite");
	}

	appendFile(cwd: string, input: string, content: string): void {
		this.writeContent(cwd, input, content, "append");
	}

	mkdir(cwd: string, input: string, options: MkdirOptions = {}): void {
		const absolutePath = this.resolvePath(cwd, input);
		const now = currentTime();

		if (options.parents === true) {
			this.mkdirWithParents(absolutePath, input, now);
			return;
		}

		if (absolutePath === ROOT_PATH) {
			throw new FsError("EEXIST", input);
		}

		const parent = this.resolveParent(absolutePath, input);
		const name = basename(absolutePath);

		if (getChild(parent, name) !== undefined) {
			throw new FsError("EEXIST", input);
		}

		setChild(parent, name, createDirNode(name, {}, { mtime: now, owner: PLAYER_USER }));
		parent.mtime = now;
	}

	touch(cwd: string, input: string): void {
		const absolutePath = this.resolvePath(cwd, input);
		const now = currentTime();

		if (absolutePath === ROOT_PATH) {
			this.root.mtime = now;
			return;
		}

		const parent = this.resolveParent(absolutePath, input);
		const name = basename(absolutePath);
		const existing = getChild(parent, name);

		if (existing !== undefined) {
			// 跟 getNode 一樣：對檔案加結尾斜線視為「不是目錄」
			if (existing.type === "file" && input.endsWith("/")) {
				throw new FsError("ENOTDIR", input);
			}

			existing.mtime = now;
			return;
		}

		setChild(parent, name, createFileNode(name, "", { mtime: now }));
		parent.mtime = now;
	}

	remove(cwd: string, input: string, options: RemoveOptions = {}): void {
		const absolutePath = this.resolvePath(cwd, input);

		// 根目錄、`.`、`..` 都不能刪，跟真的 rm 一樣；不然 `rm -r .` 會把自己站的目錄刪掉
		if (absolutePath === ROOT_PATH || endsWithDotSegment(input)) {
			throw new FsError("EBUSY", input);
		}

		const node = this.getNode(cwd, input);

		if (node.type === "dir" && options.recursive !== true) {
			throw new FsError("EISDIR", input);
		}

		const parent = this.resolveParent(absolutePath, input);
		deleteChild(parent, basename(absolutePath));
		parent.mtime = currentTime();
	}

	move(cwd: string, from: string, to: string): void {
		const sourcePath = this.resolvePath(cwd, from);

		if (sourcePath === ROOT_PATH) {
			throw new FsError("EBUSY", from);
		}

		const source = this.getNode(cwd, from);
		const sourceParent = this.resolveParent(sourcePath, from);
		const destination = this.resolveTransferDestination(cwd, to, basename(sourcePath));

		// 搬到自己原本的位置（例如 `mv core.cfg ./`）：什麼都不用做
		if (destination.absolutePath === sourcePath) {
			return;
		}

		if (source.type === "dir" && isSameOrInside(destination.absolutePath, sourcePath)) {
			throw new FsError("EBUSY", to);
		}

		const existing = getChild(destination.parent, destination.name);
		assertMoveFits(source, existing, to);

		const now = currentTime();
		deleteChild(sourceParent, basename(sourcePath));
		source.name = destination.name;
		setChild(destination.parent, destination.name, source);
		sourceParent.mtime = now;
		destination.parent.mtime = now;
	}

	copy(cwd: string, from: string, to: string, options: CopyOptions = {}): void {
		const sourcePath = this.resolvePath(cwd, from);
		const source = this.getNode(cwd, from);

		if (source.type === "dir" && options.recursive !== true) {
			throw new FsError("EISDIR", from);
		}

		const destination = this.resolveTransferDestination(cwd, to, basename(sourcePath));

		// 複製到自己身上（例如 `cp core.cfg core.cfg`）：內容不會變，什麼都不用做
		if (destination.absolutePath === sourcePath) {
			return;
		}

		if (source.type === "dir" && isSameOrInside(destination.absolutePath, sourcePath)) {
			throw new FsError("EBUSY", to);
		}

		// 先整棵檢查衝突再動手，避免複製到一半才失敗、留下半套結果
		assertCopyFits(source, getChild(destination.parent, destination.name), to);

		const now = currentTime();
		placeCopy(destination.parent, destination.name, source, now);
		destination.parent.mtime = now;
	}

	setMode(cwd: string, input: string, mode: string): void {
		if (!isValidMode(mode)) {
			throw new Error(`不合法的權限字串：${mode}`);
		}

		this.getNode(cwd, input).mode = mode;
	}

	glob(cwd: string, pattern: string): string[] {
		if (!hasWildcard(pattern)) {
			if (this.exists(cwd, pattern)) {
				return [pattern];
			}

			return [];
		}

		// 絕對路徑從 `/` 開始接，相對路徑從空字串（目前目錄）開始接
		const absolute = pattern.startsWith("/");
		const segments = (absolute ? pattern.slice(1) : pattern).split("/");
		let candidates = [absolute ? ROOT_PATH : ""];

		for (const segment of segments) {
			if (!hasWildcard(segment)) {
				candidates = candidates.map((candidate) => joinGlobPath(candidate, segment));
				continue;
			}

			candidates = candidates.flatMap((candidate) =>
				this.matchNames(cwd, candidate, segment).map((name) => joinGlobPath(candidate, name)),
			);
		}

		// 中間那段配到的東西底下不一定有後面的路徑（例如 `*/notes.txt` 配到的檔案），最後統一檢查存在
		return candidates.filter((candidate) => this.exists(cwd, candidate));
	}

	/**
	 * 列出 `dirPath`（玩家寫法，空字串代表目前目錄）底下名稱符合 `namePattern` 的子項，依名稱排序。
	 * 隱藏檔只有在 pattern 以 `.` 開頭時才會配到；目錄不存在或不是目錄時回傳空陣列。
	 */
	private matchNames(cwd: string, dirPath: string, namePattern: string): string[] {
		let dir: FsDirNode;

		try {
			dir = this.getDir(cwd, dirPath === "" ? "." : dirPath);
		} catch (error) {
			if (error instanceof FsError) {
				return [];
			}

			throw error;
		}

		const matcher = globToRegExp(namePattern);
		const includeHidden = namePattern.startsWith(".");
		const names = Object.keys(dir.children).filter((name) => {
			if (!includeHidden && name.startsWith(".")) {
				return false;
			}

			return matcher.test(name);
		});

		return names.sort((a, b) => a.localeCompare(b, "en"));
	}

	serialize(): SerializedFs {
		return {
			version: SERIALIZED_VERSION,
			root: cloneNode(this.root),
		};
	}

	/**
	 * `writeFile` 與 `appendFile` 共用：不存在就建立，存在就覆寫或接在尾端。
	 */
	private writeContent(cwd: string, input: string, content: string, mode: "overwrite" | "append"): void {
		const absolutePath = this.resolvePath(cwd, input);

		if (absolutePath === ROOT_PATH) {
			throw new FsError("EISDIR", input);
		}

		const parentNode = this.resolveParent(absolutePath, input);
		const name = basename(absolutePath);
		const existing = getChild(parentNode, name);
		const now = currentTime();

		if (existing === undefined) {
			setChild(parentNode, name, createFileNode(name, content, { mtime: now }));
			// 新增項目會改到目錄內容，跟真的檔案系統一樣更新父目錄的 mtime
			parentNode.mtime = now;
			return;
		}

		if (existing.type === "dir") {
			throw new FsError("EISDIR", input);
		}

		if (mode === "append") {
			existing.content += content;
		} else {
			existing.content = content;
		}

		existing.mtime = now;
	}

	/**
	 * `mkdir -p`：沿路缺的目錄都建起來，已存在的目錄跳過。
	 * 最後一段已經是檔案丟 `EEXIST`；中間某段是檔案丟 `ENOTDIR`。
	 */
	private mkdirWithParents(absolutePath: string, displayPath: string, now: string): void {
		const segments = splitPath(absolutePath);
		let current = this.root;

		for (let index = 0; index < segments.length; index += 1) {
			const segment = segments[index];
			const child = getChild(current, segment);

			if (child === undefined) {
				const created = createDirNode(segment, {}, { mtime: now, owner: PLAYER_USER });
				setChild(current, segment, created);
				current.mtime = now;
				current = created;
				continue;
			}

			if (child.type === "dir") {
				current = child;
				continue;
			}

			if (index === segments.length - 1) {
				throw new FsError("EEXIST", displayPath);
			}

			throw new FsError("ENOTDIR", displayPath);
		}
	}

	/**
	 * 取得某個絕對路徑的父目錄節點。
	 * 父目錄不存在丟 `ENOENT`，父路徑是檔案丟 `ENOTDIR`。
	 */
	private resolveParent(absolutePath: string, displayPath: string): FsDirNode {
		const parent = this.lookup(dirname(absolutePath), displayPath);

		if (parent.type !== "dir") {
			throw new FsError("ENOTDIR", displayPath);
		}

		return parent;
	}

	/**
	 * `move` 與 `copy` 共用的目的地解析：
	 * `to` 是既有目錄就放進它底下並沿用 `sourceName`，否則把 `to` 當成新的完整路徑。
	 * `to` 以 `/` 結尾代表玩家明確指目錄：目錄不存在就丟錯，不能默默當成新檔名
	 * （`cp core.cfg config/` 在沒有 config/ 時建出「名叫 config 的檔案」會讓玩家卡死）。
	 */
	private resolveTransferDestination(cwd: string, to: string, sourceName: string): TransferDestination {
		const wantsDirectory = to.length > 1 && to.endsWith("/");
		// 去掉尾斜線再解析，`core.cfg/` 才查得到那個檔案、報得出 ENOTDIR 而不是 ENOENT
		const strippedTo = wantsDirectory ? to.replace(/\/+$/, "") : to;
		const targetPath = this.resolvePath(cwd, strippedTo);
		let target: FsNode | undefined;

		try {
			target = this.lookup(targetPath, to);
		} catch (error) {
			if (!(error instanceof FsError) || error.code !== "ENOENT") {
				throw error;
			}

			target = undefined;
		}

		if (target !== undefined && target.type === "dir") {
			return { parent: target, name: sourceName, absolutePath: joinPath(targetPath, sourceName) };
		}

		if (wantsDirectory) {
			if (target === undefined) {
				throw new FsError("ENOENT", to);
			}
			throw new FsError("ENOTDIR", to);
		}

		return {
			parent: this.resolveParent(targetPath, to),
			name: basename(targetPath),
			absolutePath: targetPath,
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
