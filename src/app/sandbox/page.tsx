import type { Metadata } from "next";
import { SandboxFlow } from "@/components/sandbox/SandboxFlow";

export const metadata: Metadata = {
	title: "Kepler-9 — 練習模式",
};

/** 沙盒練習模式（M14-3）：一台全螢幕終端機，不存檔、不扣氧。互動都在 client component `SandboxFlow` 裡。 */
export default function SandboxPage() {
	return <SandboxFlow />;
}
