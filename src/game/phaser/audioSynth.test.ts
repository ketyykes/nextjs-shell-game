// @vitest-environment node
/**
 * 第二批自產音效的合成腳本（`scripts/synth-audio.mjs`，設計文件 4.25）：只測合成出來的取樣，
 * 轉檔（ffmpeg）與寫檔不在單元測試裡跑。
 */

import { describe, expect, it } from "vitest";
import {
	encodeWav,
	HEARTBEAT_LOOP_SECONDS,
	HEARTBEAT_LUB_DUB_GAP_SECONDS,
	HEARTBEAT_PEAK_DBFS,
	SAMPLE_RATE,
	synthHeartbeat,
	synthWhisper,
	WHISPER_PEAK_DBFS,
	WHISPER_SECONDS,
} from "../../../scripts/synth-audio.mjs";

function peakOf(samples: Float32Array, from = 0, to = samples.length): number {
	let peak = 0;
	for (let index = from; index < to; index += 1) {
		peak = Math.max(peak, Math.abs(samples[index]));
	}
	return peak;
}

function dbToGain(db: number): number {
	return 10 ** (db / 20);
}

/** Goertzel：某個頻率在這段取樣裡的能量（相對值）。 */
function powerAt(samples: Float32Array, frequency: number, from = 0, to = samples.length): number {
	const coefficient = 2 * Math.cos((2 * Math.PI * frequency) / SAMPLE_RATE);
	let previous = 0;
	let beforePrevious = 0;
	for (let index = from; index < to; index += 1) {
		const current = samples[index] + coefficient * previous - beforePrevious;
		beforePrevious = previous;
		previous = current;
	}
	return previous * previous + beforePrevious * beforePrevious - coefficient * previous * beforePrevious;
}

/** 這段裡絕對值最大的取樣位置（秒）。 */
function peakSeconds(samples: Float32Array, from: number, to: number): number {
	let best = from;
	for (let index = from; index < to; index += 1) {
		if (Math.abs(samples[index]) > Math.abs(samples[best])) {
			best = index;
		}
	}
	return best / SAMPLE_RATE;
}

/** 從 `from` 起第一個超過門檻的取樣位置（秒）。 */
function onsetSeconds(samples: Float32Array, threshold: number, from: number): number {
	for (let index = from; index < samples.length; index += 1) {
		if (Math.abs(samples[index]) > threshold) {
			return index / SAMPLE_RATE;
		}
	}
	return Number.POSITIVE_INFINITY;
}

describe("synthHeartbeat（心跳）", () => {
	const samples = synthHeartbeat();
	const peak = peakOf(samples);

	it("一個循環約 1 秒", () => {
		expect(HEARTBEAT_LOOP_SECONDS).toBeGreaterThanOrEqual(0.9);
		expect(HEARTBEAT_LOOP_SECONDS).toBeLessThanOrEqual(1.1);
		expect(samples.length).toBe(Math.round(HEARTBEAT_LOOP_SECONDS * SAMPLE_RATE));
	});

	it("峰值正規化到設定的 dBFS", () => {
		expect(peak).toBeCloseTo(dbToGain(HEARTBEAT_PEAK_DBFS), 3);
	});

	it("頭尾都是靜音，循環接縫不會爆音", () => {
		expect(Math.abs(samples[0])).toBeLessThan(0.001);
		expect(peakOf(samples, samples.length - Math.round(0.05 * SAMPLE_RATE))).toBeLessThan(0.001);
	});

	it("兩下脈衝（lub-dub）間隔約 0.18 秒，第二下比較小聲", () => {
		// 第一下的尾巴還沒衰減完第二下就來了，所以比兩段裡各自最響的位置
		const split = Math.round(0.15 * SAMPLE_RATE);
		const lub = peakSeconds(samples, 0, split);
		const dub = peakSeconds(samples, split, Math.round(0.45 * SAMPLE_RATE));
		expect(onsetSeconds(samples, peak * 0.05, 0)).toBeLessThan(lub);
		expect(HEARTBEAT_LUB_DUB_GAP_SECONDS).toBeCloseTo(0.18, 2);
		expect(dub - lub).toBeGreaterThan(0.15);
		expect(dub - lub).toBeLessThan(0.21);
		expect(peakOf(samples, split, Math.round(0.45 * SAMPLE_RATE))).toBeLessThan(peak * 0.9);
	});

	it("主要能量在 55 到 65 Hz", () => {
		let bestFrequency = 0;
		let bestPower = -1;
		for (let frequency = 30; frequency <= 250; frequency += 1) {
			const power = powerAt(samples, frequency);
			if (power > bestPower) {
				bestPower = power;
				bestFrequency = frequency;
			}
		}
		expect(bestFrequency).toBeGreaterThanOrEqual(55);
		expect(bestFrequency).toBeLessThanOrEqual(65);
	});

	it("後半秒幾乎沒聲音（兩下之間的停頓）", () => {
		expect(peakOf(samples, Math.round(0.6 * SAMPLE_RATE))).toBeLessThan(peak * 0.05);
	});
});

describe("synthWhisper（NOVA 低語）", () => {
	const samples = synthWhisper();
	const peak = peakOf(samples);

	it("約 2 秒", () => {
		expect(WHISPER_SECONDS).toBeGreaterThanOrEqual(1.5);
		expect(WHISPER_SECONDS).toBeLessThanOrEqual(2.5);
		expect(samples.length).toBe(Math.round(WHISPER_SECONDS * SAMPLE_RATE));
	});

	it("峰值正規化到設定的 dBFS", () => {
		expect(peak).toBeCloseTo(dbToGain(WHISPER_PEAK_DBFS), 3);
	});

	it("淡入淡出：頭尾都很小聲", () => {
		const edge = Math.round(0.02 * SAMPLE_RATE);
		expect(peakOf(samples, 0, edge)).toBeLessThan(peak * 0.1);
		expect(peakOf(samples, samples.length - edge)).toBeLessThan(peak * 0.1);
	});

	it("能量集中在 300 到 1500 Hz，高頻嘶聲與低頻都弱得多", () => {
		const inBand = [400, 700, 1000, 1300].reduce((sum, frequency) => sum + powerAt(samples, frequency), 0);
		const high = [4000, 6000, 9000, 12000].reduce((sum, frequency) => sum + powerAt(samples, frequency), 0);
		const low = [40, 60, 80, 100].reduce((sum, frequency) => sum + powerAt(samples, frequency), 0);
		expect(inBand / high).toBeGreaterThan(20);
		expect(inBand / low).toBeGreaterThan(5);
	});

	it("有緩慢的調幅（像幾個音節），不是一整片平的噪音", () => {
		const window = Math.round(0.05 * SAMPLE_RATE);
		const levels: number[] = [];
		const from = Math.round(0.4 * SAMPLE_RATE);
		const to = samples.length - Math.round(0.5 * SAMPLE_RATE);
		for (let start = from; start + window <= to; start += window) {
			levels.push(peakOf(samples, start, start + window));
		}
		expect(Math.max(...levels) / Math.min(...levels)).toBeGreaterThan(2);
	});

	it("用固定種子，每次合成一模一樣（重跑腳本不會換掉音檔）", () => {
		expect(synthWhisper()).toEqual(samples);
	});
});

describe("encodeWav", () => {
	it("16-bit PCM 單聲道 WAV：RIFF 標頭、取樣率、資料長度對得上，滿幅夾住不溢位", () => {
		const samples = new Float32Array([0, 0.5, -0.5, 1, -1, 2]);
		const wav = encodeWav(samples, SAMPLE_RATE);
		expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
		expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
		expect(wav.toString("ascii", 12, 16)).toBe("fmt ");
		expect(wav.readUInt16LE(20)).toBe(1);
		expect(wav.readUInt16LE(22)).toBe(1);
		expect(wav.readUInt32LE(24)).toBe(SAMPLE_RATE);
		expect(wav.readUInt16LE(34)).toBe(16);
		expect(wav.toString("ascii", 36, 40)).toBe("data");
		expect(wav.readUInt32LE(40)).toBe(samples.length * 2);
		expect(wav.length).toBe(44 + samples.length * 2);
		expect(wav.readInt16LE(44 + 3 * 2)).toBe(32767);
		expect(wav.readInt16LE(44 + 5 * 2)).toBe(32767);
		expect(wav.readInt16LE(44 + 4 * 2)).toBe(-32767);
	});
});
