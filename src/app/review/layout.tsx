import type { Metadata } from "next";
export const metadata: Metadata = { title: "FSRS 错题复习", description: "按记忆状态自动安排 CISSP 错题复习。" };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
