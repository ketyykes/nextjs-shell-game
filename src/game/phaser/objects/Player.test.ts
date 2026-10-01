// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PLAYER_SPEED } from "../constants";
import { resolveMovement, type MovementInput } from "./movement";

/** 建立按鍵狀態，沒指定的方向視為沒按。 */
function keys(pressed: Partial<MovementInput>): MovementInput {
	return { up: false, down: false, left: false, right: false, ...pressed };
}

describe("resolveMovement", () => {
	describe("單方向移動", () => {
		it("只按上：往上走、速度等於 speed、面向上", () => {
			expect(resolveMovement(keys({ up: true }), PLAYER_SPEED)).toEqual({
				vx: 0,
				vy: -PLAYER_SPEED,
				direction: "up",
				moving: true,
			});
		});

		it("只按下：往下走、面向下", () => {
			const result = resolveMovement(keys({ down: true }), PLAYER_SPEED);
			expect(result.vx).toBe(0);
			expect(result.vy).toBe(PLAYER_SPEED);
			expect(result.direction).toBe("down");
		});

		it("只按左：往左走、面向左", () => {
			const result = resolveMovement(keys({ left: true }), PLAYER_SPEED);
			expect(result.vx).toBe(-PLAYER_SPEED);
			expect(result.vy).toBe(0);
			expect(result.direction).toBe("left");
		});

		it("只按右：往右走、面向右", () => {
			const result = resolveMovement(keys({ right: true }), PLAYER_SPEED);
			expect(result.vx).toBe(PLAYER_SPEED);
			expect(result.vy).toBe(0);
			expect(result.direction).toBe("right");
		});
	});

	describe("斜向移動", () => {
		it.each([
			["右下", keys({ right: true, down: true }), 1, 1],
			["右上", keys({ right: true, up: true }), 1, -1],
			["左下", keys({ left: true, down: true }), -1, 1],
			["左上", keys({ left: true, up: true }), -1, -1],
		])("%s：合速度長度等於 speed，兩軸方向正確", (_label, input, signX, signY) => {
			const result = resolveMovement(input, PLAYER_SPEED);
			expect(Math.hypot(result.vx, result.vy)).toBeCloseTo(PLAYER_SPEED, 10);
			expect(Math.sign(result.vx)).toBe(signX);
			expect(Math.sign(result.vy)).toBe(signY);
			expect(Math.abs(result.vx)).toBeCloseTo(Math.abs(result.vy), 10);
			expect(result.moving).toBe(true);
		});
	});

	describe("相反方向互相抵消", () => {
		it("左右同時按：水平抵消，沒有移動", () => {
			expect(resolveMovement(keys({ left: true, right: true }), PLAYER_SPEED)).toEqual({
				vx: 0,
				vy: 0,
				direction: null,
				moving: false,
			});
		});

		it("上下同時按：垂直抵消，沒有移動", () => {
			const result = resolveMovement(keys({ up: true, down: true }), PLAYER_SPEED);
			expect(result.moving).toBe(false);
			expect(result.direction).toBeNull();
		});

		it("左右同時按再加上：只剩往上，速度是完整的 speed", () => {
			const result = resolveMovement(keys({ left: true, right: true, up: true }), PLAYER_SPEED);
			expect(result.vx).toBe(0);
			expect(result.vy).toBe(-PLAYER_SPEED);
			expect(result.direction).toBe("up");
		});

		it("四個方向全按：完全抵消", () => {
			const result = resolveMovement(
				keys({ up: true, down: true, left: true, right: true }),
				PLAYER_SPEED,
			);
			expect(result.moving).toBe(false);
		});
	});

	describe("沒按鍵", () => {
		it("moving 為 false、direction 為 null、速度為 0", () => {
			expect(resolveMovement(keys({}), PLAYER_SPEED)).toEqual({
				vx: 0,
				vy: 0,
				direction: null,
				moving: false,
			});
		});

		it("有傳目前面向也一樣回傳 null，由呼叫端保留原面向", () => {
			const result = resolveMovement(keys({}), PLAYER_SPEED, "left");
			expect(result.direction).toBeNull();
		});
	});

	describe("面向判定", () => {
		it("沒有目前面向時，斜向走水平優先", () => {
			expect(resolveMovement(keys({ up: true, right: true }), PLAYER_SPEED).direction).toBe("right");
			expect(resolveMovement(keys({ down: true, left: true }), PLAYER_SPEED).direction).toBe("left");
		});

		it("目前面向仍在移動方向之內時維持不變（往上走時補按右鍵仍面向上）", () => {
			const result = resolveMovement(keys({ up: true, right: true }), PLAYER_SPEED, "up");
			expect(result.direction).toBe("up");
		});

		it("目前面向不在移動方向之內時改用水平優先", () => {
			const result = resolveMovement(keys({ up: true, right: true }), PLAYER_SPEED, "down");
			expect(result.direction).toBe("right");
		});

		it("單方向移動時一律轉向該方向", () => {
			const result = resolveMovement(keys({ left: true }), PLAYER_SPEED, "right");
			expect(result.direction).toBe("left");
		});

		it("被抵消掉的方向不算數：左右都按加上，面向右也要轉成上", () => {
			const result = resolveMovement(keys({ left: true, right: true, up: true }), PLAYER_SPEED, "right");
			expect(result.direction).toBe("up");
		});
	});
});
