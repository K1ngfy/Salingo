"use client";

import { useState } from "react";
import { Brain, CalendarCheck, Heart, SlidersHorizontal } from "@phosphor-icons/react";
import { PracticeSession } from "@/components/practice-session";
import { useAppData } from "@/components/data-provider";
import { Button } from "@/components/ui/button";
import { BankSelector, ContentLanguageToggle } from "@/components/bank-controls";
import { DOMAINS, getDomain } from "@/lib/domains";
import { questionBankId } from "@/lib/question-banks";
import { cn } from "@/lib/utils";
import type { BankId, DomainId, MistakeType } from "@/lib/types";
import { PREP_CARDS } from "@/data/prep-source";

export default function ReviewPage() {
  const { data, upsertReview } = useAppData();
  const [started, setStarted] = useState(false);
  const [bankId, setBankId] = useState<BankId | "all">("all");
  const [domain, setDomain] = useState<DomainId | "all">("all");
  const [mistake, setMistake] = useState<MistakeType | "all">("all");
  const due = data.reviews.filter((item) => new Date(item.due) <= new Date());
  const dueCards = due.filter((item) => item.targetType === "prep-card" && PREP_CARDS.some((card) => card.id === item.targetId));
  const filtered = due.filter((item) => {
    if (item.targetType !== "question") return false;
    const question = data.questions.find((q) => q.id === item.targetId);
    if (!question) return false;
    return (bankId === "all" || questionBankId(question) === bankId) && (domain === "all" || question.domainId === domain) && (mistake === "all" || item.mistakeType === mistake);
  });
  if (started) return <PracticeSession reviewMode questionIds={filtered.map((item) => item.targetId)} />;
  const toggleFavorite = async (id: string) => {
    const review = data.reviews.find((item) => item.id === id);
    if (review) await upsertReview({ ...review, favorite: !review.favorite });
  };

  return <div className="grid gap-8 xl:grid-cols-[1fr_21rem]">
    <section>
      <p className="flex items-center gap-2 text-sm font-black text-[#ff4b4b]"><Brain size={21} weight="fill" />FSRS 智能复习</p>
      <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] sm:text-4xl">在忘记之前，再见它一次</h1>
      <p className="mt-3 max-w-2xl font-semibold leading-7 text-[#777]">系统根据每次复习表现动态计算下次出现时间。答对会拉长间隔，答错会进入高频再学习。</p>
      <div className="mt-7 flex flex-wrap gap-3 rounded-[1.5rem] bg-[#f3f3ef] p-3">
        <BankSelector value={bankId} onChange={(value) => setBankId(value)} allowAll />
        <label className="flex items-center gap-2 rounded-xl bg-white px-3"><SlidersHorizontal size={18} weight="bold" /><span className="sr-only">按知识域筛选</span><select value={domain} onChange={(event) => setDomain(event.target.value as DomainId | "all")} className="h-11 bg-transparent text-sm font-bold outline-none"><option value="all">全部知识域</option>{DOMAINS.map((item) => <option key={item.id} value={item.id}>D{item.number} · {item.shortName}</option>)}</select></label>
        <label className="rounded-xl bg-white px-3"><span className="sr-only">按错误类型筛选</span><select value={mistake} onChange={(event) => setMistake(event.target.value as MistakeType | "all")} className="h-11 bg-transparent text-sm font-bold outline-none"><option value="all">全部错误类型</option><option>概念盲区</option><option>审题失误</option><option>混淆考点</option></select></label>
        <ContentLanguageToggle />
      </div>
      {dueCards.length > 0 && <a href="/prep?tab=cards&review=due" className="mt-5 flex items-center justify-between rounded-[1.4rem] bg-[#f2e9ff] p-4 font-black text-[#7d45a2]"><span>{dueCards.length} 张备考卡今日到期</span><span>去复习 →</span></a>}
      <div className="mt-5 space-y-3">{filtered.length ? filtered.map((review) => { const question = data.questions.find((q) => q.id === review.targetId); if (!question) return null; const d = question.domainId ? getDomain(question.domainId) : undefined; return <article key={review.id} className="flex items-start gap-4 rounded-[1.4rem] border-2 border-[#e9e9e4] bg-white p-4"><span className="mt-1 grid size-10 shrink-0 place-items-center rounded-xl bg-[#e8f7ff] font-black text-[#168fc7]">{d ? `D${d.number}` : "综"}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><span className="text-xs font-black text-[#ff4b4b]">今日到期</span><span className="text-xs font-bold text-[#999]">{review.mistakeType}</span><span className="text-xs font-bold text-[#999]">已复习 {review.reps} 次</span></div><p className="mt-1 line-clamp-2 font-bold leading-6">{question.stem}</p></div><button onClick={() => toggleFavorite(review.id)} aria-label={review.favorite ? "取消收藏" : "收藏错题"} className={cn("grid size-10 shrink-0 place-items-center rounded-xl", review.favorite ? "bg-[#fff0f0] text-[#ff4b4b]" : "bg-[#f3f3ef] text-[#aaa]")}><Heart size={21} weight={review.favorite ? "fill" : "bold"} /></button></article>; }) : <div className="rounded-[1.8rem] border-2 border-dashed border-[#deded8] p-10 text-center"><CalendarCheck className="mx-auto text-[#58cc02]" size={52} weight="duotone" /><h2 className="mt-3 text-xl font-black">没有符合条件的到期题目</h2><p className="mt-2 font-semibold text-[#888]">先去闯关练习，答错的题会自动进入这里。</p></div>}</div>
    </section>
    <aside><div className="sticky top-28 rounded-[1.7rem] bg-[#fff0f0] p-6"><p className="text-sm font-black text-[#d83a3a]">今日队列</p><p className="mt-3 text-5xl font-black tabular-nums">{filtered.length + dueCards.length}</p><p className="mt-1 font-bold text-[#9b6262]">项待复习内容</p><Button variant="danger" size="lg" className="mt-6 w-full" onClick={() => setStarted(true)} disabled={!filtered.length}>开始题目复习</Button><p className="mt-4 text-xs font-semibold leading-5 text-[#a47878]">复习调度由 FSRS v6 驱动，目标记忆保持率为 90%。</p></div></aside>
  </div>;
}
