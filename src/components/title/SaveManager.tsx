"use client";

/**
 * 標題畫面的「存檔管理」（M14-2、審計 A45、A49）：匯出存檔（下載 JSON 檔）與匯入存檔（選 JSON 檔）。
 *
 * - 匯出：內容跟 localStorage 裡的存檔同格式（`{ state, version }`），取記憶體裡的最新狀態，
 *   所以寫入失敗（M12-5 的 `write-failed`）時匯出的也是最新進度，可以當成備份。
 *   存檔來自較新版本（`newer-version`，這個分頁沒讀進來）時照原樣匯出 localStorage 的原始字串，不拿空白的預設值頂替。
 * - 匯入：選檔後動態載入 `saveImport.ts`（帶 zod）檢查：不是 JSON、不是這個遊戲的、版本太新、內容壞掉都拒絕並說明原因；
 *   過了先跳確認（會覆蓋目前的存檔），確認後直接寫進 localStorage，再由整合者重新載入頁面讓 store 重新讀檔。
 *   寫入失敗就提示，存檔不變。較新版本的存檔一樣會被覆蓋，確認訊息會講。
 * - 這裡不呼叫 store 的 action：匯入是整份換掉，走「寫 localStorage → 重新載入」最乾淨，也不受「讀檔完成前不要呼叫 action」限制。
 *
 * 鍵盤：↑↓ 選擇、Enter 確認、Esc 返回；確認面板開著時由它接鍵盤。
 */

import { motion } from "motion/react";
import { useRef, useState, type ChangeEvent } from "react";
import { chapterLabel } from "@/game/chapters/meta";
import { selectHasSave, useGameStore } from "@/game/store";
import { createSaveExportText, saveExportFileName } from "@/game/store/saveExport";
import type { SaveImportSummary } from "@/game/store/saveImport";
import { useSaveIssue } from "@/game/store/saveStatus";
import { SAVE_STORAGE_KEY } from "@/game/store/types";
import { cn } from "@/lib/utils";
import { ConfirmPanel } from "./ConfirmPanel";
import { MenuOption } from "./MenuOption";
import { useMenuNavigation } from "./useMenuNavigation";

export interface SaveManagerProps {
	/** Esc 或「返回」。 */
	onClose: () => void;
	/** 匯入的存檔已寫進 localStorage，整合者重新載入頁面。 */
	onImported: () => void;
}

interface Row {
	action: "export" | "import" | "back";
	label: string;
	/** 選項右邊的小字說明，空字串就不顯示。 */
	hint: string;
}

const ROWS: readonly Row[] = [
	{ action: "export", label: "匯出存檔", hint: "下載 JSON 檔" },
	{ action: "import", label: "匯入存檔", hint: "選擇 JSON 檔" },
	{ action: "back", label: "返回", hint: "" },
];

/** 下載後多久回收 Blob 網址；馬上回收有些瀏覽器會下載失敗。 */
const REVOKE_DELAY_MS = 1000;

const MESSAGES = {
	noSave: "目前沒有存檔可以匯出。",
	readFailed: "讀不到這個檔案，請重新選擇。",
	writeFailed: "匯入失敗：瀏覽器不允許寫入存檔（儲存空間已滿或被封鎖），目前的存檔沒有變動。",
};

interface Message {
	tone: "info" | "error";
	text: string;
}

interface PendingImport {
	json: string;
	summary: SaveImportSummary;
}

/** 觸發瀏覽器下載一段文字。 */
function downloadText(fileName: string, text: string): void {
	const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	document.body.append(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/** 確認訊息：要匯入哪一章的存檔、會不會蓋掉現有的。 */
function confirmMessage(summary: SaveImportSummary, overwrites: boolean): string {
	let name = chapterLabel(summary.chapter);
	if (summary.cleared) {
		name = `${name}（已逃離）`;
	}
	if (overwrites) {
		return `匯入「${name}」的存檔會覆蓋目前的存檔，確定嗎？`;
	}
	return `匯入「${name}」的存檔？`;
}

export function SaveManager({ onClose, onImported }: SaveManagerProps) {
	const hasSave = useGameStore(selectHasSave);
	const saveIssue = useSaveIssue();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [message, setMessage] = useState<Message | null>(null);
	const [pending, setPending] = useState<PendingImport | null>(null);
	// 較新版本的存檔沒讀進來，hasSave 是 false，但 localStorage 裡其實有東西
	const hasStoredSave = hasSave || saveIssue === "newer-version";

	function exportSave() {
		let text: string | null = null;
		if (saveIssue === "newer-version") {
			text = localStorage.getItem(SAVE_STORAGE_KEY);
		} else if (hasSave) {
			text = createSaveExportText(useGameStore.getState());
		}
		if (text === null) {
			setMessage({ tone: "error", text: MESSAGES.noSave });
			return;
		}
		const fileName = saveExportFileName(new Date());
		downloadText(fileName, text);
		setMessage({ tone: "info", text: `已下載 ${fileName}` });
	}

	async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
		const input = event.currentTarget;
		const file = input.files?.[0];
		// 清掉選擇，同一個檔案改完再選一次也會觸發 change
		input.value = "";
		if (file === undefined) {
			return;
		}

		let text: string;
		try {
			text = await file.text();
		} catch {
			setMessage({ tone: "error", text: MESSAGES.readFailed });
			return;
		}

		const { parseSaveImport } = await import("@/game/store/saveImport");
		const result = parseSaveImport(text);
		if (!result.ok) {
			setMessage({ tone: "error", text: result.message });
			return;
		}
		setMessage(null);
		setPending({ json: result.json, summary: result.summary });
	}

	function confirmImport() {
		if (pending === null) {
			return;
		}
		try {
			localStorage.setItem(SAVE_STORAGE_KEY, pending.json);
		} catch {
			setPending(null);
			setMessage({ tone: "error", text: MESSAGES.writeFailed });
			return;
		}
		setPending(null);
		onImported();
	}

	function activate(index: number) {
		const row = ROWS[index];
		if (row === undefined || row.action === "back") {
			onClose();
			return;
		}
		if (row.action === "export") {
			exportSave();
			return;
		}
		fileInputRef.current?.click();
	}

	const { selectedIndex, setSelectedIndex } = useMenuNavigation({
		itemCount: ROWS.length,
		onConfirm: activate,
		onCancel: onClose,
		enabled: pending === null,
	});

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
			<motion.div
				role="dialog"
				aria-modal="true"
				aria-label="存檔管理"
				data-testid="save-manager"
				initial={{ opacity: 0, scaleY: 0.8 }}
				animate={{ opacity: 1, scaleY: 1 }}
				transition={{ duration: 0.15, ease: "easeOut" }}
				className="flex w-full max-w-lg flex-col gap-4 border-2 border-game-holo/60 bg-game-bg px-6 py-5 font-terminal text-xl text-game-text"
			>
				<h2 className="font-title text-lg text-game-holo">存檔管理</h2>

				{pending === null && (
					<ul className="flex flex-col items-start gap-1">
						{ROWS.map((row, index) => (
							<li key={row.action} className="flex items-baseline gap-2">
								<MenuOption
									selected={index === selectedIndex}
									onHover={() => setSelectedIndex(index)}
									onClick={() => {
										setSelectedIndex(index);
										activate(index);
									}}
								>
									{row.label}
								</MenuOption>
								{row.hint !== "" && <span className="text-sm text-game-prompt">{row.hint}</span>}
							</li>
						))}
					</ul>
				)}

				{pending !== null && (
					<ConfirmPanel
						message={confirmMessage(pending.summary, hasStoredSave)}
						confirmLabel="匯入"
						onConfirm={confirmImport}
						onCancel={() => setPending(null)}
					/>
				)}

				<p
					role="status"
					data-testid="save-manager-message"
					className={cn("min-h-7 text-base", message?.tone === "error" ? "text-game-amber" : "text-game-dim")}
				>
					{message?.text ?? ""}
				</p>

				<input
					ref={fileInputRef}
					type="file"
					accept="application/json,.json"
					aria-label="選擇存檔檔案"
					className="hidden"
					tabIndex={-1}
					onChange={handleFileChange}
				/>

				<p className="text-base text-game-dim">↑↓ 選擇 · Enter 確認 · Esc 返回</p>
			</motion.div>
		</div>
	);
}
