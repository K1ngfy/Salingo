"use client";

import { useState } from "react";
import { Brain, CalendarCheck, Heart, SlidersHorizontal } from "@phosphor-icons/react";
import { PracticeSession } from "@/components/practice-session";
import { useAppData } from "@/components/data-provider";
import { Button } from "@/components/ui/button";
import { BankSelector, ContentLanguageToggle } from "@/components/bank-controls";
import { DOMAINS, getDomain } from "@/lib/domains";
import { getQuestionBank, questionBankId } from "@/lib/question-banks";
import { cn } from "@/lib/utils";
import type { BankId, DomainId, MistakeType, Question, ReviewCardState } from "@/lib/types";
import { PREP_CARDS } from "@/data/prep-source";

type ReviewView = "due" | "favorites";

export default function ReviewPage() {
  const { data, setQuestionFavorite } = useAppData();
  const [view, setView] = useState<ReviewView>("due");
  const [started, setStarted] = useState(false);
  const [bankId, setBankId] = useState<BankId | "all">("all");
  const [domain, setDomain] = useState<DomainId | "all">("all");
  const [mistake, setMistake] = useState<MistakeType | "all">("all");

  const due = data.reviews.filter((item) => new Date(item.due) <= new Date());
  const dueCards = due.filter((item) => item.targetType === "prep-card" && PREP_CARDS.some((card) => card.id === item.targetId));
  const filteredDue = due.filter((item) => {
    if (item.targetType !== "question") return false;
    const question = data.questions.find((candidate) => candidate.id === item.targetId);
    if (!question) return false;
    return (bankId === "all" || questionBankId(question) === bankId)
      && (domain === "all" || question.domainId === domain)
      && (mistake === "all" || item.mistakeType === mistake);
  });
  const filteredFavorites = data.questionFavorites.flatMap((favorite) => {
    const question = data.questions.find((candidate) => candidate.id === favorite.questionId);
    if (!question) return [];
    if (bankId !== "all" && questionBankId(question) !== bankId) return [];
    if (domain !== "all" && question.domainId !== domain) return [];
    return [{ favorite, question }];
  });

  if (started) {
    const questionIds = view === "favorites"
      ? filteredFavorites.map((item) => item.question.id)
      : filteredDue.map((item) => item.targetId);
    return <PracticeSession reviewMode={view === "due"} sessionMode={view === "favorites" ? "favorites" : "practice"} questionIds={questionIds} onExit={() => setStarted(false)} />;
  }

  const favoriteIds = new Set(data.questionFavorites.map((favorite) => favorite.questionId));
  const toggleFavorite = (questionId: string) => setQuestionFavorite(questionId, !favoriteIds.has(questionId));
  const visibleCount = view === "due" ? filteredDue.length + dueCards.length : filteredFavorites.length;

  return <div className="grid gap-8 xl:grid-cols-[1fr_21rem]">
    <section className="min-w-0">
      <p className="flex items-center gap-2 text-sm font-black text-[var(--c-ff4b4b)]"><Brain size={21} weight="fill" />复习中心</p>
      <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] sm:text-4xl">重点内容，反复巩固</h1>
      <p className="mt-3 max-w-2xl font-semibold leading-7 text-[var(--c-777)]">到期复习由 FSRS 动态安排；收藏题目独立保存，可以随时集中查看和再练。</p>

      <div className="mt-7 inline-flex rounded-[1.2rem] bg-[var(--c-f1f1ed)] p-1.5">
        <button type="button" onClick={() => setView("due")} className={cn("rounded-xl px-4 py-2.5 text-sm font-black transition", view === "due" ? "bg-[var(--surface)] text-[var(--c-ff4b4b)] shadow-sm" : "text-[var(--c-777)]")}>到期复习 <span className="ml-1 text-xs">{due.filter((item) => item.targetType === "question").length}</span></button>
        <button type="button" onClick={() => setView("favorites")} className={cn("rounded-xl px-4 py-2.5 text-sm font-black transition", view === "favorites" ? "bg-[var(--surface)] text-[var(--c-ff4b4b)] shadow-sm" : "text-[var(--c-777)]")}><Heart className="mr-1 inline" size={16} weight={view === "favorites" ? "fill" : "bold"} />收藏题目 <span className="ml-1 text-xs">{data.questionFavorites.length}</span></button>
      </div>

      <div className="mt-5 flex flex-wrap gap-3 rounded-[1.5rem] bg-[var(--c-f3f3ef)] p-3">
        <BankSelector value={bankId} onChange={(value) => setBankId(value)} allowAll />
        <label className="flex items-center gap-2 rounded-xl bg-[var(--surface)] px-3"><SlidersHorizontal size={18} weight="bold" /><span className="sr-only">按知识域筛选</span><select value={domain} onChange={(event) => setDomain(event.target.value as DomainId | "all")} className="h-11 bg-transparent text-sm font-bold outline-none"><option value="all">全部知识域</option>{DOMAINS.map((item) => <option key={item.id} value={item.id}>D{item.number} · {item.shortName}</option>)}</select></label>
        {view === "due" && <label className="rounded-xl bg-[var(--surface)] px-3"><span className="sr-only">按错误类型筛选</span><select value={mistake} onChange={(event) => setMistake(event.target.value as MistakeType | "all")} className="h-11 bg-transparent text-sm font-bold outline-none"><option value="all">全部错误类型</option><option>概念盲区</option><option>审题失误</option><option>混淆考点</option></select></label>}
        <ContentLanguageToggle />
      </div>

      {view === "due" && dueCards.length > 0 && <a href="/prep?tab=cards&review=due" className="mt-5 flex items-center justify-between rounded-[1.4rem] bg-[var(--c-f2e9ff)] p-4 font-black text-[var(--c-7d45a2)]"><span>{dueCards.length} 张备考卡今日到期</span><span>去复习 →</span></a>}

      {view === "due"
        ? <DueReviewList reviews={filteredDue} questions={data.questions} favoriteIds={favoriteIds} onFavorite={toggleFavorite} />
        : <FavoriteQuestionList items={filteredFavorites} onFavorite={toggleFavorite} />}
    </section>

    <aside className="min-w-0">
      <div className={cn("sticky top-28 rounded-[1.7rem] p-6", view === "due" ? "bg-[var(--c-fff0f0)]" : "bg-[var(--c-fff5dc)]")}>
        <p className={cn("text-sm font-black", view === "due" ? "text-[var(--c-d83a3a)]" : "text-[var(--c-a66700)]")}>{view === "due" ? "今日队列" : "收藏题目"}</p>
        <p className="mt-3 text-5xl font-black tabular-nums">{visibleCount}</p>
        <p className={cn("mt-1 font-bold", view === "due" ? "text-[var(--c-9b6262)]" : "text-[var(--c-89672c)]")}>{view === "due" ? "项待复习内容" : "道符合筛选条件"}</p>
        <Button variant={view === "due" ? "danger" : "secondary"} size="lg" className="mt-6 w-full" onClick={() => setStarted(true)} disabled={view === "due" ? !filteredDue.length : !filteredFavorites.length}>{view === "due" ? "开始题目复习" : "开始收藏题练习"}</Button>
        <p className={cn("mt-4 text-xs font-semibold leading-5", view === "due" ? "text-[var(--c-a47878)]" : "text-[var(--c-987b47)]")}>{view === "due" ? "复习调度由 FSRS v6 驱动，目标记忆保持率为 90%。" : "每组随机抽取最多 10 题；答错仍会进入到期复习。"}</p>
      </div>
    </aside>
  </div>;
}

function DueReviewList({ reviews, questions, favoriteIds, onFavorite }: {
  reviews: ReviewCardState[];
  questions: Question[];
  favoriteIds: Set<string>;
  onFavorite: (questionId: string) => Promise<void>;
}) {
  if (!reviews.length) return <EmptyState title="没有符合条件的到期题目" description="先去闯关练习，答错的题会自动进入这里。" />;
  return <div className="mt-5 space-y-3">{reviews.map((review) => {
    const question = questions.find((candidate) => candidate.id === review.targetId);
    if (!question) return null;
    const domain = question.domainId ? getDomain(question.domainId) : undefined;
    const favorite = favoriteIds.has(question.id);
    return <article key={review.id} className="flex items-start gap-4 rounded-[1.4rem] border-2 border-[var(--c-e9e9e4)] bg-[var(--surface)] p-4">
      <span className="mt-1 grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--c-e8f7ff)] font-black text-[var(--c-168fc7)]">{domain ? `D${domain.number}` : "综"}</span>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><span className="text-xs font-black text-[var(--c-ff4b4b)]">今日到期</span><span className="text-xs font-bold text-[var(--c-999)]">{review.mistakeType}</span><span className="text-xs font-bold text-[var(--c-999)]">已复习 {review.reps} 次</span></div><p className="mt-1 line-clamp-2 font-bold leading-6">{question.stem}</p></div>
      <button type="button" onClick={() => void onFavorite(question.id)} aria-label={favorite ? "取消收藏题目" : "收藏题目"} aria-pressed={favorite} className={cn("grid size-10 shrink-0 place-items-center rounded-xl", favorite ? "bg-[var(--c-fff0f0)] text-[var(--c-ff4b4b)]" : "bg-[var(--c-f3f3ef)] text-[var(--c-aaa)]")}><Heart size={21} weight={favorite ? "fill" : "bold"} /></button>
    </article>;
  })}</div>;
}

function FavoriteQuestionList({ items, onFavorite }: {
  items: Array<{ favorite: { questionId: string; createdAt: string }; question: Question }>;
  onFavorite: (questionId: string) => Promise<void>;
}) {
  if (!items.length) return <EmptyState title="还没有符合条件的收藏题目" description="刷题时点击题目上方的小爱心，重点题目就会出现在这里。" favorite />;
  return <div className="mt-5 space-y-3">{items.map(({ favorite, question }) => {
    const domain = question.domainId ? getDomain(question.domainId) : undefined;
    const bank = getQuestionBank(questionBankId(question));
    return <article key={favorite.questionId} className="flex items-start gap-4 rounded-[1.4rem] border-2 border-[var(--c-e9e9e4)] bg-[var(--surface)] p-4">
      <span className="mt-1 grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--c-fff0f0)] font-black text-[var(--c-ff4b4b)]">{domain ? `D${domain.number}` : "综"}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-2"><span className="text-xs font-black text-[var(--c-ff4b4b)]">{bank.name}</span>{domain && <span className="text-xs font-bold text-[var(--c-999)]">{domain.shortName}</span>}<span className="text-xs font-bold text-[var(--c-999)]">收藏于 {new Date(favorite.createdAt).toLocaleDateString("zh-CN")}</span></div>
        <p className="mt-1 font-bold leading-6">{question.stem}</p>
        <p className="mt-2 text-sm font-semibold text-[var(--c-777)]">{question.explanation.knowledgePoint}</p>
      </div>
      <button type="button" onClick={() => void onFavorite(question.id)} aria-label="取消收藏题目" aria-pressed="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--c-fff0f0)] text-[var(--c-ff4b4b)]"><Heart size={21} weight="fill" /></button>
    </article>;
  })}</div>;
}

function EmptyState({ title, description, favorite = false }: { title: string; description: string; favorite?: boolean }) {
  return <div className="mt-5 rounded-[1.8rem] border-2 border-dashed border-[var(--c-deded8)] p-10 text-center">{favorite ? <Heart className="mx-auto text-[var(--c-ff7a7a)]" size={52} weight="duotone" /> : <CalendarCheck className="mx-auto text-[var(--c-58cc02)]" size={52} weight="duotone" />}<h2 className="mt-3 text-xl font-black">{title}</h2><p className="mt-2 font-semibold text-[var(--c-888)]">{description}</p></div>;
}
