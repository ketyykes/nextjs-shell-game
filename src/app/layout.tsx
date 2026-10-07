import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { fusionPixel, pressStart2P, vt323 } from "./fonts";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
