import type { Metadata } from "next";
import { fusionPixel, pressStart2P, vt323 } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  // 部署後在環境變數設定正式網域，OG 圖與 sitemap 的絕對網址都吃這個值
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Kepler-9",
  description:
    "在廢棄太空站用 shell 指令解謎的恐怖冒險。俯視角像素探索，六章從 ls、cd 一路教到 ps、kill，專為沒碰過終端機的新手設計。",
  openGraph: {
    title: "Kepler-9",
    description: "在廢棄太空站用 shell 指令解謎的恐怖冒險。",
    type: "website",
    locale: "zh_TW",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`${vt323.variable} ${pressStart2P.variable} ${fusionPixel.variable}`}
    >
      <body
        className="antialiased"
      >
        {children}
      </body>
    </html>
  );
}
