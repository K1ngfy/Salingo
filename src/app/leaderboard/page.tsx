"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowClockwise, Fire, Trophy, X } from "@phosphor-icons/react";
import { useCommunity } from "@/components/community-provider";
import { Button } from "@/components/ui/button";
import { DOMAINS } from "@/lib/domains";
import { chartColors } from "@/lib/chart-colors";
import { useIsDark } from "@/lib/use-theme";
import { dateKey } from "@/lib/utils";
import {
  fetchDomainLeaderboard,
  fetchLeaderboard,
  fetchUserStats,
  isStreakAlive,
  type DomainLeaderboardEntry,
  type LeaderboardEntry,
  type UserStats,
} from "@/lib/community";
import type { CommunityProfile, DomainId } from "@/lib/types";

type Tab = "streak" | "today" | "domain";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "streak", label: "连续天数" },
  { id: "today", label: "今日答题" },
  { id: "domain", label: "分领域正确率" },
];

const MEDALS = ["#ffb100", "#b8c4cf", "#d9945b"];

function rankBadge(index: number) {
  const color = MEDALS[index];
  return (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-xl text-sm font-black tabular-nums"
      style={color ? { backgroundColor: color, color: "#fff" } : { backgroundColor: "var(--c-f0f0eb)", color: "var(--c-999)" }}
    >
      {index + 1}
    </span>
  );
}

export default function LeaderboardPage() {
  const { profile, ready, createProfile, syncing } = useCommunity();
  const [tab, setTab] = useState<Tab>("streak");
  const [domainId, setDomainId] = useState<DomainId>("d1");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [domainEntries, setDomainEntries] = useState<DomainLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string | null>(null);
  const [newProfile, setNewProfile] = useState<CommunityProfile>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      if (tab === "domain") setDomainEntries(await fetchDomainLeaderboard(domainId));
      else setEntries(await fetchLeaderboard(tab));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "排行榜加载失败");
    } finally {
      setLoading(false);
    }
  }, [tab, domainId]);

  useEffect(() => { void load(); }, [load, profile?.userId]);

  if (!ready) return <p className="mt-10 text-center font-bold text-[var(--c-999)]">正在加载…</p>;

  if (!profile) {
    return (
      <>
        <PageHeader />
        <JoinCard onJoin={async (nickname) => setNewProfile(await createProfile(nickname))} />
        {newProfile && <RecoveryModal profile={newProfile} onClose={() => setNewProfile(undefined)} />}
      </>
    );
  }

  return (
    <>
      <PageHeader />
      {newProfile && <RecoveryModal profile={newProfile} onClose={() => setNewProfile(undefined)} />}
      <div className="mt-7 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-2xl bg-[var(--c-f0f0eb)] p-1">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-xl px-4 py-2 text-sm font-black transition ${tab === id ? "bg-[var(--surface)] text-[var(--c-58a700)] shadow-sm" : "text-[var(--c-888)] hover:text-[var(--c-555)]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => void load()}
          className="ml-auto grid size-10 place-items-center rounded-xl text-[var(--c-888)] transition hover:bg-[var(--c-f0f0eb)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100"
          aria-label="刷新排行榜"
          title={syncing ? "正在同步你的成绩…" : "刷新"}
        >
          <ArrowClockwise size={20} weight="bold" className={loading || syncing ? "animate-spin" : ""} />
        </button>
      </div>

      {tab === "domain" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {DOMAINS.map((domain) => (
            <button
              key={domain.id}
              onClick={() => setDomainId(domain.id)}
              className="rounded-xl px-3 py-1.5 text-xs font-black transition"
              style={domainId === domain.id
                ? { backgroundColor: domain.color, color: "#fff" }
                : { backgroundColor: domain.softColor, color: domain.color }}
            >
              D{domain.number} {domain.shortName}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5">
        {error && <p className="rounded-xl bg-[var(--c-fff0f0)] p-4 text-center text-sm font-bold text-[var(--c-b83232)]">{error}</p>}
        {!error && loading && <p className="py-10 text-center font-bold text-[var(--c-999)]">加载中…</p>}
        {!error && !loading && tab !== "domain" && (
          <StandardList tab={tab} entries={entries} selfId={profile.publicId} onSelect={setSelected} />
        )}
        {!error && !loading && tab === "domain" && (
          <DomainList entries={domainEntries} selfId={profile.publicId} onSelect={setSelected} />
        )}
      </div>

      {selected && <UserStatsModal publicId={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function PageHeader() {
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-black text-[var(--c-ff9600)]"><Trophy size={21} weight="fill" />LEADERBOARD</p>
      <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] sm:text-4xl">和大家一起坚持</h1>
      <p className="mt-3 font-semibold text-[var(--c-777)]">连续天数、今日答题量、分领域正确率 —— 跨设备一起比拼。</p>
    </div>
  );
}

function JoinCard({ onJoin }: { onJoin: (nickname: string) => Promise<void> }) {
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async () => {
    if (!nickname.trim()) { setError("请先填写昵称"); return; }
    setBusy(true);
    setError(undefined);
    try { await onJoin(nickname.trim()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "加入失败，请稍后重试"); }
    finally { setBusy(false); }
  };
  return (
    <section className="mt-7 rounded-[1.7rem] border-2 border-[var(--c-e8e8e3)] bg-[var(--surface)] p-6">
      <h2 className="text-lg font-black">加入排行榜</h2>
      <p className="mt-1 text-sm font-semibold text-[var(--c-888)]">取个昵称即可加入。系统会给你一串恢复码，换设备时用它找回进度。</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void submit(); }}
          maxLength={24}
          placeholder="你的昵称（最多 24 字）"
          className="h-12 flex-1 rounded-xl border-2 border-[var(--c-deded8)] px-4 outline-none focus:border-[var(--c-58cc02)]"
        />
        <Button onClick={() => void submit()} disabled={busy}>{busy ? "加入中…" : "加入"}</Button>
      </div>
      {error && <p className="mt-3 text-sm font-bold text-[var(--c-b83232)]">{error}</p>}
    </section>
  );
}

function RecoveryModal({ profile, onClose }: { profile: CommunityProfile; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(profile.recoveryCode); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <Overlay onClose={onClose}>
      <h2 className="text-xl font-black">请保存你的恢复码</h2>
      <p className="mt-2 text-sm font-semibold text-[var(--c-777)]">这是找回账号的唯一凭证。换设备或清除缓存后，用它就能恢复 <b>{profile.nickname}</b> 的进度和排名。</p>
      <div className="mt-5 rounded-2xl bg-[var(--c-f7f9f1)] p-5 text-center">
        <p className="select-all text-2xl font-black tracking-wide text-[var(--c-58a700)]">{profile.recoveryCode}</p>
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => void copy()}>{copied ? "已复制" : "复制恢复码"}</Button>
        <Button className="flex-1" onClick={onClose}>我已保存</Button>
      </div>
      <p className="mt-3 text-xs font-semibold text-[var(--c-a58a5a)]">提示：恢复码相当于账号密码，请勿分享给他人。</p>
    </Overlay>
  );
}

function StandardList({ tab, entries, selfId, onSelect }: {
  tab: "streak" | "today";
  entries: LeaderboardEntry[];
  selfId: string;
  onSelect: (publicId: string) => void;
}) {
  if (!entries.length) return <EmptyState />;
  return (
    <ul className="space-y-2">
      {entries.map((entry, index) => {
        const isSelf = entry.publicId === selfId;
        const value = tab === "streak" ? entry.currentStreak : (entry.todayDate === dateKey() ? entry.todayCount : 0);
        const alive = isStreakAlive(entry.lastActiveDate);
        return (
          <li key={entry.publicId}>
            <button
              onClick={() => onSelect(entry.publicId)}
              className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition hover:border-[var(--c-d7d7d0)] ${isSelf ? "border-[var(--c-58cc02)] bg-[var(--c-f4fbe9)]" : "border-[var(--c-eeeeea)] bg-[var(--surface)]"}`}
            >
              {rankBadge(index)}
              <span className="min-w-0 flex-1 truncate font-black">{entry.nickname}{isSelf && <span className="ml-2 text-xs font-bold text-[var(--c-58a700)]">你</span>}</span>
              {tab === "streak"
                ? <span className={`flex items-center gap-1 font-black tabular-nums ${alive ? "text-[var(--c-ff9600)]" : "text-[var(--c-bbb)]"}`}><Fire size={18} weight="fill" />{value}</span>
                : <span className="font-black tabular-nums text-[var(--c-1cb0f6)]">{value} <span className="text-xs font-bold text-[var(--c-aaa)]">题</span></span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function DomainList({ entries, selfId, onSelect }: {
  entries: DomainLeaderboardEntry[];
  selfId: string;
  onSelect: (publicId: string) => void;
}) {
  if (!entries.length) return <EmptyState />;
  return (
    <ul className="space-y-2">
      {entries.map((entry, index) => {
        const isSelf = entry.publicId === selfId;
        return (
          <li key={entry.publicId}>
            <button
              onClick={() => onSelect(entry.publicId)}
              className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition hover:border-[var(--c-d7d7d0)] ${isSelf ? "border-[var(--c-58cc02)] bg-[var(--c-f4fbe9)]" : "border-[var(--c-eeeeea)] bg-[var(--surface)]"}`}
            >
              {rankBadge(index)}
              <span className="min-w-0 flex-1 truncate font-black">{entry.nickname}{isSelf && <span className="ml-2 text-xs font-bold text-[var(--c-58a700)]">你</span>}</span>
              <span className="text-right"><span className="font-black tabular-nums text-[var(--c-58a700)]">{entry.rate}%</span><span className="ml-2 text-xs font-bold text-[var(--c-aaa)]">{entry.correct}/{entry.count}</span></span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyState() {
  return <p className="rounded-2xl bg-[var(--c-f5f5f1)] p-8 text-center font-semibold text-[var(--c-999)]">还没有数据，答几道题就会出现在这里。</p>;
}

function UserStatsModal({ publicId, onClose }: { publicId: string; onClose: () => void }) {
  const [stats, setStats] = useState<UserStats>();
  const [error, setError] = useState<string>();
  const chart = chartColors(useIsDark());
  useEffect(() => {
    let active = true;
    void (async () => {
      try { const result = await fetchUserStats(publicId); if (active) setStats(result); }
      catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "加载失败"); }
    })();
    return () => { active = false; };
  }, [publicId]);

  const trend = useMemo(() => (stats?.daily ?? []).slice(-14).map((day) => ({
    day: `${Number(day.date.slice(5, 7))}/${Number(day.date.slice(8, 10))}`,
    count: day.count,
  })), [stats]);
  const domains = useMemo(() => DOMAINS.map((domain) => {
    const match = stats?.domains.find((item) => item.domainId === domain.id);
    const count = match?.count ?? 0;
    return { ...domain, count, rate: count ? Math.round(((match?.correct ?? 0) / count) * 100) : 0 };
  }), [stats]);

  return (
    <Overlay onClose={onClose} wide>
      {!stats && !error && <p className="py-8 text-center font-bold text-[var(--c-999)]">加载中…</p>}
      {error && <p className="py-8 text-center font-bold text-[var(--c-b83232)]">{error}</p>}
      {stats && (
        <div>
          <h2 className="text-xl font-black">{stats.profile.nickname}</h2>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat label="当前连续" value={isStreakAlive(stats.profile.lastActiveDate) ? stats.profile.currentStreak : 0} suffix="天" color="var(--c-ff9600)" />
            <Stat label="最长连续" value={stats.profile.longestStreak} suffix="天" color="var(--c-ce82ff)" />
            <Stat label="累计答题" value={stats.profile.totalAnswered} suffix="题" color="var(--c-1cb0f6)" />
          </div>
          <h3 className="mt-6 text-sm font-black text-[var(--c-777)]">近 14 天答题量</h3>
          <div className="mt-3 h-48">
            {trend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke={chart.grid} strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: chart.axisTick, fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: chart.axisTickDim, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={chart.tooltip} cursor={{ fill: chart.cursor }} />
                  <Bar dataKey="count" name="答题量" fill={chart.accent} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="grid h-full place-items-center font-semibold text-[var(--c-aaa)]">暂无记录</p>}
          </div>
          <h3 className="mt-6 text-sm font-black text-[var(--c-777)]">分领域正确率</h3>
          <div className="mt-3 space-y-3">
            {domains.map((domain) => (
              <div key={domain.id}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="grid size-6 place-items-center rounded-lg text-[10px] font-black" style={{ backgroundColor: domain.softColor, color: domain.color }}>D{domain.number}</span>
                  <span className="font-bold">{domain.shortName}</span>
                  <span className="ml-auto font-black tabular-nums" style={{ color: domain.count ? domain.color : "var(--c-bbb)" }}>{domain.count ? `${domain.rate}%` : "未练习"}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--c-eeeeea)]"><div className="h-full rounded-full" style={{ width: `${domain.rate}%`, backgroundColor: domain.color }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Overlay>
  );
}

function Stat({ label, value, suffix, color }: { label: string; value: number; suffix: string; color: string }) {
  return (
    <div className="rounded-xl bg-[var(--c-f7f7f2)] p-3 text-center">
      <p className="text-xs font-bold text-[var(--c-999)]">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums" style={{ color }}>{value}<span className="ml-0.5 text-xs font-bold text-[var(--c-aaa)]">{suffix}</span></p>
    </div>
  );
}

function Overlay({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={`max-h-[85vh] w-full overflow-y-auto rounded-[1.7rem] bg-[var(--surface)] p-6 shadow-2xl ${wide ? "max-w-lg" : "max-w-md"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-end"><button onClick={onClose} className="grid size-9 place-items-center rounded-xl text-[var(--c-999)] hover:bg-[var(--c-f0f0eb)]" aria-label="关闭"><X size={20} weight="bold" /></button></div>
        {children}
      </div>
    </div>
  );
}
