import type { Metadata } from "next";

export const metadata: Metadata = { title: "备考中心", description: "CISSP 考纲地图、学习计划、答题策略、知识卡与考前清单。" };
export default function PrepLayout({ children }: { children: React.ReactNode }) { return children; }
