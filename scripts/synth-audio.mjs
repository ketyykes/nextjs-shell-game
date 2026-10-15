#!/usr/bin/env node
/**
 * 合成第二批音效（設計文件 4.25）：低氧心跳 `heartbeat` 與 NOVA 低語 `whisper`。
 *
 * 純 Node、不加相依：先算出取樣、寫成 16-bit PCM 單聲道 WAV（放暫存目錄，不進版控），
 * 再呼叫 ffmpeg 轉成 `public/audio/<name>.ogg` 與 `.mp3`（ogg 給大多數瀏覽器、mp3 給 Safari，跟第一版五種一樣）。
 * 亂數用固定種子，重跑產出的取樣一模一樣。授權聲明在 `public/audio/LICENSE-synth.txt`（CC0）。
 *
 * - 心跳：兩下低頻脈衝（lub 約 62 Hz、dub 約 56 Hz 的正弦加指數衰減，起音帶一點往下滑的音高），間隔 0.18 秒，
 *   一個循環 1 秒、結尾淡出，循環接縫不爆音。另疊一個小聲的二倍頻，筆電喇叭放不出 60 Hz 時還聽得到輪廓。
 * - 低語：白噪音經兩級二階帶通（RBJ biquad，中心約 670 Hz、涵蓋 300 到 1500 Hz），
 *   乘上幾個像音節的緩慢起伏與淡入淡出，約 2 秒；聽得出有人在說話、聽不出說什麼。
 *
 * 用法：
 *   pnpm audio:synth              # 兩個都產
 *   pnpm audio:synth heartbeat    # 只產指定的
 *   FFMPEG=/path/to/ffmpeg pnpm audio:synth   # 指定 ffmpeg（預設 /opt/homebrew/bin/ffmpeg，沒有就用 PATH 裡的）
 *
 * 音量：峰值正規化到下面的 dBFS，跟 Kenney 那五種（峰值約 -1 dB）相近；遊戲裡的實際音量由 `src/game/phaser/audio.ts` 再壓。
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {number} */
export const SAMPLE_RATE = 44100;

/** @type {number} 心跳一個循環的秒數（60 BPM）。 */
export const HEARTBEAT_LOOP_SECONDS = 1;
/** @type {number} lub 與 dub 起音的間隔。 */
export const HEARTBEAT_LUB_DUB_GAP_SECONDS = 0.18;
/** @type {number} */
export const HEARTBEAT_PEAK_DBFS = -1;

/** @type {number} */
export const WHISPER_SECONDS = 2;
/** @type {number} */
export const WHISPER_PEAK_DBFS = -3;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "audio");

// ---------------------------------------------------------------------------
// 共用
// ---------------------------------------------------------------------------

/** @type {(seed: number) => () => number} mulberry32：同一個種子產生同一串 0 到 1 的數。 */
const seededRandom = (seed) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
};

/** @type {(samples: Float32Array, peakDbfs: number) => Float32Array} 把峰值縮放到指定的 dBFS（原地修改並回傳）。 */
const normalizePeak = (samples, peakDbfs) => {
	let peak = 0;
	for (const sample of samples) {
		peak = Math.max(peak, Math.abs(sample));
	}
	if (peak === 0) {
		return samples;
	}
	const gain = 10 ** (peakDbfs / 20) / peak;
	for (let index = 0; index < samples.length; index += 1) {
		samples[index] *= gain;
	}
	return samples;
};

/** @type {(progress: number) => number} 0 到 1 的升餘弦曲線，淡入淡出用，兩端斜率是 0。 */
const raisedCosine = (progress) => {
	const clamped = Math.min(1, Math.max(0, progress));
	return 0.5 - 0.5 * Math.cos(Math.PI * clamped);
};

/** @type {(samples: Float32Array, fadeInSeconds: number, fadeOutSeconds: number) => void} */
const applyFades = (samples, fadeInSeconds, fadeOutSeconds) => {
	const fadeIn = Math.round(fadeInSeconds * SAMPLE_RATE);
	const fadeOut = Math.round(fadeOutSeconds * SAMPLE_RATE);
	for (let index = 0; index < samples.length; index += 1) {
		let gain = 1;
		if (index < fadeIn) {
			gain *= raisedCosine(index / fadeIn);
		}
		const fromEnd = samples.length - 1 - index;
		if (fromEnd < fadeOut) {
			gain *= raisedCosine(fromEnd / fadeOut);
		}
		samples[index] *= gain;
	}
};

// ---------------------------------------------------------------------------
// 心跳
// ---------------------------------------------------------------------------

/**
 * @typedef {object} HeartPulse
 * @property {number} start 起音時間（秒）
 * @property {number} frequency 基頻（Hz）
 * @property {number} amplitude 相對大小
 * @property {number} decay 指數衰減的時間常數（秒）
 */

/** @type {HeartPulse[]} lub 大聲一點、dub 小一點也短一點。 */
const HEART_PULSES = [
	{ start: 0.03, frequency: 62, amplitude: 1, decay: 0.075 },
	{ start: 0.03 + HEARTBEAT_LUB_DUB_GAP_SECONDS, frequency: 56, amplitude: 0.72, decay: 0.06 },
];
/** @type {number} 起音的線性上升時間，避免方波似的喀一聲。 */
const PULSE_ATTACK_SECONDS = 0.006;
/** @type {number} 起音時音高往上偏多少（比例），很快滑回基頻，聽起來像「咚」而不是「嗡」。 */
const PULSE_PITCH_DROP = 0.18;
const PULSE_PITCH_DROP_SECONDS = 0.025;
/** @type {number} 二倍頻的相對大小，給小喇叭聽輪廓。 */
const PULSE_HARMONIC = 0.3;

/** @type {(pulse: HeartPulse, samples: Float32Array) => void} 把一下脈衝加進取樣。 */
const addPulse = (pulse, samples) => {
	const startIndex = Math.round(pulse.start * SAMPLE_RATE);
	let phase = 0;
	for (let index = startIndex; index < samples.length; index += 1) {
		const elapsed = (index - startIndex) / SAMPLE_RATE;
		const envelope =
			pulse.amplitude * Math.min(1, elapsed / PULSE_ATTACK_SECONDS) * Math.exp(-elapsed / pulse.decay);
		if (elapsed > pulse.decay * 14) {
			break;
		}
		const frequency = pulse.frequency * (1 + PULSE_PITCH_DROP * Math.exp(-elapsed / PULSE_PITCH_DROP_SECONDS));
		phase += (2 * Math.PI * frequency) / SAMPLE_RATE;
		samples[index] += envelope * (Math.sin(phase) + PULSE_HARMONIC * Math.sin(2 * phase));
	}
};

/** @type {() => Float32Array} 一個 1 秒的心跳循環（lub-dub 加停頓），峰值 `HEARTBEAT_PEAK_DBFS`。 */
export const synthHeartbeat = () => {
	const samples = new Float32Array(Math.round(HEARTBEAT_LOOP_SECONDS * SAMPLE_RATE));
	for (const pulse of HEART_PULSES) {
		addPulse(pulse, samples);
	}
	// 尾巴本來就衰減完了，淡出只是保險：循環接回開頭的靜音時不會有落差
	applyFades(samples, 0.002, 0.05);
	return normalizePeak(samples, HEARTBEAT_PEAK_DBFS);
};

// ---------------------------------------------------------------------------
// 低語
// ---------------------------------------------------------------------------

/** @type {number} 帶通的下緣與上緣（Hz），中心取幾何平均。 */
const WHISPER_LOW_HZ = 300;
const WHISPER_HIGH_HZ = 1500;
/** @type {number} 固定種子：重跑腳本產出同一個檔案。 */
const WHISPER_SEED = 0x4b39;

/**
 * @typedef {object} Biquad
 * @property {number} b0
 * @property {number} b1
 * @property {number} b2
 * @property {number} a1
 * @property {number} a2
 */

/** @type {(low: number, high: number) => Biquad} RBJ cookbook 的帶通（峰值增益 0 dB），已除以 a0。 */
const bandPass = (low, high) => {
	const center = Math.sqrt(low * high);
	const octaves = Math.log2(high / low);
	const q = Math.sqrt(2 ** octaves) / (2 ** octaves - 1);
	const omega = (2 * Math.PI * center) / SAMPLE_RATE;
	const alpha = Math.sin(omega) / (2 * q);
	const a0 = 1 + alpha;
	return {
		b0: alpha / a0,
		b1: 0,
		b2: -alpha / a0,
		a1: (-2 * Math.cos(omega)) / a0,
		a2: (1 - alpha) / a0,
	};
};

/** @type {(input: Float32Array, filter: Biquad) => Float32Array} 直接型 I 的二階 IIR。 */
const runBiquad = (input, filter) => {
	const output = new Float32Array(input.length);
	let x1 = 0;
	let x2 = 0;
	let y1 = 0;
	let y2 = 0;
	for (let index = 0; index < input.length; index += 1) {
		const x0 = input[index];
		const y0 = filter.b0 * x0 + filter.b1 * x1 + filter.b2 * x2 - filter.a1 * y1 - filter.a2 * y2;
		output[index] = y0;
		x2 = x1;
		x1 = x0;
		y2 = y1;
		y1 = y0;
	}
	return output;
};

/**
 * @typedef {object} Syllable
 * @property {number} center 中心時間（秒）
 * @property {number} width 高斯寬度（秒）
 * @property {number} amplitude 相對大小
 */

/** @type {(random: () => number) => Syllable[]} 幾個不規則的「音節」，間隔 0.2 到 0.35 秒。 */
const makeSyllables = (random) => {
	/** @type {Syllable[]} */
	const syllables = [];
	let time = 0.22;
	while (time < WHISPER_SECONDS - 0.25) {
		syllables.push({ center: time, width: 0.05 + random() * 0.05, amplitude: 0.55 + random() * 0.45 });
		time += 0.2 + random() * 0.15;
	}
	return syllables;
};

/** @type {(time: number, syllables: Syllable[]) => number} 音節起伏加一個很慢的底，0 到約 1。 */
const whisperEnvelope = (time, syllables) => {
	let level = 0.12;
	for (const syllable of syllables) {
		const distance = (time - syllable.center) / syllable.width;
		level += syllable.amplitude * Math.exp(-0.5 * distance * distance);
	}
	const swell = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.6 * time + 0.4);
	return Math.min(1, level) * swell;
};

/** @type {() => Float32Array} 約 2 秒的帶通噪音低語，峰值 `WHISPER_PEAK_DBFS`。 */
export const synthWhisper = () => {
	const length = Math.round(WHISPER_SECONDS * SAMPLE_RATE);
	const random = seededRandom(WHISPER_SEED);
	const noise = new Float32Array(length);
	for (let index = 0; index < length; index += 1) {
		noise[index] = random() * 2 - 1;
	}
	// 兩級同樣的二階帶通，裙邊每八度 12 dB，嘶聲壓得夠低
	const filter = bandPass(WHISPER_LOW_HZ, WHISPER_HIGH_HZ);
	const filtered = runBiquad(runBiquad(noise, filter), filter);

	const syllables = makeSyllables(random);
	for (let index = 0; index < length; index += 1) {
		filtered[index] *= whisperEnvelope(index / SAMPLE_RATE, syllables);
	}
	applyFades(filtered, 0.25, 0.4);
	return normalizePeak(filtered, WHISPER_PEAK_DBFS);
};

// ---------------------------------------------------------------------------
// 輸出
// ---------------------------------------------------------------------------

/** @type {(samples: Float32Array, sampleRate: number) => Buffer} 16-bit PCM 單聲道 WAV，超出 ±1 的取樣夾住。 */
export const encodeWav = (samples, sampleRate) => {
	const dataBytes = samples.length * 2;
	const buffer = Buffer.alloc(44 + dataBytes);
	buffer.write("RIFF", 0, "ascii");
	buffer.writeUInt32LE(36 + dataBytes, 4);
	buffer.write("WAVE", 8, "ascii");
	buffer.write("fmt ", 12, "ascii");
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20);
	buffer.writeUInt16LE(1, 22);
	buffer.writeUInt32LE(sampleRate, 24);
	buffer.writeUInt32LE(sampleRate * 2, 28);
	buffer.writeUInt16LE(2, 32);
	buffer.writeUInt16LE(16, 34);
	buffer.write("data", 36, "ascii");
	buffer.writeUInt32LE(dataBytes, 40);
	for (let index = 0; index < samples.length; index += 1) {
		const clamped = Math.min(1, Math.max(-1, samples[index]));
		buffer.writeInt16LE(Math.round(clamped * 32767), 44 + index * 2);
	}
	return buffer;
};

/** @type {Record<string, () => Float32Array>} */
const SOUNDS = {
	heartbeat: synthHeartbeat,
	whisper: synthWhisper,
};

/** @type {() => string} 找 ffmpeg：環境變數 FFMPEG、Homebrew 的預設位置，都沒有就交給 PATH。 */
const resolveFfmpeg = () => {
	if (process.env.FFMPEG !== undefined && process.env.FFMPEG !== "") {
		return process.env.FFMPEG;
	}
	if (fs.existsSync("/opt/homebrew/bin/ffmpeg")) {
		return "/opt/homebrew/bin/ffmpeg";
	}
	return "ffmpeg";
};

/** @type {(ffmpeg: string, args: string[]) => void} 跑 ffmpeg，失敗就印 stderr 並結束。 */
const runFfmpeg = (ffmpeg, args) => {
	const result = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8" });
	if (result.error !== undefined) {
		console.error(`找不到 ffmpeg（${ffmpeg}），用 FFMPEG 環境變數指定路徑`);
		process.exit(1);
	}
	if (result.status !== 0) {
		console.error(result.stderr);
		process.exit(1);
	}
};

/**
 * ogg 用 ffmpeg 內建的 vorbis 編碼器（Homebrew 的 ffmpeg 沒有 libvorbis，內建的要 `-strict experimental`，而且只吃雙聲道），
 * 單聲道用 pan 原樣複製到左右（`-ac 2` 會照聲像定律各壓 3 dB，ogg 就比 mp3 小聲）；mp3 用 libmp3lame 單聲道。
 * `-fflags +bitexact` 拿掉編碼器版本這類中繼資料，重跑產出的檔案不會無故變動。
 * @type {(ffmpeg: string, wavPath: string, name: string) => void}
 */
const encode = (ffmpeg, wavPath, name) => {
	const common = ["-i", wavPath, "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact"];
	const ogg = path.join(OUT_DIR, `${name}.ogg`);
	const mp3 = path.join(OUT_DIR, `${name}.mp3`);
	runFfmpeg(ffmpeg, [...common, "-af", "pan=stereo|c0=c0|c1=c0", "-c:a", "vorbis", "-strict", "experimental", "-q:a", "5", ogg]);
	runFfmpeg(ffmpeg, [...common, "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k", mp3]);
};

/** @type {(names: string[]) => void} */
const main = (names) => {
	const selected = names.length > 0 ? names : Object.keys(SOUNDS);
	const unknown = selected.filter((name) => !(name in SOUNDS));
	if (unknown.length > 0) {
		console.error(`不認得的音效：${unknown.join("、")}（可用：${Object.keys(SOUNDS).join("、")}）`);
		process.exit(1);
	}

	const ffmpeg = resolveFfmpeg();
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kepler9-synth-"));
	try {
		for (const name of selected) {
			const samples = SOUNDS[name]();
			const wavPath = path.join(tempDir, `${name}.wav`);
			fs.writeFileSync(wavPath, encodeWav(samples, SAMPLE_RATE));
			encode(ffmpeg, wavPath, name);
			const seconds = (samples.length / SAMPLE_RATE).toFixed(2);
			console.log(`${name}：${seconds} 秒 → public/audio/${name}.ogg、${name}.mp3`);
		}
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
};

// 只有直接執行時才寫檔，被測試 import 時不動作
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main(process.argv.slice(2));
}
