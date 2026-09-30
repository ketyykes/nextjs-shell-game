/**
 * 指令歷史。
 *
 * 負責兩件事：記住玩家打過的指令，以及讓上下鍵在歷史裡來回。
 * `history` 指令列出的內容就是 `entries()`。
 * 游標的行為跟 bash 一樣：按 ↑ 從最新一筆往回走，按 ↓ 往前走，
 * 走過最新一筆會回到「還沒打字」的空白狀態；新增一筆之後游標重置。
 */
export class CommandHistory {
	private readonly items: string[];
	/** 游標位置，等於 `items.length` 代表在空白輸入列上。 */
	private cursor: number;
	private readonly maxSize: number;

	constructor(initial: string[] = [], maxSize = 200) {
		this.items = [...initial];
		this.maxSize = maxSize;
		this.cursor = this.items.length;
	}

	/**
	 * 加入一筆。空字串或只有空白的輸入不記；跟上一筆完全相同也不記，
	 * 避免玩家連按 Enter 把歷史塞滿。
	 */
	push(input: string): void {
		const trimmed = input.trim();
		if (trimmed.length === 0) {
			this.resetCursor();
			return;
		}
		const last = this.items[this.items.length - 1];
		if (last !== trimmed) {
			this.items.push(trimmed);
			if (this.items.length > this.maxSize) {
				this.items.shift();
			}
		}
		this.resetCursor();
	}

	/** 按 ↑：往舊的方向走一筆，已在最舊時停住並回傳同一筆。沒有歷史時回傳 null。 */
	up(): string | null {
		if (this.items.length === 0) {
			return null;
		}
		if (this.cursor > 0) {
			this.cursor -= 1;
		}
		return this.items[this.cursor];
	}

	/** 按 ↓：往新的方向走一筆，超過最新一筆時回到空白輸入列並回傳空字串。 */
	down(): string {
		if (this.cursor >= this.items.length) {
			return "";
		}
		this.cursor += 1;
		if (this.cursor >= this.items.length) {
			this.cursor = this.items.length;
			return "";
		}
		return this.items[this.cursor];
	}

	/** 把游標放回空白輸入列。 */
	resetCursor(): void {
		this.cursor = this.items.length;
	}

	/** 全部歷史，最舊在前，回傳拷貝。 */
	entries(): string[] {
		return [...this.items];
	}

	get length(): number {
		return this.items.length;
	}
}
