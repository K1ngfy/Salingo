import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const nunito = Nunito({ subsets: ["latin"], display: "swap", variable: "--font-nunito" });

export const metadata: Metadata = {
  title: { default: "SALINGO 赛邻国 · CISSP 备考", template: "%s · SALINGO" },
  description: "本地优先的中文 CISSP 闯关学习、错题复习与模拟考试工具。",
  applicationName: "SALINGO 赛邻国",
};

export const viewport: Viewport = { themeColor: "#fcfcf8", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" data-scroll-behavior="smooth"><body className={nunito.variable}><AppShell>{children}</AppShell></body></html>;
}
