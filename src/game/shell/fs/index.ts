/**
 * 虛擬檔案系統模組的公開入口。
 */

export { basename, dirname, joinPath, normalizePath, resolvePath, ROOT_PATH, splitPath } from "./path";
export {
	cloneNode,
	createDirNode,
	createFileNode,
	DEFAULT_DIR_MODE,
	DEFAULT_FILE_MODE,
	DEFAULT_MTIME,
	deleteChild,
	getChild,
	getNodeSize,
	setChild,
} from "./node";
export type { NodeMetaOptions } from "./node";
export { buildRootFromSnapshot, ROOT_NAME } from "./snapshot";
export { VirtualFileSystem } from "./VirtualFileSystem";
export type { CopyOptions, ListOptions, MkdirOptions, RemoveOptions, VirtualFileSystemOptions } from "./VirtualFileSystem";
