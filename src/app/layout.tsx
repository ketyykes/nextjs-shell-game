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
  description: "在廢棄太空站用 shell 指令解謎的恐怖冒險",
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
