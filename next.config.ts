import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	turbopack: {
		resolveAlias: {
			// 遊戲只用 arcade 物理（main.ts 的 physics.default），換成不含 Matter.js 的建置版本，Phaser chunk 小約一成。
			// phaser 的 package.json exports 只開放 "."，所以要寫 node_modules 的相對路徑；型別照樣走 phaser 的 types 欄位。
			// 這是 UMD 建置，`import Phaser from "phaser"` 靠 CommonJS interop 拿到 module.exports（整個 Phaser 命名空間）。
			phaser: "./node_modules/phaser/dist/phaser-arcade-physics.min.js",
		},
	},
};

export default nextConfig;
