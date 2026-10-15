// @vitest-environment node
import { describe, expect, it } from "vitest";
import { OXYGEN_CRITICAL_THRESHOLD, OXYGEN_LOW_THRESHOLD } from "@/game/store/selectors";
import { OXYGEN_MIN } from "@/game/store/types";
import {
	displayInstabilityFor,
	GLITCH_RATE_MAX,
	GLITCH_RATE_MIN,
	glitchRateFor,
	heartbeatFor,
	isOxygenCritical,
	shouldWhisperOnRoomEnter,
} from "./lowOxygen";

describe("低氧門檻", () => {
	it("顯示不穩的門檻是 20%，比 30% 的暗角低", () => {
		expect(OXYGEN_CRITICAL_THRESHOLD).toBe(20);
		expect(OXYGEN_CRITICAL_THRESHOLD).toBeLessThan(OXYGEN_LOW_THRESHOLD);
	});

	it("低於 20% 才算，剛好 20% 不算", () => {
		expect(isOxygenCritical(20)).toBe(false);
		expect(isOxygenCritical(19)).toBe(true);
		expect(isOxygenCritical(OXYGEN_MIN)).toBe(true);
		expect(isOxygenCritical(100)).toBe(false);
	});
});

describe("glitchRateFor（亂碼比例）", () => {
	it("20% 以上是 0", () => {
		expect(glitchRateFor(100)).toBe(0);
		expect(glitchRateFor(30)).toBe(0);
		expect(glitchRateFor(20)).toBe(0);
	});

	it("19% 是最低比例 2%，最低氧氣 5% 是最高比例 8%", () => {
		expect(GLITCH_RATE_MIN).toBe(0.02);
		expect(GLITCH_RATE_MAX).toBe(0.08);
		expect(glitchRateFor(19)).toBeCloseTo(GLITCH_RATE_MIN);
		expect(glitchRateFor(OXYGEN_MIN)).toBeCloseTo(GLITCH_RATE_MAX);
	});

	it("氧氣越低比例越高，低於下限也不超過最高比例", () => {
		let previous = 0;
		for (let oxygen = 19; oxygen >= OXYGEN_MIN; oxygen -= 1) {
			const rate = glitchRateFor(oxygen);
			expect(rate).toBeGreaterThan(previous);
			previous = rate;
		}
		expect(glitchRateFor(0)).toBeCloseTo(GLITCH_RATE_MAX);
	});
});

describe("displayInstabilityFor", () => {
	it("20% 以上完全穩定", () => {
		expect(displayInstabilityFor(20)).toEqual({ glitchRate: 0, stutter: false });
	});

	it("低於 20% 時亂碼與斷句一起開", () => {
		const instability = displayInstabilityFor(12);
		expect(instability.glitchRate).toBeCloseTo(glitchRateFor(12));
		expect(instability.stutter).toBe(true);
	});
});

describe("heartbeatFor（心跳音量曲線）", () => {
	it("20% 以上不播", () => {
		expect(heartbeatFor(20)).toEqual({ active: false, intensity: 0 });
		expect(heartbeatFor(100)).toEqual({ active: false, intensity: 0 });
	});

	it("19% 開始播，強度從 0 起跳；最低氧氣 5% 是 1", () => {
		expect(heartbeatFor(19)).toEqual({ active: true, intensity: 0 });
		expect(heartbeatFor(OXYGEN_MIN)).toEqual({ active: true, intensity: 1 });
	});

	it("氧氣越低越大聲，夾在 0 到 1", () => {
		let previous = -1;
		for (let oxygen = 19; oxygen >= OXYGEN_MIN; oxygen -= 1) {
			const { intensity } = heartbeatFor(oxygen);
			expect(intensity).toBeGreaterThan(previous);
			expect(intensity).toBeLessThanOrEqual(1);
			previous = intensity;
		}
		expect(heartbeatFor(0).intensity).toBe(1);
	});
});

describe("shouldWhisperOnRoomEnter（第六章第一次進 NOVA 核心艙）", () => {
	it("第六章的 nv_core 才低語", () => {
		expect(shouldWhisperOnRoomEnter(6, "nv_core")).toBe(true);
	});

	it("別的艙區、別章不低語", () => {
		expect(shouldWhisperOnRoomEnter(6, "nv_entry")).toBe(false);
		expect(shouldWhisperOnRoomEnter(6, "nv_memory")).toBe(false);
		expect(shouldWhisperOnRoomEnter(1, "cryo")).toBe(false);
	});
});
