"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Books,
  ChartBar,
  Fire,
  GearSix,
  House,
  Lightning,
  MapTrifold,
  Notebook,
  Timer,
  Trophy,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { CommunityProvider } from "./community-provider";
import { DataProvider, useAppData } from "./data-provider";

const navigation = [
  { href: "/", label: "总览", icon: House },
  { href: "/learn", label: "闯关", icon: Lightning },
  { href: "/review", label: "复习", icon: Notebook },
  { href: "/exam", label: "模考", icon: Timer },
  { href: "/prep", label: "备考", icon: MapTrifold },
  { href: "/library", label: "题库", icon: Books },
  { href: "/stats", label: "统计", icon: ChartBar },
  { href: "/leaderboard", label: "排行榜", icon: Trophy },
];

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data, hydrated, storageStatus, storageError } = useAppData();
  const due = data.reviews.filter((item) => new Date(item.due) <= new Date()).length;
  const streak = data.streakDates.length;

  if (!hydrated) return <div className="grid min-h-dvh place-items-center bg-[#fcfcf8]"><div className="text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#58cc02] text-2xl font-black text-white">S</span><p className="mt-4 font-black text-[#777]">正在加载本地题库…</p></div></div>;
  return (
    <div className="min-h-dvh bg-[#fcfcf8] text-[#3c3c3c]">
      <a href="#main-content" className="skip-link">跳到主要内容</a>
      <header className="sticky top-0 z-40 border-b-2 border-[#ecece8] bg-[#fcfcf8]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-[1380px] items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="group flex shrink-0 items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lime-200" aria-label="SALINGO 首页">
            <span className="grid size-10 rotate-[-3deg] place-items-center rounded-[14px] bg-[#58cc02] text-xl font-black text-white shadow-[0_4px_0_#46a302] transition group-hover:rotate-2">S</span>
            <span className="hidden sm:block">
              <span className="block text-xl font-black leading-none tracking-[-0.04em] text-[#58a700]">SALINGO</span>
              <span className="mt-1 block text-[10px] font-bold tracking-[0.22em] text-[#9a9a94]">赛邻国 · CISSP</span>
            </span>
          </Link>
          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex" aria-label="主导航">
            {navigation.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link key={href} href={href} className={cn("flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition hover:bg-[#f0f0eb] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100", active ? "bg-[#e9f8dc] text-[#58a700]" : "text-[#777770]")}>
                  <Icon size={20} weight={active ? "fill" : "bold"} />
                  {label}
                  {href === "/review" && due > 0 && <span className="rounded-md bg-[#ff4b4b] px-1.5 py-0.5 text-[10px] tabular-nums text-white">{due}</span>}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/leaderboard" className="flex items-center gap-1 rounded-xl px-2 py-2 text-[#ff9600] transition hover:bg-[#fff3e0] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100" title="累计学习天数 · 查看排行榜" aria-label="累计学习天数，前往排行榜">
              <Fire size={22} weight="fill" />
              <span className="font-black tabular-nums">{streak}</span>
            </Link>
            <Link href="/settings" aria-label="设置" className={cn("grid size-10 place-items-center rounded-xl text-[#888] transition hover:bg-[#f0f0eb] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100", pathname === "/settings" && "bg-[#e8f5fc] text-[#168fc7]") }>
              <GearSix size={23} weight="bold" />
            </Link>
          </div>
        </div>
      </header>

      {storageError && <div role="alert" className={cn("mx-auto mt-4 max-w-[1332px] rounded-xl px-4 py-3 text-sm font-bold", storageStatus === "volatile" ? "bg-[#fff0f0] text-[#b83232]" : "bg-[#fff7e5] text-[#89672c]")}>{storageError}</div>}

      <main id="main-content" className="mx-auto w-full max-w-[1380px] px-4 pb-28 pt-7 sm:px-6 sm:pt-9 lg:pb-12">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-[#e8e8e3] bg-white/96 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden" aria-label="移动端主导航">
        <div className="mx-auto flex max-w-xl justify-around">
          {navigation.slice(0, 6).map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return <Link key={href} href={href} className={cn("relative flex min-w-14 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-bold", active ? "text-[#58a700]" : "text-[#999]")}><Icon size={23} weight={active ? "fill" : "bold"} /><span>{label}</span>{href === "/review" && due > 0 && <span className="absolute right-1 top-0 size-2 rounded-full bg-[#ff4b4b]" />}</Link>;
          })}
        </div>
      </nav>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return <DataProvider><CommunityProvider><Shell>{children}</Shell></CommunityProvider></DataProvider>;
}
