import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "管理员后台",
  description: "SALINGO 账号恢复与清理后台。",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
