"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpenText, CalendarCheck, CheckCircle, Lightning, ListChecks, MapTrifold, WarningCircle } from "@phosphor-icons/react";
import { BankSelector, ContentLanguageToggle } from "@/components/bank-controls";
import { DomainIcon } from "@/components/domain-icon";
import { PracticeSession } from "@/components/practice-session";
import { useAppData } from "@/components/data-provider";
import { Button } from "@/components/ui/button";
import { getDomain } from "@/lib/domains";
import { getQuestionBank, isPracticeEnabled, questionBankId, questionSectionId } from "@/lib/question-banks";
import type { BankId, Question } from "@/lib/types";
import { buildSweepProgress } from "@/lib/sweep";
import { percent } from "@/lib/utils";

export function LearnPageClient() {
  const params = useSearchParams();
  const { data, ensureBankLoaded, loadingBankId, setPrepProfile } = useAppData();
  const requestedBank = params.get("bank") as BankId | null;
  const [bankId, setBankId] = useState<BankId>(requestedBank ?? data.preferences.activeBankId);
  useEffect(() => { void ensureBankLoaded(bankId).catch(() => undefined); }, [bankId, ensureBankLoaded]);
  const domainId = params.get("domain") ?? undefined;
  const sectionId = params.get("section") ?? undefined;
  const mode = params.get("mode");
  if (mode === "practice") return <PracticeSession bankId={bankId} domainId={domainId} sectionId={sectionId} />;
  const sweep = buildSweepProgress({ bankId, bank: getQuestionBank(bankId), questions: data.questions, answers: data.answers, dailyTarget: data.prepProfile.dailyQuestionTarget });
  if (mode === "sweep-run") return <PracticeSession bankId={bankId} sessionMode="sweep" questionIds={sweep.nextQuestionIds} />;
  if (mode === "sweep") return <SweepDashboard bankId={bankId} onBankChange={(nextBankId) => { setBankId(nextBankId); const url = new URL(window.location.href); url.searchParams.set("bank", nextBankId); window.history.replaceState(null, "", url); }} loading={loadingBankId === bankId} progress={sweep} dailyTarget={data.prepProfile.dailyQuestionTarget} onDailyTargetChange={(dailyQuestionTarget) => setPrepProfile({ ...data.prepProfile, dailyQuestionTarget })} />;
  if (domainId || sectionId) return <StudyPath bankId={bankId} sectionId={sectionId ?? domainId ?? ""} questions={data.questions.filter((question) => questionBankId(question) === bankId && questionSectionId(question) === (sectionId ?? domainId))} />;

  const bank = getQuestionBank(bankId);
  return <div>
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div className="max-w-2xl"><p className="flex items-center gap-2 text-sm font-black text-[#58a700]"><Lightning size={20} weight="fill" />专项闯关</p><h1 className="mt-2 text-3xl font-black tracking-[-0.035em] sm:text-4xl">选择题库章节，开始判断训练</h1><p className="mt-3 font-semibold leading-7 text-[#777]">每组最多 10 题。答错会自动进入 FSRS 复习队列。</p></div><div className="flex flex-col items-start gap-2 sm:items-end"><BankSelector value={bankId} onChange={(value) => value !== "all" && setBankId(value)} /><ContentLanguageToggle /></div></div>
    <section className="mt-7 flex flex-col gap-4 rounded-[1.5rem] bg-[#f3f3ef] p-4 sm:flex-row sm:items-center"><div className="flex-1"><h2 className="font-black">{bank.name}</h2><p className="mt-1 text-sm font-semibold text-[#777]">{bank.description}</p></div><Button asChild variant="blue"><Link href={`/learn?bank=${bankId}&mode=sweep`}><ListChecks size={19} weight="bold" />题库通刷</Link></Button></section>
    <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{bank.sections.map((section) => {
      const questions = data.questions.filter((question) => questionBankId(question) === bankId && questionSectionId(question) === section.id);
      const enabled = questions.filter(isPracticeEnabled).length;
      const domain = section.domainId ? getDomain(section.domainId) : undefined;
      const href = `/learn?bank=${bankId}&${section.domainId && bankId === "salingo-original" ? `domain=${section.domainId}` : `section=${section.id}`}`;
      return <Link key={section.id} href={href} className="group flex min-h-48 flex-col rounded-[1.6rem] border-2 border-[#e8e8e3] bg-white p-5 shadow-[0_4px_0_#e8e8e3] transition hover:-translate-y-1"><div className="flex items-start justify-between"><span className="grid size-13 place-items-center rounded-2xl" style={{ color: domain?.color ?? "#1cb0f6", backgroundColor: domain?.softColor ?? "#e8f7ff" }}>{domain ? <DomainIcon name={domain.icon} size={29} /> : <BookOpenText size={29} weight="duotone" />}</span><span className="rounded-lg bg-[#f3f3ef] px-2 py-1 text-xs font-black text-[#777]">{section.questionCount} 题</span></div><span className="mt-5 text-xs font-black text-[#aaa]">{section.domainId ? `DOMAIN ${section.number}` : `PRACTICE TEST ${section.number - 8}`}</span><h2 className="mt-1 font-black">{section.name}</h2><p className="mt-1 text-xs font-semibold text-[#999]">{section.english}</p><div className="mt-auto flex items-center justify-between pt-4 text-sm font-bold text-[#888]"><span>{enabled || section.questionCount} 道可练</span><ArrowRight className="transition group-hover:translate-x-1" size={19} weight="bold" /></div></Link>;
    })}</div>
  </div>;
}

function SweepDashboard({ bankId, onBankChange, loading, progress, dailyTarget, onDailyTargetChange }: {
  bankId: BankId;
  onBankChange: (bankId: BankId) => void;
  loading: boolean;
  progress: ReturnType<typeof buildSweepProgress>;
  dailyTarget: number;
  onDailyTargetChange: (target: number) => Promise<void>;
}) {
  const bank = getQuestionBank(bankId);
  return <div className="mx-auto max-w-5xl">
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="flex items-center gap-2 text-sm font-black text-[#1cb0f6]"><ListChecks size={21} weight="fill" />题库通刷</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">每天往前刷，直到整库完成</h1><p className="mt-3 font-semibold text-[#777]">按章节顺序继续，不重复已刷题目；答错题仍会进入 FSRS 复习。</p></div><div className="flex flex-col items-start gap-2 sm:items-end"><BankSelector value={bankId} onChange={(value) => value !== "all" && onBankChange(value)} /><ContentLanguageToggle /></div></div>
    <section className="relative mt-7 overflow-hidden rounded-[2rem] bg-[#263323] p-7 text-white sm:p-9"><div className="absolute -right-10 -top-16 size-56 rounded-full bg-[#1cb0f6]/20 blur-3xl" /><div className="relative"><p className="text-sm font-black text-[#acdff5]">{bank.name}</p>{loading || progress.total === 0 ? <h2 className="mt-3 text-2xl font-black">正在加载题库…</h2> : progress.finished ? <><CheckCircle size={56} weight="fill" className="mt-5 text-[#58cc02]" /><h2 className="mt-3 text-3xl font-black">这个题库已经刷完</h2><p className="mt-2 font-bold text-[#cad5c4]">共完成 {progress.total} 道可作答题目，错题可继续在复习页巩固。</p></> : <><div className="mt-5 flex items-end gap-3"><span className="text-5xl font-black tabular-nums">{percent(progress.completed, progress.total)}%</span><span className="pb-1 font-bold text-[#cad5c4]">{progress.completed} / {progress.total} 题</span></div><div className="mt-5 h-3 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#58cc02]" style={{ width: `${percent(progress.completed, progress.total)}%` }} /></div><p className="mt-3 font-bold text-[#cad5c4]">还剩 {progress.remaining} 题</p></>}</div></section>
    <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_20rem]"><section><div className="grid gap-4 sm:grid-cols-2"><div className="rounded-[1.5rem] bg-[#eefbdc] p-5"><CalendarCheck size={28} weight="duotone" className="text-[#58a700]" /><p className="mt-3 text-sm font-black text-[#777]">今日进度</p><p className="mt-1 text-3xl font-black">{progress.todayCompleted}/{progress.dailyTarget}</p><p className="mt-1 text-sm font-semibold text-[#6d8061]">今日还可刷 {progress.remainingDaily} 题</p></div><div className="rounded-[1.5rem] bg-[#e8f7ff] p-5"><ListChecks size={28} weight="duotone" className="text-[#168fc7]" /><p className="mt-3 text-sm font-black text-[#777]">章节完成</p><p className="mt-1 text-3xl font-black">{progress.sectionProgress.filter((item) => item.total > 0 && item.completed === item.total).length}/{progress.sectionProgress.filter((item) => item.total > 0).length}</p><p className="mt-1 text-sm font-semibold text-[#667780]">完成的章节数</p></div></div><div className="mt-5 space-y-3">{progress.sectionProgress.filter((item) => item.total > 0).map((item) => { const section = bank.sections.find((candidate) => candidate.id === item.sectionId); return <div key={item.sectionId} className="rounded-[1.3rem] border-2 border-[#e8e8e3] bg-white p-4"><div className="flex items-center justify-between gap-3"><p className="font-black">{section?.name ?? item.sectionId}</p><span className="text-sm font-black text-[#777]">{item.completed}/{item.total}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eeeeea]"><div className="h-full rounded-full bg-[#1cb0f6]" style={{ width: `${percent(item.completed, item.total)}%` }} /></div></div>; })}</div></section><aside><div className="sticky top-28 rounded-[1.6rem] border-2 border-[#e8e8e3] bg-white p-5"><h2 className="font-black">每日刷题目标</h2><div className="mt-4 grid grid-cols-3 gap-2">{[10, 20, 30, 50, 100, 150].map((target) => <button key={target} type="button" onClick={() => void onDailyTargetChange(target)} className={`rounded-xl py-2.5 text-sm font-black ${dailyTarget === target ? "bg-[#1cb0f6] text-white" : "bg-[#f1f1ed] text-[#777]"}`}>{target}</button>)}</div>{progress.finished ? <Button asChild className="mt-5 w-full"><Link href="/review">复习整库错题</Link></Button> : progress.remainingDaily > 0 && progress.nextQuestionIds.length > 0 ? <Button asChild size="lg" className="mt-5 w-full"><Link href={`/learn?bank=${bankId}&mode=sweep-run`}><Lightning size={20} weight="fill" />{progress.todayCompleted ? "继续今日通刷" : "开始今日通刷"}</Link></Button> : <div className="mt-5 rounded-xl bg-[#eefbdc] p-4 text-center"><CheckCircle className="mx-auto text-[#58a700]" size={32} weight="fill" /><p className="mt-2 font-black">今日目标已完成</p><p className="mt-1 text-xs font-semibold text-[#6d8061]">明天继续下一批题目</p></div>}<p className="mt-4 text-xs font-semibold leading-5 text-[#999]">缺少原图的题目不会进入通刷；每日目标与备考中心保持一致。</p></div></aside></div>
    <div className="mt-6"><Button asChild variant="secondary"><Link href={`/learn?bank=${bankId}`}><ArrowLeft size={18} />返回章节闯关</Link></Button></div>
  </div>;
}

function StudyPath({ bankId, sectionId, questions }: { bankId: BankId; sectionId: string; questions: Question[] }) {
  const bank = getQuestionBank(bankId);
  const section = bank.sections.find((item) => item.id === sectionId);
  const enabled = questions.filter(isPracticeEnabled);
  const previews = enabled.slice(0, 10);
  return <div className="mx-auto max-w-4xl"><Link href={`/learn?bank=${bankId}`} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-black text-[#777] hover:bg-[#eee]"><ArrowLeft size={18} weight="bold" />返回章节</Link><section className="relative mt-4 overflow-hidden rounded-[2rem] bg-[#263323] p-7 text-white sm:p-9"><p className="text-sm font-black text-white/70">{bank.name}</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">{section?.name ?? "专项练习"}</h1><p className="mt-3 font-semibold text-white/80">共 {questions.length || (section?.questionCount ?? 0)} 题，其中 {enabled.length || (section?.questionCount ?? 0)} 题可进入练习。</p><Button asChild variant="secondary" size="lg" className="mt-6 border-0"><Link href={`/learn?bank=${bankId}&section=${sectionId}&mode=practice`}><Lightning size={20} weight="fill" />开始本章闯关</Link></Button></section>{questions.some((question) => question.requiresFigure) && <p className="mt-5 flex gap-2 rounded-xl bg-[#fff7e5] p-3 text-sm font-bold text-[#89672c]"><WarningCircle size={20} weight="fill" />缺少原图的题目只在题库中浏览，不进入本章随机练习。</p>}<div className="relative mx-auto mt-8 max-w-2xl pb-8">{previews.map((question, index) => <article key={question.id} className="mb-4 rounded-[1.4rem] border-2 border-[#e8e8e3] bg-white p-4"><p className="text-xs font-black text-[#58a700]">预览 {index + 1}</p><h2 className="mt-1 font-bold leading-6">{question.stem}</h2><p className="mt-2 text-sm font-semibold text-[#777]">{question.explanation.knowledgePoint}</p></article>)}</div><div className="rounded-[1.6rem] bg-[#f1f1ed] p-6 text-center"><MapTrifold className="mx-auto text-[#58a700]" size={35} weight="duotone" /><h2 className="mt-2 text-xl font-black">准备开始</h2><Button asChild size="lg" className="mt-5"><Link href={`/learn?bank=${bankId}&section=${sectionId}&mode=practice`}>进入 10 题闯关<ArrowRight size={18} weight="bold" /></Link></Button></div></div>;
}
