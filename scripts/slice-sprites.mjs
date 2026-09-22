#!/usr/bin/env node
/**
 * 把 AI 產出的 4x4 角色 sprite sheet 重新切成整齊的格子。
 *
 * AI 畫的每一幀位置與大小都不完全一致，直接當 spritesheet 用會抖動。
 * 這支腳本會：
 *   1. 讀取原圖，若背景是不透明的黑色，從四個角落洪水填充把背景挖成透明。
 *   2. 先把極淡的透明雜訊（alpha < 32）清掉，再把原圖平均分成 4x4 區域，
 *      每個區域只保留最大的一塊連通像素（角色本體），去掉飄散的碎屑，
 *      然後找出角色的實際外框（bounding box）。
 *   3. 每一列（同一個方向）共用一個縮放比例，讓走路循環的幀之間大小一致；
 *      列與列之間各自縮放，因為 AI 常把某個方向畫得比其他方向大。
 *   4. 每一幀水平置中、腳底對齊同一條基準線，貼進 32x48 的格子。
 *   5. 輸出到 public/sprites/，並輸出放大四倍的預覽圖方便肉眼檢查。
 *
 * 用法：
 *   pnpm sprites:slice                 # 處理下方 SHEETS 清單全部
 *   pnpm sprites:slice technician-d    # 只處理指定的角色
 *   SPRITE_PREVIEW_DIR=/tmp/x pnpm sprites:slice   # 預覽圖改放別的目錄
 *
 * 列的順序（由上到下）：面向下、面向左、面向右、面向上。
 * 每列四幀：站立、左腳前、站立、右腳前。
 */

import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";

/**
 * @typedef {{ left: number, top: number, width: number, height: number }} Region
 * @typedef {Region & { row: number, col: number }} FrameBox
 * @typedef {{ name: string, src: string }} SheetEntry
 * @typedef {{ data: Buffer, width: number, height: number }} RawImage
 */

/** @type {string} */
const ROOT = path.resolve(import.meta.dirname, "..");
/** @type {string} */
const DRAFT_DIR = path.join(ROOT, "docs", "assets-draft");
/** @type {string} */
const OUT_DIR = path.join(ROOT, "public", "sprites");
/** @type {string} */
const PREVIEW_DIR = process.env.SPRITE_PREVIEW_DIR ?? path.join(ROOT, "docs", "assets-draft");

/** 版面：幾欄幾列 @type {number} */
const COLS = 4;
/** @type {number} */
const ROWS = 4;
/** 輸出格子寬（像素） @type {number} */
const CELL_W = 32;
/** 輸出格子高（像素） @type {number} */
const CELL_H = 48;
/** 角色在格子裡的最大高度，留邊距避免貼到格線 @type {number} */
const MAX_FIGURE_H = 46;
/** 角色在格子裡的最大寬度 @type {number} */
const MAX_FIGURE_W = 30;
/** 腳底對齊的基準線，距格子頂端的像素數 @type {number} */
const BASELINE = 47;
/** 判定「近黑色背景」的門檻，RGB 三個通道都小於此值才算 @type {number} */
const NEAR_BLACK = 28;
/** 縮小後 alpha 低於此值視為透明，避免半透明毛邊 @type {number} */
const ALPHA_CUTOFF = 128;
/** 原圖 alpha 低於此值視為背景雜訊，找外框前先清掉 @type {number} */
const ALPHA_NOISE = 32;
/** 全透明像素比例低於此值，視為不透明黑底需要挖背景 @type {number} */
const TRANSPARENT_RATIO_MIN = 0.05;

/** 要處理的 sprite sheet 清單 @type {SheetEntry[]} */
const SHEETS = [
  { name: "technician-a", src: "technician-sheet-original.png" },
  { name: "technician-c", src: "technician-c-original.png" },
  { name: "technician-d", src: "technician-d-original.png" },
  { name: "technician-e", src: "technician-e-original.png" },
];

/**
 * 從四個角落洪水填充，把連通的近黑色像素設成透明。
 * 只挖「連到邊緣」的黑色，角色身上的黑色（例如靴子）因為被身體包住，不會被挖掉。
 * 回傳被挖掉的像素數。
 * @type {(image: RawImage) => number}
 */
const keyOutBackground = ({ data, width, height }) => {
  const visited = new Uint8Array(width * height);
  /** @type {number[]} */
  const stack = [];

  /** @type {(index: number) => boolean} */
  const isNearBlack = (index) => {
    const o = index * 4;
    return data[o] < NEAR_BLACK && data[o + 1] < NEAR_BLACK && data[o + 2] < NEAR_BLACK;
  };

  /** @type {(x: number, y: number) => void} */
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (visited[index]) return;
    visited[index] = 1;
    if (isNearBlack(index)) stack.push(index);
  };

  push(0, 0);
  push(width - 1, 0);
  push(0, height - 1);
  push(width - 1, height - 1);

  let removed = 0;
  while (stack.length > 0) {
    const index = /** @type {number} */ (stack.pop());
    data[index * 4 + 3] = 0;
    removed += 1;
    const x = index % width;
    const y = (index - x) / width;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return removed;
};

/**
 * 把 alpha 低於雜訊門檻的像素設成完全透明。
 * @type {(image: RawImage) => void}
 */
const clearFaintNoise = ({ data }) => {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < ALPHA_NOISE) data[i] = 0;
  }
};

/**
 * 在指定區域內只保留最大的一塊連通不透明像素，其餘設成透明。
 * 角色本體一定是最大的一塊，飄散的碎屑與雜點會被清掉。
 * 回傳被清掉的像素數。
 * @type {(image: RawImage, region: Region) => number}
 */
const keepLargestComponent = ({ data, width }, region) => {
  const { left, top, width: regionW, height: regionH } = region;
  /** 每個區域內像素所屬的連通區塊編號，0 代表透明或尚未標記 @type {Int32Array} */
  const label = new Int32Array(regionW * regionH);
  /** 每個區塊的像素數，索引即區塊編號 @type {number[]} */
  const sizes = [0];

  /** @type {(x: number, y: number) => number} */
  const alphaAt = (x, y) => data[((top + y) * width + (left + x)) * 4 + 3];

  for (let sy = 0; sy < regionH; sy += 1) {
    for (let sx = 0; sx < regionW; sx += 1) {
      if (alphaAt(sx, sy) === 0 || label[sy * regionW + sx] !== 0) continue;
      const id = sizes.length;
      sizes.push(0);
      /** @type {number[]} */
      const stack = [sy * regionW + sx];
      label[sy * regionW + sx] = id;
      while (stack.length > 0) {
        const index = /** @type {number} */ (stack.pop());
        sizes[id] += 1;
        const x = index % regionW;
        const y = (index - x) / regionW;
        const neighbours = [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ];
        for (const [nx, ny] of neighbours) {
          if (nx < 0 || ny < 0 || nx >= regionW || ny >= regionH) continue;
          const nIndex = ny * regionW + nx;
          if (label[nIndex] !== 0 || alphaAt(nx, ny) === 0) continue;
          label[nIndex] = id;
          stack.push(nIndex);
        }
      }
    }
  }

  let largestId = 0;
  for (let id = 1; id < sizes.length; id += 1) {
    if (sizes[id] > sizes[largestId]) largestId = id;
  }

  let removed = 0;
  for (let sy = 0; sy < regionH; sy += 1) {
    for (let sx = 0; sx < regionW; sx += 1) {
      const id = label[sy * regionW + sx];
      if (id === 0 || id === largestId) continue;
      data[((top + sy) * width + (left + sx)) * 4 + 3] = 0;
      removed += 1;
    }
  }
  return removed;
};

/**
 * 在指定區域內找出不透明像素的外框，找不到回傳 null。
 * @type {(image: RawImage, region: Region) => Region | null}
 */
const findBoundingBox = ({ data, width }, region) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = region.top; y < region.top + region.height; y += 1) {
    for (let x = region.left; x < region.left + region.width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
};

/**
 * 把一張已縮小的幀貼進輸出畫布，alpha 二值化成完全不透明或完全透明。
 * @type {(canvas: Buffer, canvasW: number, frame: Buffer, frameW: number, frameH: number, destX: number, destY: number) => void}
 */
const pasteFrame = (canvas, canvasW, frame, frameW, frameH, destX, destY) => {
  for (let y = 0; y < frameH; y += 1) {
    for (let x = 0; x < frameW; x += 1) {
      const src = (y * frameW + x) * 4;
      if (frame[src + 3] < ALPHA_CUTOFF) continue;
      const dst = ((destY + y) * canvasW + (destX + x)) * 4;
      canvas[dst] = frame[src];
      canvas[dst + 1] = frame[src + 1];
      canvas[dst + 2] = frame[src + 2];
      canvas[dst + 3] = 255;
    }
  }
};

/**
 * 處理一張 sprite sheet：讀圖、清理、找外框、縮放、貼合、輸出。
 * @type {(sheet: SheetEntry) => Promise<void>}
 */
const sliceSheet = async ({ name, src }) => {
  const srcPath = path.join(DRAFT_DIR, src);
  const { data, info } = await sharp(srcPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  /** @type {RawImage} */
  const image = { data, width: info.width, height: info.height };
  const { width, height } = image;

  // 1. 判斷背景：全透明像素比例太低就視為不透明黑底，需要挖背景
  let transparentCount = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] === 0) transparentCount += 1;
  }
  let keyedOut = 0;
  if (transparentCount / (width * height) < TRANSPARENT_RATIO_MIN) {
    keyedOut = keyOutBackground(image);
  }

  // 2. 清雜訊、每格只留最大連通區塊、找外框
  clearFaintNoise(image);
  const cellW = width / COLS;
  const cellH = height / ROWS;
  /** @type {FrameBox[]} */
  const boxes = [];
  let debrisRemoved = 0;
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      /** @type {Region} */
      const region = {
        left: Math.floor(c * cellW),
        top: Math.floor(r * cellH),
        width: Math.floor(cellW),
        height: Math.floor(cellH),
      };
      debrisRemoved += keepLargestComponent(image, region);
      const box = findBoundingBox(image, region);
      if (box === null) {
        throw new Error(`${name} 第 ${r + 1} 列第 ${c + 1} 欄找不到角色`);
      }
      boxes.push({ row: r, col: c, ...box });
    }
  }

  // 3. 每列各自算縮放比例，同列共用
  /** @type {number[]} */
  const rowScale = [];
  for (let r = 0; r < ROWS; r += 1) {
    const rowBoxes = boxes.filter((b) => b.row === r);
    const maxH = Math.max(...rowBoxes.map((b) => b.height));
    const maxW = Math.max(...rowBoxes.map((b) => b.width));
    rowScale.push(Math.min(MAX_FIGURE_H / maxH, MAX_FIGURE_W / maxW));
  }

  // 4. 逐幀縮小並貼進畫布
  const canvasW = COLS * CELL_W;
  const canvasH = ROWS * CELL_H;
  const canvas = Buffer.alloc(canvasW * canvasH * 4, 0);
  const rawInput = { raw: { width, height, channels: /** @type {4} */ (4) } };

  for (const box of boxes) {
    const scale = rowScale[box.row];
    const frameW = Math.max(1, Math.round(box.width * scale));
    const frameH = Math.max(1, Math.round(box.height * scale));
    const frame = await sharp(data, rawInput)
      .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
      .resize({ width: frameW, height: frameH, fit: "fill", kernel: "lanczos3" })
      .raw()
      .toBuffer();
    const destX = box.col * CELL_W + Math.floor((CELL_W - frameW) / 2);
    const destY = box.row * CELL_H + (BASELINE - frameH);
    pasteFrame(canvas, canvasW, frame, frameW, frameH, destX, destY);
  }

  // 5. 輸出正式檔與四倍預覽
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(PREVIEW_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${name}.png`);
  const previewPath = path.join(PREVIEW_DIR, `${name}-sliced-4x.png`);
  const canvasInput = { raw: { width: canvasW, height: canvasH, channels: /** @type {4} */ (4) } };
  await sharp(canvas, canvasInput).png({ compressionLevel: 9 }).toFile(outPath);
  await sharp(canvas, canvasInput)
    .resize({ width: canvasW * 4, height: canvasH * 4, kernel: "nearest" })
    .png()
    .toFile(previewPath);

  const rowSummary = rowScale
    .map((scale, r) => {
      const heights = boxes.filter((b) => b.row === r).map((b) => Math.round(b.height * scale));
      return `列${r + 1} 縮放 ${scale.toFixed(3)} 高 ${Math.min(...heights)}-${Math.max(...heights)}`;
    })
    .join("；");
  console.log(
    `${name}: 原圖 ${width}x${height}，挖背景 ${keyedOut} px，清碎屑 ${debrisRemoved} px；${rowSummary}；` +
      `輸出 ${canvasW}x${canvasH} → ${path.relative(ROOT, outPath)}`,
  );
};

/** @type {string | undefined} */
const only = process.argv[2];
const targets = only ? SHEETS.filter((s) => s.name === only) : SHEETS;
if (targets.length === 0) {
  console.error(`找不到角色 ${only}，可用：${SHEETS.map((s) => s.name).join(", ")}`);
  process.exit(1);
}
for (const sheet of targets) {
  await sliceSheet(sheet);
}
