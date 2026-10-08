import { expect, type Page } from "@playwright/test";
import { solutionFor } from "../../src/game/chapters/solutions";
import { DECK_ROOMS, ROOM_NAMES, type RoomSlot } from "../../src/game/phaser/events";
import { PLAYER_PROBE_KEY, type PlayerProbeSnapshot } from "../../src/game/phaser/objects/playerProbe";

/**
 * 六個甲板共用的 e2e 走路與解謎工具。
 *
 * 走路是閉環（M11-6，坑與設計見 docs/progress.md 第 5 節）：開發模式下 Station 把角色座標掛在 `window.__kepler9Player`，
 * 這裡每一段都是「讀座標 → 按住方向鍵 → 在頁面裡逐幀讀座標，到了就放開 → 等角色停穩再讀一次」，
 * 不靠計時，所以機器忙、瀏覽器掉幀時只是走得慢，不會走偏。
 * 六個甲板的平面圖完全一樣（`pnpm map:build` 產生，只有艙區名與裝飾不同），所以路徑點寫死一份六章共用。
 */

export const TERMINALS_PER_CHAPTER = 6;

// ---------------------------------------------------------------------------
// 平面圖（px）。角色座標是 sprite 中心；碰撞盒 20x14 在 sprite 下半部：x ± 10、y + 10 到 y + 24。
// 房間：上排三間 y 64 到 256、門在 x 208／592／976；走廊 y 320 到 416；下排兩間 y 480 到 704、門在 x 208／592；
// 主艙門在走廊右端 x 1120 到 1248、y 288 到 448，跟走廊相通。
// ---------------------------------------------------------------------------

/** 走廊中線：碰撞盒落在走廊三格（y 320 到 416）正中間。橫越走廊一律沿這條線走，碰不到上下兩排的門。 */
const CORRIDOR_LANE_Y = 352;
/** 上排房間裡、門口正上方的接近點；碰撞盒底邊 224，離下牆（256）還有一格。 */
const UPPER_ROOM_APPROACH_Y = 200;
/** 下排房間裡、門口正下方的接近點；碰撞盒頂邊 530，離上牆（480）還有一段。 */
const LOWER_ROOM_APPROACH_Y = 520;
/**
 * 門只有一格寬（32 px），碰撞盒寬 20，中心要在門中心 ± 6 px 內才鑽得進去。
 * 穿門那段 x 的容錯就給 6：進了門框 x 被兩側的牆夾住、一定在容錯內，不會為了對齊在門框裡左右抖。
 */
const DOOR_TOLERANCE_X = 6;
/** 互動半徑 40 px，終端機前的容錯給 12（兩軸都差 12 時距離約 17 px）。 */
const TERMINAL_TOLERANCE = 12;
/** 主艙門的左緣，x 大於等於它就算走進主艙門那四欄。 */
const AIRLOCK_LEFT_X = 1120;

type Zone = "upper" | "lower" | "corridor";

interface SlotGeometry {
	zone: Zone;
	/** 房間門的中心 x；走廊與主艙門沒有門 */
	doorX: number | null;
	/** 終端機互動區的中心，角色站這裡按 E；走廊沒有終端機 */
	terminal: { x: number; y: number } | null;
}

/** 七個位置各自在哪一排、門在哪、終端機在哪（對照 `public/maps/deck1.json` 的 markers 層）。 */
const SLOT_GEOMETRY: Record<RoomSlot, SlotGeometry> = {
	start: { zone: "lower", doorX: 208, terminal: { x: 144, y: 496 } },
	second: { zone: "lower", doorX: 592, terminal: { x: 688, y: 496 } },
	third: { zone: "upper", doorX: 208, terminal: { x: 144, y: 80 } },
	fifth: { zone: "upper", doorX: 592, terminal: { x: 656, y: 80 } },
	fourth: { zone: "upper", doorX: 976, terminal: { x: 1040, y: 80 } },
	exit: { zone: "corridor", doorX: null, terminal: { x: 1200, y: 304 } },
	corridor: { zone: "corridor", doorX: null, terminal: null },
};

/** T1 到 T6 各在哪個位置。 */
const TERMINAL_SLOTS: readonly RoomSlot[] = ["start", "second", "third", "fourth", "fifth", "exit"];

/**
 * 依座標判斷角色在平面圖的哪一區，不靠 HUD（站在門框裡時沒有艙區）。
 * 門框的上半段算上排房間、下半段算走廊；主艙門跟走廊相通，整塊算走廊區。
 */
function slotAt(x: number, y: number): RoomSlot {
	if (y < 290 && x < AIRLOCK_LEFT_X) {
		if (x < 400) {
			return "third";
		}
		if (x < 784) {
			return "fifth";
		}
		return "fourth";
	}
	if (y > 440) {
		if (x < 400) {
			return "start";
		}
		return "second";
	}
	return "corridor";
}

/** 一個路徑點：角色中心要走到 (x, y) 的容錯範圍內。 */
interface Waypoint {
	x: number;
	y: number;
	toleranceX: number;
	toleranceY: number;
	/** 失敗訊息用 */
	label: string;
}

/** 走路的目的地：在哪個位置、站哪一點、容錯多少。 */
interface Destination {
	slot: RoomSlot;
	x: number;
	y: number;
	tolerance: number;
}

function approachYOf(zone: Zone): number {
	if (zone === "upper") {
		return UPPER_ROOM_APPROACH_Y;
	}
	return LOWER_ROOM_APPROACH_Y;
}

/**
 * 從目前座標算下一個路徑點，已經到目的地回傳 null。每走完一段都重算，中途被推到別處也會從新位置重新規劃。
 *
 * 路線固定是：所在房間 → 門口內側 → 穿門到走廊中線 → 沿中線到目標門口 → 穿門進房 → 終端機前。
 * 穿門那段同時按垂直鍵與水平鍵：碰撞盒還沒對準門時被牆擋住、沿牆滑到門口自己鑽進去（以前「貼牆滑行」的機制，
 * 現在只用在門口這一格，前後什麼時候放開都由座標決定）。
 */
function nextWaypoint(position: { x: number; y: number }, destination: Destination): Waypoint | null {
	const here = slotAt(position.x, position.y);
	const goal = SLOT_GEOMETRY[destination.slot];

	const inGoalArea = here === destination.slot || (here === "corridor" && goal.zone === "corridor");
	if (inGoalArea) {
		const closeX = Math.abs(position.x - destination.x) <= destination.tolerance;
		const closeY = Math.abs(position.y - destination.y) <= destination.tolerance;
		if (closeX && closeY) {
			return null;
		}
		// 走廊區裡的目的地（例如主艙門）：先沿中線橫移到正下方再直走；斜著走會貼著上牆滑過上排的門口被吸進去
		if (here === "corridor" && Math.abs(position.x - destination.x) > 24) {
			return { x: destination.x, y: CORRIDOR_LANE_Y, toleranceX: 16, toleranceY: 16, label: "走廊中線（目的地正下方）" };
		}
		return {
			x: destination.x,
			y: destination.y,
			toleranceX: destination.tolerance,
			toleranceY: destination.tolerance,
			label: `${destination.slot} 的目的地`,
		};
	}

	// 在別的房間裡：先到門口內側，再穿門到走廊中線
	if (here !== "corridor") {
		const room = SLOT_GEOMETRY[here];
		const doorX = room.doorX ?? position.x;
		if (Math.abs(position.x - doorX) > 16) {
			return { x: doorX, y: approachYOf(room.zone), toleranceX: 10, toleranceY: 24, label: `${here} 的門口內側` };
		}
		return { x: doorX, y: CORRIDOR_LANE_Y, toleranceX: DOOR_TOLERANCE_X, toleranceY: 16, label: `穿過 ${here} 的門到走廊` };
	}

	// 在走廊、目的地在房間裡：沿中線走到目標門的走廊這側，再穿門進房
	const goalDoorX = goal.doorX ?? destination.x;
	if (Math.abs(position.x - goalDoorX) > 16 || Math.abs(position.y - CORRIDOR_LANE_Y) > 24) {
		return { x: goalDoorX, y: CORRIDOR_LANE_Y, toleranceX: 12, toleranceY: 16, label: `走廊中線（${destination.slot} 的門口）` };
	}
	return {
		x: goalDoorX,
		y: approachYOf(goal.zone),
		toleranceX: DOOR_TOLERANCE_X,
		toleranceY: 24,
		label: `穿過 ${destination.slot} 的門進房`,
	};
}

// ---------------------------------------------------------------------------
// 閉環控制
// ---------------------------------------------------------------------------

type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

/** 頁面裡逐幀等待的結果。 */
interface WatchResult {
	reason: "reached" | "stuck" | "timeout" | "input-disabled";
	x: number;
	y: number;
}

/** 按住方向鍵後在頁面裡等什麼：哪一軸往哪個方向、離目標剩多少就放開。 */
interface WatchPlan {
	probeKey: string;
	targetX: number;
	targetY: number;
	/** 1 往右、-1 往左、0 這軸沒按 */
	signX: number;
	/** 1 往下、-1 往上、0 這軸沒按 */
	signY: number;
	/** 剩下距離小於等於這個值就放開（預估放開後還會滑多遠） */
	releaseX: number;
	releaseY: number;
	/** 座標連續這麼久沒變就算卡住（ms） */
	stuckMs: number;
	/** 這一段最多等多久，到了就回去重新判斷（ms） */
	maxMs: number;
}

/**
 * 放開按鍵後角色還會多走多遠（px）：keyup 從 Playwright 送進頁面、再等 Phaser 下一幀讀到之前，角色照走。
 * 每段都量一次取平均，下一段提早這麼多放開。機器越忙這個值越大，但量得到就修得回來。
 * 同一個頁面的走路共用一份估計值，不用每次從頭學。
 */
interface CoastEstimate {
	x: number;
	y: number;
}

const coastByPage = new WeakMap<Page, CoastEstimate>();

function coastOf(page: Page): CoastEstimate {
	let coast = coastByPage.get(page);
	if (coast === undefined) {
		coast = { x: 2, y: 2 };
		coastByPage.set(page, coast);
	}
	return coast;
}

/** 放開後滑行距離估計值的上限（px），量到離譜的值時不要讓下一段提早太多。 */
const MAX_COAST = 48;

function updateCoast(previous: number, measured: number): number {
	const clamped = Math.min(Math.max(measured, 0), MAX_COAST);
	return (previous + clamped) / 2;
}

const MISSING_PROBE_MESSAGE = `window.${PLAYER_PROBE_KEY} 不存在：場景還沒就緒，或不是開發模式（座標鉤子只在 next dev 掛）`;

/**
 * 等角色停穩：連續三幀座標都沒變、而且能操作（終端機與暫停選單都關著），回傳那一刻的狀態。
 * 放開按鍵後 Phaser 要到下一幀才讀到 keyup，這段期間角色還在走，所以量「放開後滑多遠」要等到這裡。
 */
async function settle(page: Page): Promise<PlayerProbeSnapshot> {
	const snapshot = await page.evaluate(
		(key) =>
			new Promise<PlayerProbeSnapshot | null>((resolve) => {
				const probe = (window as unknown as Record<string, { read(): PlayerProbeSnapshot } | undefined>)[key];
				if (probe === undefined) {
					resolve(null);
					return;
				}
				const startedAt = performance.now();
				let previous = probe.read();
				let stableFrames = 0;
				const tick = (): void => {
					const current = probe.read();
					if (current.x === previous.x && current.y === previous.y && current.inputEnabled) {
						stableFrames += 1;
					} else {
						stableFrames = 0;
					}
					previous = current;
					// 畫面完全不更新時最多等 5 秒，交給呼叫端判斷
					if (stableFrames >= 3 || performance.now() - startedAt > 5000) {
						resolve(current);
						return;
					}
					requestAnimationFrame(tick);
				};
				requestAnimationFrame(tick);
			}),
		PLAYER_PROBE_KEY,
	);
	if (snapshot === null) {
		throw new Error(MISSING_PROBE_MESSAGE);
	}
	if (!snapshot.inputEnabled) {
		throw new Error("角色目前不能操作（終端機或暫停選單開著），不能走路");
	}
	return snapshot;
}

/**
 * 在頁面裡逐幀（requestAnimationFrame）讀座標，任一軸到了放開點、卡住、或逾時就回傳。
 * 判斷放在頁面裡是為了省掉 Playwright 每輪來回的延遲：「到了」最多晚一幀偵測到。
 */
async function watchUntilReleasePoint(page: Page, plan: WatchPlan): Promise<WatchResult> {
	const result = await page.evaluate(
		(watch) =>
			new Promise<WatchResult | null>((resolve) => {
				const probe = (window as unknown as Record<string, { read(): PlayerProbeSnapshot } | undefined>)[watch.probeKey];
				if (probe === undefined) {
					resolve(null);
					return;
				}
				const origin = probe.read();
				const startedAt = performance.now();
				let lastMoveAt = startedAt;
				let last = origin;
				let frames = 0;
				const axisReached = (sign: number, target: number, current: number, start: number, release: number): boolean => {
					if (sign === 0) {
						return false;
					}
					const remaining = (target - current) * sign;
					// 至少真的動過半個像素才算：放開點比起點還近時（預估會滑過頭）也要先走一點，
					// 不然 keydown 與 keyup 落在同一幀，Phaser 讀不到按下，等於沒按
					const moved = (current - start) * sign;
					return remaining <= release && moved >= 0.5;
				};
				const tick = (): void => {
					const current = probe.read();
					const now = performance.now();
					frames += 1;
					if (!current.inputEnabled) {
						resolve({ reason: "input-disabled", x: current.x, y: current.y });
						return;
					}
					if (Math.abs(current.x - last.x) > 0.25 || Math.abs(current.y - last.y) > 0.25) {
						lastMoveAt = now;
					}
					last = current;
					const reachedX = axisReached(watch.signX, watch.targetX, current.x, origin.x, watch.releaseX);
					const reachedY = axisReached(watch.signY, watch.targetY, current.y, origin.y, watch.releaseY);
					if (reachedX || reachedY) {
						resolve({ reason: "reached", x: current.x, y: current.y });
						return;
					}
					// 卡住：按著鍵但座標一段時間沒動，而且這段期間畫面真的有在更新（不是整個瀏覽器停住）
					if (frames >= 10 && now - lastMoveAt > watch.stuckMs) {
						resolve({ reason: "stuck", x: current.x, y: current.y });
						return;
					}
					if (now - startedAt > watch.maxMs) {
						resolve({ reason: "timeout", x: current.x, y: current.y });
						return;
					}
					requestAnimationFrame(tick);
				};
				requestAnimationFrame(tick);
			}),
		plan,
	);
	if (result === null) {
		throw new Error(MISSING_PROBE_MESSAGE);
	}
	return result;
}

/** 依剩餘距離決定這一軸要按哪個鍵；已經在容錯內就不按。 */
function keyForAxis(delta: number, tolerance: number, negativeKey: ArrowKey, positiveKey: ArrowKey): ArrowKey | null {
	if (Math.abs(delta) <= tolerance) {
		return null;
	}
	if (delta > 0) {
		return positiveKey;
	}
	return negativeKey;
}

/** 方向鍵換成座標軸上的方向：右、下是 1，左、上是 -1，沒按是 0。 */
function signOf(key: ArrowKey | null): number {
	if (key === null) {
		return 0;
	}
	if (key === "ArrowRight" || key === "ArrowDown") {
		return 1;
	}
	return -1;
}

/** 按住一組鍵，等到放開點（或卡住、逾時）再全部放開，回傳等待結果與停穩後的狀態。 */
async function pressUntil(
	page: Page,
	keys: readonly ArrowKey[],
	plan: WatchPlan,
): Promise<{ watch: WatchResult; settled: PlayerProbeSnapshot }> {
	for (const key of keys) {
		await page.keyboard.down(key);
	}
	let watch: WatchResult;
	try {
		watch = await watchUntilReleasePoint(page, plan);
	} finally {
		for (const key of keys) {
			await page.keyboard.up(key);
		}
	}
	const settled = await settle(page);
	return { watch, settled };
}

/** `E2E_WALK_DEBUG=1` 時印出每段路走了幾輪、卡住幾次、滑行估計值，查 flaky 用。 */
function logWalk(message: string): void {
	if (process.env.E2E_WALK_DEBUG) {
		console.log(`[walk] ${message}`);
	}
}

/** 一段路最多修正幾輪；正常一到三輪，超過代表放開時機一直抓不準或被擋住。 */
const MAX_STEER_ROUNDS = 40;
/** 一段路最多卡住幾次就放棄。 */
const MAX_STUCK = 4;

/**
 * 閉環走到一個路徑點：每一輪看兩軸各差多少，差超過容錯的軸按住對應方向鍵，
 * 在頁面裡逐幀等到「剩下距離 ≤ 預估滑行距離」就全部放開，停穩後量實際滑了多遠修正預估，再判斷一次。
 *
 * 卡住（按著鍵座標不動）時脫困：只按一軸卡住多半是另一軸差一點點沒對準門（例如差 6.01 px），
 * 先把另一軸精確對準（容錯 2）再繼續；兩軸都按著還卡住就往垂直反方向退一小段再試。
 */
async function steerTo(page: Page, waypoint: Waypoint): Promise<PlayerProbeSnapshot> {
	const coast = coastOf(page);
	let state = await settle(page);
	let stuckCount = 0;
	for (let round = 0; round < MAX_STEER_ROUNDS; round += 1) {
		const keyX = keyForAxis(waypoint.x - state.x, waypoint.toleranceX, "ArrowLeft", "ArrowRight");
		const keyY = keyForAxis(waypoint.y - state.y, waypoint.toleranceY, "ArrowUp", "ArrowDown");
		if (keyX === null && keyY === null) {
			logWalk(
				`${waypoint.label}：${round} 輪、卡住 ${stuckCount} 次，停在 (${state.x.toFixed(1)}, ${state.y.toFixed(1)})，滑行估計 x ${coast.x.toFixed(1)}／y ${coast.y.toFixed(1)}`,
			);
			return state;
		}

		const keys: ArrowKey[] = [];
		if (keyX !== null) {
			keys.push(keyX);
		}
		if (keyY !== null) {
			keys.push(keyY);
		}
		const plan: WatchPlan = {
			probeKey: PLAYER_PROBE_KEY,
			targetX: waypoint.x,
			targetY: waypoint.y,
			signX: signOf(keyX),
			signY: signOf(keyY),
			releaseX: coast.x,
			releaseY: coast.y,
			stuckMs: 800,
			maxMs: 8000,
		};
		const { watch, settled } = await pressUntil(page, keys, plan);
		state = settled;

		if (watch.reason === "reached") {
			if (plan.signX !== 0) {
				coast.x = updateCoast(coast.x, (settled.x - watch.x) * plan.signX);
			}
			if (plan.signY !== 0) {
				coast.y = updateCoast(coast.y, (settled.y - watch.y) * plan.signY);
			}
		}

		if (watch.reason === "stuck") {
			stuckCount += 1;
			if (stuckCount > MAX_STUCK) {
				break;
			}
			state = await unstick(page, state, waypoint, keyX, keyY);
		}
	}
	throw new Error(
		`走不到路徑點「${waypoint.label}」(${waypoint.x}, ${waypoint.y})，角色停在 (${state.x.toFixed(1)}, ${state.y.toFixed(1)})，艙區 ${state.roomId ?? "門框"}`,
	);
}

/** 脫困用的一小步：只動一軸、容錯 2，再卡住就不硬推，交回上一層重新判斷。 */
async function nudgeAxis(page: Page, state: PlayerProbeSnapshot, axis: "x" | "y", target: number): Promise<PlayerProbeSnapshot> {
	const coast = coastOf(page);
	let current = state;
	for (let attempt = 0; attempt < 6; attempt += 1) {
		let key: ArrowKey | null;
		if (axis === "x") {
			key = keyForAxis(target - current.x, 2, "ArrowLeft", "ArrowRight");
		} else {
			key = keyForAxis(target - current.y, 2, "ArrowUp", "ArrowDown");
		}
		if (key === null) {
			return current;
		}
		let signX = 0;
		let signY = 0;
		if (axis === "x") {
			signX = signOf(key);
		} else {
			signY = signOf(key);
		}
		const plan: WatchPlan = {
			probeKey: PLAYER_PROBE_KEY,
			targetX: target,
			targetY: target,
			signX,
			signY,
			releaseX: coast.x,
			releaseY: coast.y,
			stuckMs: 500,
			maxMs: 3000,
		};
		const { watch, settled } = await pressUntil(page, [key], plan);
		current = settled;
		if (watch.reason === "stuck") {
			return current;
		}
	}
	return current;
}

async function unstick(
	page: Page,
	state: PlayerProbeSnapshot,
	waypoint: Waypoint,
	keyX: ArrowKey | null,
	keyY: ArrowKey | null,
): Promise<PlayerProbeSnapshot> {
	if (keyX === null) {
		return nudgeAxis(page, state, "x", waypoint.x);
	}
	if (keyY === null) {
		return nudgeAxis(page, state, "y", waypoint.y);
	}
	// 兩軸都按著還不動：卡在牆角，往垂直方向的反向退 16 px
	let backOffY = state.y + 16;
	if (keyY === "ArrowDown") {
		backOffY = state.y - 16;
	}
	return nudgeAxis(page, state, "y", backOffY);
}

/** 一次走路最多幾段；最遠的路線（上排房 → 另一間上排房）是五段，多留重新規劃的空間。 */
const MAX_LEGS = 16;

/** 閉環走到目的地：每一段都從目前座標重新規劃下一個路徑點。 */
async function walkTo(page: Page, destination: Destination): Promise<PlayerProbeSnapshot> {
	let state = await settle(page);
	for (let leg = 0; leg < MAX_LEGS; leg += 1) {
		const waypoint = nextWaypoint(state, destination);
		if (waypoint === null) {
			return state;
		}
		state = await steerTo(page, waypoint);
	}
	throw new Error(
		`走不到 ${destination.slot} 的 (${destination.x}, ${destination.y})，角色停在 (${state.x.toFixed(1)}, ${state.y.toFixed(1)})`,
	);
}

/** 走到走廊中線上的某一點（x 介於 80 到 1100），存檔位置之類不需要終端機的測試用。 */
export async function walkToCorridor(page: Page, x: number): Promise<void> {
	await walkTo(page, { slot: "corridor", x, y: CORRIDOR_LANE_Y, tolerance: 16 });
}

/**
 * 走到第 `index` 台（0 起算，T1 是 0）終端機前，以 HUD 出現「按 E 開啟 {title}」為準。
 * 終端機在六個甲板的位置都一樣，所以只要知道是第幾台。
 */
export async function walkToTerminal(page: Page, index: number, title: string): Promise<void> {
	const slot = TERMINAL_SLOTS[index];
	const spot = SLOT_GEOMETRY[slot].terminal;
	if (spot === null) {
		throw new Error(`第 ${index + 1} 台終端機所在的 ${slot} 沒有終端機`);
	}
	await walkTo(page, { slot, x: spot.x, y: spot.y, tolerance: TERMINAL_TOLERANCE });
	const hint = page.getByTestId("interact-hint");
	const expected = `按 E 開啟 ${title}`;
	// 提示由 Phaser 的 terminal:nearby 經 React state 顯示，會晚一兩幀。元素不存在時 textContent 預設無限等待，要給逾時；
	// 沒對上就用更小的容錯再站一次
	const text = await hint.textContent({ timeout: 2000 }).catch(() => null);
	if (text !== expected) {
		await walkTo(page, { slot, x: spot.x, y: spot.y, tolerance: 4 });
	}
	await expect(hint).toHaveText(expected);
}

/** 已經站在終端機旁：按 E，打一串指令，確認目標數進到 solvedCount/6，再用 Esc 關掉。 */
export async function solveTerminal(
	page: Page,
	commands: readonly string[],
	solvedCount: number,
): Promise<void> {
	await page.keyboard.press("e");
	await expect(page.getByTestId("terminal-modal")).toBeVisible();
	const input = page.getByLabel("指令輸入");
	await expect(input).toBeFocused();
	for (const command of commands) {
		await input.fill(command);
		await input.press("Enter");
	}
	await expect(page.getByTestId("objective-progress")).toHaveText(`${solvedCount}/${TERMINALS_PER_CHAPTER}`);
	await expect(page.getByText("O2 100%")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("terminal-modal")).toBeHidden();
	// 關掉終端機的那一下 Esc 不該順便打開暫停選單
	await page.waitForTimeout(300);
	await expect(page.getByTestId("pause-menu")).toHaveCount(0);
}

/** 一台終端機的 e2e 腳本：標題（跟 HUD 的「按 E 開啟 ○○」比對）與正解指令。 */
export interface TerminalScript {
	title: string;
	commands: readonly string[];
}

/**
 * 依 T1 到 T6 的標題組出一章的腳本，正解指令取自 `src/game/chapters/solutions.ts`（單元測試用真的 Shell 驗過同一份）。
 * 第 `index` 個標題對應終端機 `ch<chapter>-t<index+1>`。
 */
export function terminalScripts(chapter: number, titles: readonly string[]): TerminalScript[] {
	return titles.map((title, index) => ({ title, commands: solutionFor(`ch${chapter}-t${index + 1}`) }));
}

/**
 * 從甲板上任何位置照 T1 到 T6 的順序走完一章、每台都解掉；走到每台時順便確認 HUD 的艙區名對得上。
 * 六台都解完後章節結束畫面會自己出現。
 */
export async function playChapter(page: Page, chapter: number, scripts: readonly TerminalScript[]): Promise<void> {
	expect(scripts).toHaveLength(TERMINALS_PER_CHAPTER);
	const rooms = DECK_ROOMS[chapter];
	for (const [index, script] of scripts.entries()) {
		await walkToTerminal(page, index, script.title);
		await expect(page.getByTestId("hud-room")).toHaveText(ROOM_NAMES[rooms[TERMINAL_SLOTS[index]]]);
		await solveTerminal(page, script.commands, index + 1);
	}
}

/** 進 /play，等 Station 場景就緒，點畫布拿焦點。 */
export async function enterPlay(page: Page): Promise<void> {
	await page.goto("/play");
	await expect(page.locator("main[data-scene-ready='true']")).toBeAttached({ timeout: 20000 });
	await page.locator("canvas").click();
	// 場景剛就緒的第一幀鍵盤可能還沒接上，稍等再按
	await page.waitForTimeout(300);
}

/** 存檔種子的選項。 */
export interface SeedOptions {
	chapter: number;
	/** 已過關的終端機 id，預設把前幾章全部標成過關。 */
	solvedTerminals?: string[];
	/** 額外旗標；前幾章的 introShown／outroShown 會自動帶上。 */
	flags?: string[];
	/** 已學指令，預設空。 */
	learnedCommands?: string[];
}

/**
 * 直接寫一份「已經玩到第 N 章開頭」的存檔進 localStorage，略過前面幾章。
 * 格式跟 `src/game/store/gameStore.ts` 的 persist 一致（`{ state, version }`）。刻意寫 v1（沒有 `furthestChapter`、`position`），
 * 讀檔時走 migrate 一路升到目前版本（v3），順便在真瀏覽器裡驗證舊存檔讀得進來。
 */
export async function seedSave(page: Page, options: SeedOptions): Promise<void> {
	const solvedTerminals = options.solvedTerminals ?? [];
	const flags: Record<string, true> = {};
	for (let chapter = 1; chapter < options.chapter; chapter += 1) {
		flags[`ch${chapter}.introShown`] = true;
		flags[`ch${chapter}.outroShown`] = true;
		if (options.solvedTerminals === undefined) {
			for (let index = 1; index <= TERMINALS_PER_CHAPTER; index += 1) {
				solvedTerminals.push(`ch${chapter}-t${index}`);
			}
		}
	}
	for (const flag of options.flags ?? []) {
		flags[flag] = true;
	}
	const save = {
		state: {
			progress: {
				chapter: options.chapter,
				character: "a",
				solvedTerminals,
				learnedCommands: options.learnedCommands ?? [],
				oxygen: 100,
				savedAt: new Date().toISOString(),
			},
			settings: {
				textSpeed: "instant",
				flickerEnabled: true,
				scanlinesEnabled: true,
				vignetteEnabled: true,
				volume: 0.8,
				muted: true,
			},
			terminals: {},
			storyFlags: flags,
		},
		version: 1,
	};
	await page.goto("/");
	await page.evaluate((json) => {
		window.localStorage.clear();
		window.localStorage.setItem("kepler9-save", json);
	}, JSON.stringify(save));
}

/**
 * 走完章節結束畫面：outro 逐句 Enter 到回顧卡，確認標題與回顧卡裡有某個指令，按「繼續」。
 * 回傳後停在 done（有下一章）或 ending（最後一章）階段，由呼叫端決定下一步。
 */
export async function passChapterEnd(page: Page, chapter: number, title: string, recapCommand: string): Promise<void> {
	const chapterEnd = page.getByTestId("chapter-end-screen");
	await expect(chapterEnd).toBeVisible();
	const recap = page.getByTestId("chapter-end-recap");
	for (let presses = 0; presses < 12 && !(await recap.isVisible()); presses += 1) {
		await page.keyboard.press("Enter");
		await page.waitForTimeout(300);
	}
	await expect(recap).toBeVisible();
	await expect(recap).toContainText(`第 ${chapter} 章 ${title} 完成`);
	await expect(recap.getByRole("list")).toContainText(recapCommand);
	await recap.getByRole("button", { name: "繼續" }).click();
}
