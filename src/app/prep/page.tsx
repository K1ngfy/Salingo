"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpenText, CalendarCheck, Cards, Check, CheckCircle, ClipboardText, ClockCountdown, Heart, MagnifyingGlass, Sparkle, Target, WarningCircle } from "@phosphor-icons/react";
import { PREP_CONTENT } from "@/data/prep-source";
import { useAppData } from "@/components/data-provider";
import { Button } from "@/components/ui/button";
import { DOMAINS } from "@/lib/domains";
import { explainPrepCard } from "@/lib/ai";
import { scheduleReview } from "@/lib/fsrs";
import { buildTodayPlan, daysUntil } from "@/lib/prep";
import { cn, percent } from "@/lib/utils";
import type { DomainId, OutlineProgressStatus, PrepCard, PrepCardKind, VerificationStatus } from "@/lib/types";

type TabId = "today" | "outline" | "strategy" | "cards" | "checklist";
const tabs: Array<{ id: TabId; label: string; icon: typeof Target }> = [
  { id: "today", label: "今日计划", icon: Target },
  { id: "outline", label: "考纲地图", icon: BookOpenText },
  { id: "strategy", label: "答题策略", icon: Sparkle },
  { id: "cards", label: "知识卡", icon: Cards },
  { id: "checklist", label: "考前清单", icon: ClipboardText },
];

export default function PrepPage() {
  const [tab, setTab] = useState<TabId>("today");
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("tab") as TabId | null;
    if (value && tabs.some((item) => item.id === value)) setTab(value);
  }, []);
  const selectTab = (value: TabId) => {
    setTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url);
  };
  return <div>
    <header className="relative overflow-hidden rounded-[2rem] bg-[#263323] p-7 text-white sm:p-9"><div className="absolute -right-16 -top-20 size-64 rounded-full bg-[#58cc02]/20 blur-3xl" /><div className="relative"><p className="text-sm font-black text-[#a9d48f]">CISSP PREP CENTER</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-5xl">从考纲到考场，每天知道下一步</h1><p className="mt-4 max-w-3xl font-semibold leading-7 text-[#cad5c4]">官方 2024 考纲负责定义学习范围；个人备考指南只作为策略和待核验经验，不冒充官方结论。</p></div></header>
    <nav className="mt-6 flex gap-2 overflow-x-auto rounded-[1.4rem] bg-[#f1f1ed] p-2" aria-label="备考中心栏目">{tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => selectTab(id)} className={cn("flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-black", tab === id ? "bg-white text-[#58a700] shadow-sm" : "text-[#777]")}><Icon size={19} weight={tab === id ? "fill" : "bold"} />{label}</button>)}</nav>
    <div className="mt-7">{tab === "today" && <TodayPanel onOpenOutline={() => selectTab("outline")} />}{tab === "outline" && <OutlinePanel />}{tab === "strategy" && <StrategyPanel />}{tab === "cards" && <CardsPanel />}{tab === "checklist" && <ChecklistPanel />}</div>
  </div>;
}

function TodayPanel({ onOpenOutline }: { onOpenOutline: () => void }) {
  const { data, setPrepProfile } = useAppData();
  const [profile, setProfile] = useState(data.prepProfile);
  const plan = buildTodayPlan({ profile: data.prepProfile, answers: data.answers, reviews: data.reviews, objectives: PREP_CONTENT.objectives, outlineProgress: data.outlineProgress });
  const phaseNames = { foundation: "基础覆盖", practice: "强化练习", sprint: "最后冲刺", "exam-day": "考试日" };
  const save = async () => setPrepProfile({ ...profile, startedAt: profile.startedAt === new Date(0).toISOString() ? new Date().toISOString() : profile.startedAt });
  return <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
    <section><div className="grid gap-4 sm:grid-cols-3"><Metric icon={ClockCountdown} label="备考阶段" value={phaseNames[plan.phase]} color="#1cb0f6" bg="#e8f7ff" /><Metric icon={CalendarCheck} label="距考试" value={plan.daysRemaining === undefined ? "未设置" : plan.daysRemaining > 0 ? `${plan.daysRemaining} 天` : "已到日期"} color="#ff9600" bg="#fff2dc" /><Metric icon={Target} label="今日队列" value={`${plan.dueReviews + plan.questionTarget} 项`} color="#58a700" bg="#eefbdc" /></div>
      {!plan.isStudyDay ? <div className="mt-5 rounded-[1.6rem] bg-[#f3f3ef] p-6"><h2 className="text-xl font-black">今天是计划休息日</h2><p className="mt-2 font-semibold text-[#777]">到期复习仍可完成；新的练习任务会留到下一个学习日。</p></div> : <div className="mt-5 space-y-4">{plan.carryover > 0 && <p className="rounded-xl bg-[#fff7df] p-3 text-sm font-bold text-[#89672c]">已顺延 {plan.carryover} 项未完成任务；今日总量已限制在日目标的两倍以内。</p>}<TaskCard number="1" title={`完成 ${plan.dueReviews} 项到期复习`} text="错题和词汇卡优先，先处理即将遗忘的内容。" href="/review" /><TaskCard number="2" title={`完成 ${plan.questionTarget} 道薄弱域练习`} text={plan.allocation.map((item) => `D${item.domainId.slice(1)} ${item.count} 题`).join(" · ") || "到期复习已占满今日目标"} href="/learn" /><button onClick={onOpenOutline} className="flex w-full items-center gap-4 rounded-[1.5rem] border-2 border-[#e8e8e3] bg-white p-5 text-left"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f2e9ff] font-black text-[#874eb0]">3</span><span><span className="block font-black">学习一个考纲目标</span><span className="mt-1 block text-sm font-semibold text-[#777]">{plan.objective ? `${plan.objective.number} ${plan.objective.title}` : "全部目标已掌握"}</span></span></button>{plan.scheduleMock && <TaskCard number="4" title="今天安排一场模考" text="每 7 个学习日检验一次综合判断；考前 48 小时自动停止整卷安排。" href="/exam" />}</div>}
    </section>
    <aside><div className="rounded-[1.7rem] border-2 border-[#e8e8e3] bg-white p-5"><h2 className="text-lg font-black">学习计划设置</h2><label className="mt-5 block text-sm font-black">考试日期<input type="date" value={profile.examDate ?? ""} onChange={(event) => setProfile({ ...profile, examDate: event.target.value || undefined })} className="mt-2 h-11 w-full rounded-xl border-2 border-[#deded8] px-3" /></label><label className="mt-4 block text-sm font-black">每日题量<input type="number" min={1} max={500} value={profile.dailyQuestionTarget} onChange={(event) => setProfile({ ...profile, dailyQuestionTarget: Math.max(1, Number(event.target.value)) })} className="mt-2 h-11 w-full rounded-xl border-2 border-[#deded8] px-3" /></label><fieldset className="mt-4"><legend className="text-sm font-black">每周学习日</legend><div className="mt-2 grid grid-cols-7 gap-1">{["日","一","二","三","四","五","六"].map((label, day) => <button key={day} type="button" onClick={() => setProfile({ ...profile, studyWeekdays: profile.studyWeekdays.includes(day) ? profile.studyWeekdays.filter((item) => item !== day) : [...profile.studyWeekdays, day].sort() })} className={cn("rounded-lg py-2 text-xs font-black", profile.studyWeekdays.includes(day) ? "bg-[#58cc02] text-white" : "bg-[#f1f1ed] text-[#888]")}>{label}</button>)}</div></fieldset><Button className="mt-5 w-full" onClick={() => void save()} disabled={!profile.studyWeekdays.length}>保存计划</Button></div></aside>
  </div>;
}

function Metric({ icon: Icon, label, value, color, bg }: { icon: typeof Target; label: string; value: string; color: string; bg: string }) { return <div className="rounded-[1.5rem] p-5" style={{ backgroundColor: bg }}><Icon size={25} weight="duotone" style={{ color }} /><p className="mt-3 text-xs font-black text-[#777]">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>; }
function TaskCard({ number, title, text, href }: { number: string; title: string; text: string; href: string }) { return <Link href={href} className="flex items-center gap-4 rounded-[1.5rem] border-2 border-[#e8e8e3] bg-white p-5 transition hover:-translate-y-0.5"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e8f7ff] font-black text-[#168fc7]">{number}</span><span><span className="block font-black">{title}</span><span className="mt-1 block text-sm font-semibold text-[#777]">{text}</span></span></Link>; }

function OutlinePanel() {
  const { data, setOutlineProgress } = useAppData();
  const statuses = new Map(data.outlineProgress.map((item) => [item.objectiveId, item.status]));
  const setStatus = (objectiveId: string, status: OutlineProgressStatus) => setOutlineProgress({ objectiveId, status, updatedAt: new Date().toISOString() });
  return <div className="space-y-5">{DOMAINS.map((domain) => { const objectives = PREP_CONTENT.objectives.filter((item) => item.domainId === domain.id); const answers = data.answers.filter((answer) => answer.domainId === domain.id); const mastered = objectives.filter((item) => statuses.get(item.id) === "mastered").length; return <details key={domain.id} className="rounded-[1.7rem] border-2 border-[#e8e8e3] bg-white p-5" open={domain.id === "d1"}><summary className="flex cursor-pointer list-none items-center gap-4"><span className="grid size-12 place-items-center rounded-xl font-black" style={{ backgroundColor: domain.softColor, color: domain.color }}>D{domain.number}</span><span className="min-w-0"><span className="block font-black">{domain.name}</span><span className="text-sm font-semibold text-[#888]">{mastered}/{objectives.length} 已掌握 · {answers.length} 道答题 · {percent(answers.filter((item) => item.correct).length, answers.length)}% 正确</span></span><span className="ml-auto rounded-lg px-2 py-1 text-xs font-black" style={{ backgroundColor: domain.softColor, color: domain.color }}>{domain.weight}%</span></summary><div className="mt-5 space-y-3 border-t-2 border-[#f1f1ed] pt-5">{objectives.map((objective) => { const status = statuses.get(objective.id) ?? "not-started"; return <article key={objective.id} className="rounded-xl bg-[#f7f7f3] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start"><div className="flex-1"><h3 className="font-black">{objective.number} {objective.title}</h3>{objective.bullets.length > 0 && <ul className="mt-2 grid gap-1 text-sm font-semibold text-[#777] sm:grid-cols-2">{objective.bullets.map((bullet) => <li key={bullet}>· {bullet}</li>)}</ul>}</div><select aria-label={`${objective.number} 掌握状态`} value={status} onChange={(event) => void setStatus(objective.id, event.target.value as OutlineProgressStatus)} className={cn("h-10 rounded-lg px-3 text-sm font-black", status === "mastered" ? "bg-[#e7f8d8] text-[#438c0d]" : status === "learning" ? "bg-[#e8f7ff] text-[#168fc7]" : "bg-white text-[#888]")}><option value="not-started">未开始</option><option value="learning">学习中</option><option value="mastered">已掌握</option></select></div></article>; })}<div className="flex justify-end"><Button asChild variant="secondary"><Link href={`/learn?domain=${domain.id}`}>进入本域练习</Link></Button></div></div></details>; })}<p className="rounded-xl bg-[#eef8fd] p-4 text-sm font-semibold leading-6 text-[#667780]">考纲来源：ISC2 CISSP Certification Exam Outline，2024-04-15 生效；本站不根据关键词虚构子目标级题目覆盖，只关联到可信的知识域层级。</p></div>;
}

function StrategyPanel() {
  const strategies = PREP_CONTENT.cards.filter((card) => card.kind === "strategy");
  return <div><div className="rounded-[1.6rem] bg-[#fff7df] p-5"><h2 className="text-xl font-black text-[#9a6800]">审题辅助已接入练习与复习</h2><p className="mt-2 font-semibold leading-7 text-[#7d7055]">系统会突出 MOST、LEAST、FIRST、BEST、NOT、Purpose/Function 等限定词，并提示双重否定；模考中不会出现任何辅助。</p></div><div className="mt-5 grid gap-4 sm:grid-cols-2">{strategies.map((card, index) => <article key={card.id} className="rounded-[1.5rem] border-2 border-[#e8e8e3] bg-white p-5"><span className="text-xs font-black text-[#58a700]">策略 {index + 1}</span><h2 className="mt-2 text-lg font-black">{card.title}</h2><p className="mt-2 font-semibold leading-7 text-[#666]">{card.back}</p><p className="mt-4 text-xs font-bold text-[#aaa]">个人备考经验 · 来源第 {card.sources[0].page} 页</p></article>)}</div></div>;
}

function CardsPanel() {
  const { data, setPrepProfile, upsertReview } = useAppData();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<PrepCardKind | "all">("all");
  const [status, setStatus] = useState<VerificationStatus | "all">("all");
  const [domain, setDomain] = useState<DomainId | "all">("all");
  const [page, setPage] = useState(0);
  const [dueOnly, setDueOnly] = useState(false);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  useEffect(() => setDueOnly(new URLSearchParams(window.location.search).get("review") === "due"), []);
  const filtered = useMemo(() => PREP_CONTENT.cards.filter((card) => card.kind !== "strategy" && (kind === "all" || card.kind === kind) && (status === "all" || card.verificationStatus === status) && (domain === "all" || card.domainId === domain) && (!query || `${card.title} ${card.front} ${card.back}`.toLowerCase().includes(query.toLowerCase())) && (!dueOnly || data.reviews.some((review) => review.targetType === "prep-card" && review.targetId === card.id && new Date(review.due) <= new Date())) && (!favoriteOnly || data.prepProfile.favoriteCardIds.includes(card.id))), [data.prepProfile.favoriteCardIds, data.reviews, domain, dueOnly, favoriteOnly, kind, query, status]);
  const visible = filtered.slice(page * 20, page * 20 + 20);
  const reviewCard = async (card: PrepCard, correct: boolean) => { const previous = data.reviews.find((item) => item.targetType === "prep-card" && item.targetId === card.id); await upsertReview(scheduleReview(card.id, previous, correct, "概念盲区", "prep-card")); };
  const toggleFavorite = (card: PrepCard) => setPrepProfile({ ...data.prepProfile, favoriteCardIds: data.prepProfile.favoriteCardIds.includes(card.id) ? data.prepProfile.favoriteCardIds.filter((id) => id !== card.id) : [...data.prepProfile.favoriteCardIds, card.id] });
  return <div><div className="flex flex-col gap-3 rounded-[1.5rem] bg-[#f1f1ed] p-3 lg:flex-row"><label className="flex flex-1 items-center gap-2 rounded-xl bg-white px-4"><MagnifyingGlass size={19} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="搜索词汇或知识提示" className="h-11 flex-1 bg-transparent font-bold outline-none" /></label><CardSelect value={kind} onChange={(value) => { setKind(value as PrepCardKind | "all"); setPage(0); }} options={[["all","全部类型"],["knowledge","知识核验"],["vocabulary","英文词汇"]]} /><CardSelect value={status} onChange={(value) => { setStatus(value as VerificationStatus | "all"); setPage(0); }} options={[["all","全部状态"],["verified","已核验"],["disputed","有争议"],["outdated","可能过时"],["pending","待核验"]]} /><select value={domain} onChange={(event) => { setDomain(event.target.value as DomainId | "all"); setPage(0); }} className="h-11 rounded-xl bg-white px-3 text-sm font-black"><option value="all">全部知识域</option>{DOMAINS.map((item) => <option key={item.id} value={item.id}>D{item.number}</option>)}</select><button type="button" onClick={() => setFavoriteOnly((value) => !value)} className={cn("flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-black", favoriteOnly ? "bg-[#fff0f0] text-[#d83a3a]" : "bg-white text-[#777]")}><Heart size={18} weight={favoriteOnly ? "fill" : "bold"} />收藏</button></div><p className="mt-4 text-sm font-semibold text-[#777]">共 {filtered.length} 张。个人知识笔记在补充权威依据前不能进入 FSRS；词汇卡可以正常复习。</p><div className="mt-5 space-y-3">{visible.map((card) => <PrepCardItem key={card.id} card={card} favorite={data.prepProfile.favoriteCardIds.includes(card.id)} review={data.reviews.find((item) => item.targetType === "prep-card" && item.targetId === card.id)} onFavorite={toggleFavorite} onReview={reviewCard} />)}</div>{filtered.length > 20 && <div className="mt-5 flex justify-center gap-3"><Button variant="secondary" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>上一页</Button><span className="self-center text-sm font-black">{page + 1}/{Math.ceil(filtered.length / 20)}</span><Button variant="secondary" disabled={(page + 1) * 20 >= filtered.length} onClick={() => setPage((value) => value + 1)}>下一页</Button></div>}</div>;
}

function CardSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[][] }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-xl bg-white px-3 text-sm font-black">{options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>; }

function PrepCardItem({ card, favorite, review, onFavorite, onReview }: { card: PrepCard; favorite: boolean; review?: { due: string; reps: number }; onFavorite: (card: PrepCard) => Promise<void>; onReview: (card: PrepCard, correct: boolean) => Promise<void> }) {
  const { data } = useAppData();
  const [ai, setAI] = useState<{ explanation: string; caution: string }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const labels: Record<VerificationStatus, string> = { verified: "已核验", disputed: "有争议", outdated: "可能过时", pending: "待核验" };
  const askAI = async () => { setLoading(true); setError(""); try { setAI(await explainPrepCard(data.ai, card)); } catch (cause) { setError(cause instanceof Error ? cause.message : "AI 讲解失败"); } finally { setLoading(false); } };
  return <details className="rounded-[1.4rem] border-2 border-[#e8e8e3] bg-white p-4"><summary className="flex cursor-pointer list-none items-start gap-3"><span className={cn("rounded-lg px-2 py-1 text-xs font-black", card.verificationStatus === "verified" ? "bg-[#e8f7d8] text-[#438c0d]" : "bg-[#fff2d4] text-[#916815]")}>{labels[card.verificationStatus]}</span><span className="min-w-0 flex-1 font-black">{card.title}</span>{card.domainId && <span className="text-xs font-black text-[#999]">D{card.domainId.slice(1)}</span>}<button type="button" aria-label={favorite ? "取消收藏" : "收藏卡片"} onClick={(event) => { event.preventDefault(); void onFavorite(card); }} className={cn("grid size-8 place-items-center rounded-lg", favorite ? "bg-[#fff0f0] text-[#d83a3a]" : "bg-[#f3f3ef] text-[#aaa]")}><Heart size={17} weight={favorite ? "fill" : "bold"} /></button></summary><div className="mt-4 border-t-2 border-[#f1f1ed] pt-4"><p className="font-black">{card.front}</p><p className="mt-2 font-semibold leading-7 text-[#666]">{card.back}</p>{card.correction && <p className="mt-3 rounded-xl bg-[#fff7df] p-3 text-sm font-semibold leading-6 text-[#816b3f]">{card.correction}</p>}{ai && <div className="mt-3 rounded-xl bg-[#eaf8ff] p-3 text-sm font-semibold leading-6 text-[#55747f]"><p>{ai.explanation}</p><p className="mt-2 font-black">提示：{ai.caution}</p></div>}<div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={(event) => { event.preventDefault(); void askAI(); }} disabled={loading}><Sparkle size={16} />{loading ? "AI 讲解中…" : "AI 讲解"}</Button>{card.reviewEligible && <><Button size="sm" variant="secondary" onClick={(event) => { event.preventDefault(); void onReview(card, false); }}>{review ? "忘记了" : "加入复习"}</Button>{review && <Button size="sm" onClick={(event) => { event.preventDefault(); void onReview(card, true); }}>已掌握</Button>}</>}{review && <span className="self-center text-xs font-bold text-[#999]">复习 {review.reps} 次 · 下次 {new Date(review.due).toLocaleDateString("zh-CN")}</span>}{error && <span className="self-center text-xs font-bold text-[#c63838]">{error}</span>}</div><p className="mt-4 text-xs font-bold text-[#aaa]">来源：{card.sources[0].document} · 第 {card.sources[0].page} 页</p></div></details>;
}

function ChecklistPanel() {
  const { data, setChecklistProgress } = useAppData();
  const completed = new Map(data.checklistProgress.map((item) => [item.itemId, item.completed]));
  const done = PREP_CONTENT.checklist.filter((item) => completed.get(item.id)).length;
  const stale = (verifiedAt?: string) => !verifiedAt || Math.abs(Date.now() - new Date(verifiedAt).getTime()) / 86_400_000 > 180;
  return <div className="grid gap-6 xl:grid-cols-[1fr_20rem]"><section><div className="space-y-3">{PREP_CONTENT.checklist.map((item) => { const checked = completed.get(item.id) ?? false; const needsRefresh = item.dynamic && stale(item.source.verifiedAt); return <label key={item.id} className={cn("flex cursor-pointer items-start gap-4 rounded-[1.4rem] border-2 p-4", checked ? "border-[#cce9b4] bg-[#f1fbe8]" : "border-[#e8e8e3] bg-white")}><input type="checkbox" checked={checked} onChange={(event) => void setChecklistProgress({ itemId: item.id, completed: event.target.checked, updatedAt: new Date().toISOString() })} className="mt-1 size-5 accent-[#58cc02]" /><span className="flex-1"><span className="font-black">{item.title}</span><span className="mt-1 block text-sm font-semibold leading-6 text-[#777]">{item.description}</span>{needsRefresh && <span className="mt-2 flex items-center gap-1 text-xs font-black text-[#c27700]"><WarningCircle size={16} weight="fill" />动态信息尚未核实或已超过 180 天，请打开官方来源确认</span>}{item.source.url && <a href={item.source.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="mt-2 inline-block text-xs font-black text-[#168fc7] hover:underline">打开官方来源 ↗</a>}</span>{checked && <CheckCircle size={24} weight="fill" className="text-[#58a700]" />}</label>; })}</div></section><aside><div className="sticky top-28 rounded-[1.6rem] bg-[#eefbdc] p-6"><Check className="text-[#58a700]" size={32} weight="bold" /><p className="mt-4 text-4xl font-black">{done}/{PREP_CONTENT.checklist.length}</p><p className="mt-1 font-bold text-[#6d8061]">已完成清单</p>{data.prepProfile.examDate && <p className="mt-4 border-t border-[#cfe7bd] pt-4 text-sm font-bold text-[#6d8061]">距考试 {Math.max(0, daysUntil(data.prepProfile.examDate) ?? 0)} 天</p>}</div></aside></div>;
}
