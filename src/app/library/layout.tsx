import type { Metadata } from "next";
export const metadata: Metadata = { title: "本地题库", description: "浏览、筛选、导入和生成本地 CISSP 练习题。" };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
