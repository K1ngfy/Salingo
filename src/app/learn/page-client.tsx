"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpenText, Lightning, MapTrifold } from "@phosphor-icons/react";
import { DOMAINS, getDomain } from "@/lib/domains";
import { DomainIcon } from "@/components/domain-icon";
import { PracticeSession } from "@/components/practice-session";
import { useAppData } from "@/components/data-provider";
import { Button } from "@/components/ui/button";
import type { Question } from "@/lib/types";

export function LearnPageClient() {
  const params = useSearchParams();
  const domainId = params.get("domain") ?? undefined;
  const mode = params.get("mode");
  const { data } = useAppData();
  if (domainId && mode === "practice") return <PracticeSession domainId={domainId} />;
  if (domainId) return <StudyPath domainId={domainId} questions={data.questions.filter((question) => question.domainId === domainId)} />;
  return <div><div className="max-w-2xl"><p className="flex items-center gap-2 text-sm font-black text-[#58a700]"><Lightning size={20} weight="fill" />专项闯关</p><h1 className="balance mt-2 text-3xl font-black tracking-[-0.035em] sm:text-4xl">选一个知识域，开始一组判断训练</h1><p className="mt-3 font-semibold leading-7 text-[#777]">每组最多 10 题。答错会自动进入 FSRS 复习队列，掌握度随着练习持续更新。</p></div><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{DOMAINS.map((domain) => { const count = data.questions.filter((q) => q.domainId === domain.id).length; return <Link key={domain.id} href={`/learn?domain=${domain.id}`} className="group flex min-h-48 flex-col rounded-[1.6rem] border-2 border-[#e8e8e3] bg-white p-5 shadow-[0_4px_0_#e8e8e3] transition hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100"><div className="flex items-start justify-between"><span className="grid size-13 place-items-center rounded-2xl" style={{ color: domain.color, backgroundColor: domain.softColor }}><DomainIcon name={domain.icon} size={29} /></span><span className="rounded-lg px-2 py-1 text-xs font-black" style={{ color: domain.color, backgroundColor: domain.softColor }}>{domain.weight}%</span></div><span className="mt-5 text-xs font-black text-[#aaa]">DOMAIN {domain.number}</span><h2 className="mt-1 font-black">{domain.name}</h2><div className="mt-auto flex items-center justify-between pt-4 text-sm font-bold text-[#888]"><span>{count} 道练习</span><ArrowRight className="transition group-hover:translate-x-1" size={19} weight="bold" style={{ color: domain.color }} /></div></Link>; })}</div></div>;
}

function StudyPath({ domainId, questions }: { domainId: string; questions: Question[] }) {
  const domain = getDomain(domainId);
  const blueprints = [...new Map(questions.map((question) => [question.id.replace(/-v\d+$/, ""), question])).values()].slice(0, 10);
  return <div className="mx-auto max-w-4xl">
    <Link href="/learn" className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-black text-[#777] hover:bg-[#eee]"><ArrowLeft size={18} weight="bold" />返回八域地图</Link>
    <section className="relative mt-4 overflow-hidden rounded-[2rem] p-7 text-white sm:p-9" style={{ backgroundColor: domain.color }}><div className="absolute -right-12 -top-16 size-52 rounded-full bg-white/15" /><p className="text-sm font-black text-white/75">DOMAIN {domain.number} · 官方权重 {domain.weight}%</p><h1 className="mt-2 text-3xl font-black tracking-[-0.035em] sm:text-4xl">{domain.name}</h1><p className="mt-3 max-w-2xl font-semibold leading-7 text-white/85">先用 10 个核心判断建立知识地图，再进入专项题组。每个节点都来自现行公开考纲范围。</p><Button asChild variant="secondary" size="lg" className="mt-6 border-0"><Link href={`/learn?domain=${domainId}&mode=practice`}><Lightning size={20} weight="fill" />开始本域闯关</Link></Button></section>
    <div className="relative mx-auto mt-8 max-w-2xl pb-8 before:absolute before:bottom-10 before:left-7 before:top-8 before:w-1 before:rounded-full before:bg-[#e4e4df] sm:before:left-1/2 sm:before:-translate-x-1/2">
      {blueprints.map((question, index) => <article key={question.id} className={`relative mb-5 flex items-start gap-4 sm:w-[calc(50%-2rem)] ${index % 2 ? "sm:ml-auto sm:flex-row" : "sm:flex-row-reverse sm:text-right"}`}><span className="relative z-10 grid size-14 shrink-0 place-items-center rounded-2xl border-4 border-[#fcfcf8] font-black text-white shadow-[0_4px_0_rgba(0,0,0,.12)]" style={{ backgroundColor: domain.color }}>{index + 1}</span><details className="group min-w-0 flex-1 rounded-[1.4rem] border-2 border-[#e8e8e3] bg-white p-4 shadow-[0_3px_0_#e8e8e3]"><summary className="cursor-pointer list-none"><p className="text-xs font-black" style={{ color: domain.color }}>{question.tags.slice(0, 2).join(" · ")}</p><h2 className="mt-1 font-black leading-6">{question.explanation.knowledgePoint.replace(/^D\d\s*·\s*/, "")}</h2></summary><div className="mt-3 border-t-2 border-[#f0f0ec] pt-3 text-left"><p className="text-sm font-semibold leading-6 text-[#666]">{question.explanation.logic}</p><p className="mt-2 flex gap-2 rounded-xl p-3 text-xs font-bold leading-5" style={{ color: domain.color, backgroundColor: domain.softColor }}><BookOpenText className="mt-0.5 shrink-0" size={17} weight="duotone" />{question.explanation.plainLanguage}</p></div></details></article>)}
    </div>
    <div className="rounded-[1.6rem] bg-[#f1f1ed] p-6 text-center"><MapTrifold className="mx-auto" size={35} weight="duotone" style={{ color: domain.color }} /><h2 className="mt-2 text-xl font-black">知识地图已展开</h2><p className="mt-1 text-sm font-semibold text-[#777]">通过答题把这些原则变成考试中的优先判断。</p><Button asChild size="lg" className="mt-5"><Link href={`/learn?domain=${domainId}&mode=practice`}>进入 10 题闯关<ArrowRight size={18} weight="bold" /></Link></Button></div>
  </div>;
}
