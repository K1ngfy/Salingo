"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Flag, Pause, Play, Timer, WarningCircle } from "@phosphor-icons/react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { useAppData } from "@/components/data-provider";
import { Button } from "@/components/ui/button";
import { DOMAINS, getDomain } from "@/lib/domains";
import { scheduleReview } from "@/lib/fsrs";
import { cn, formatDuration, percent } from "@/lib/utils";
import type { DomainId, ExamRecord, Question } from "@/lib/types";

type Stage = "setup" | "running" | "report";

function chooseQuestions(pool: Question[], count: number) {
  const queues = new Map<DomainId, Question[]>();
  DOMAINS.forEach((domain) => {
    const groups = new Map<string, Question[]>();
    pool.filter((question) => question.domainId === domain.id).forEach((question) => {
      const key = question.id.replace(/-v\d+$/, "");
      groups.set(key, [...(groups.get(key) ?? []), question]);
    });
    const orderedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, variants]) => variants);
    const queue: Question[] = [];
    for (let variant = 0; variant < 10; variant += 1) {
      orderedGroups.forEach((group) => { if (group[variant]) queue.push(group[variant]); });
    }
    queues.set(domain.id, queue);
  });
  const selected: Question[] = [];
  const selectedByDomain = Object.fromEntries(DOMAINS.map((domain) => [domain.id, 0])) as Record<DomainId, number>;
  const max = Math.min(count, pool.length);
  while (selected.length < max) {
    const nextDomain = DOMAINS
      .filter((domain) => (queues.get(domain.id)?.length ?? 0) > 0)
      .sort((a, b) => selectedByDomain[a.id] / a.weight - selectedByDomain[b.id] / b.weight)[0];
    if (!nextDomain) break;
    const question = queues.get(nextDomain.id)?.shift();
    if (question) { selected.push(question); selectedByDomain[nextDomain.id] += 1; }
  }
  return selected;
}

export default function ExamPage() {
  const { data, completeExam } = useAppData();
  const [stage, setStage] = useState<Stage>("setup");
  const [count, setCount] = useState(50);
  const [minutes, setMinutes] = useState(60);
  const [selectedDomains, setSelectedDomains] = useState<DomainId[]>(DOMAINS.map((item) => item.id));
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const [remaining, setRemaining] = useState(3600);
  const [paused, setPaused] = useState(false);
  const [startedAt, setStartedAt] = useState("");
  const [result, setResult] = useState<ExamRecord | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");
  const finishExamRef = useRef<() => Promise<void>>(async () => undefined);

  const finishExam = async () => {
    if (!questions.length || stage !== "running" || finishing) return;
    let correct = 0;
    const domainTotals: Partial<Record<DomainId, number>> = {};
    const domainCorrect: Partial<Record<DomainId, number>> = {};
    const nextReviews = [...data.reviews];
    questions.forEach((question) => {
      const selected = [...(answers[question.id] ?? [])].sort();
      const expected = [...question.correctAnswers].sort();
      const ok = selected.length === expected.length && selected.every((item, i) => item === expected[i]);
      domainTotals[question.domainId] = (domainTotals[question.domainId] ?? 0) + 1;
      if (ok) { correct += 1; domainCorrect[question.domainId] = (domainCorrect[question.domainId] ?? 0) + 1; }
      else {
        const previous = nextReviews.find((item) => item.questionId === question.id);
        const scheduled = scheduleReview(question.id, previous, false, "审题失误");
        const oldIndex = nextReviews.findIndex((item) => item.questionId === question.id);
        if (oldIndex >= 0) nextReviews[oldIndex] = scheduled; else nextReviews.push(scheduled);
      }
    });
    const domainScores = Object.fromEntries(Object.entries(domainTotals).map(([id, total]) => [id, percent(domainCorrect[id as DomainId] ?? 0, total ?? 0)])) as Partial<Record<DomainId, number>>;
    const exam: ExamRecord = { id: crypto.randomUUID(), startedAt, finishedAt: new Date().toISOString(), durationSeconds: minutes * 60 - remaining, questionIds: questions.map((q) => q.id), answers, score: percent(correct, questions.length), domainScores };
    setFinishing(true); setFinishError("");
    try {
      await completeExam(exam, nextReviews);
      setResult(exam); setStage("report"); setPaused(false);
    } catch (cause) {
      setFinishError(cause instanceof Error ? cause.message : "模考记录保存失败，请重试");
    } finally {
      setFinishing(false);
    }
  };
  finishExamRef.current = finishExam;

  useEffect(() => {
    if (stage !== "running" || paused) return;
    const id = window.setInterval(() => setRemaining((value) => {
      if (value <= 1) { window.clearInterval(id); window.setTimeout(() => { void finishExamRef.current(); }, 0); return 0; }
      return value - 1;
    }), 1000);
    return () => window.clearInterval(id);
  }, [stage, paused]);

  const pool = useMemo(() => data.questions.filter((q) => selectedDomains.includes(q.domainId)), [data.questions, selectedDomains]);
  const start = () => {
    const selected = chooseQuestions(pool, count);
    setQuestions(selected); setAnswers({}); setFlagged([]); setIndex(0); setRemaining(minutes * 60); setStartedAt(new Date().toISOString()); setResult(null); setStage("running");
  };

  if (stage === "setup") return <Setup count={count} setCount={setCount} minutes={minutes} setMinutes={setMinutes} selectedDomains={selectedDomains} setSelectedDomains={setSelectedDomains} available={pool.length} onStart={start} />;
  if (stage === "report" && result) return <Report result={result} questions={questions} onRestart={() => setStage("setup")} />;

  const question = questions[index];
  const selected = answers[question.id] ?? [];
  const select = (id: string) => setAnswers((current) => ({ ...current, [question.id]: question.type === "single" ? [id] : selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id] }));
  const unanswered = questions.filter((q) => !(answers[q.id]?.length)).length;
  return <div className="mx-auto max-w-5xl">
    <div className="mb-6 flex items-center gap-3 rounded-2xl border-2 border-[#e8e8e3] bg-white p-3"><button onClick={() => setStage("setup")} aria-label="退出模考" className="grid size-10 place-items-center rounded-xl hover:bg-[#eee]"><ArrowLeft size={21} weight="bold" /></button><div><p className="text-xs font-black text-[#999]">CISSP 模拟考试</p><p className="font-black">第 {index + 1} / {questions.length} 题</p></div><div className="ml-auto flex items-center gap-2 rounded-xl bg-[#f3f3ef] px-3 py-2 font-black tabular-nums"><Timer size={20} weight="duotone" className={remaining < 300 ? "text-[#ff4b4b]" : "text-[#1cb0f6]"} />{formatDuration(remaining)}</div><button onClick={() => setPaused((value) => !value)} className="grid size-10 place-items-center rounded-xl bg-[#f3f3ef]" aria-label={paused ? "继续考试" : "暂停考试"}>{paused ? <Play size={20} weight="fill" /> : <Pause size={20} weight="fill" />}</button></div>
    <div className="grid gap-5 lg:grid-cols-[1fr_16rem]">
      <section className="relative rounded-[1.8rem] border-2 border-[#e8e8e3] bg-white p-6 sm:p-8">
        <AnimatePresence>{paused && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-20 grid place-items-center rounded-[1.65rem] bg-white/95 backdrop-blur"><div className="text-center"><Pause className="mx-auto text-[#1cb0f6]" size={50} weight="duotone" /><h2 className="mt-3 text-2xl font-black">考试已暂停</h2><Button className="mt-5" variant="blue" onClick={() => setPaused(false)}><Play size={18} weight="fill" />继续考试</Button></div></motion.div>}</AnimatePresence>
        <div className="flex flex-wrap gap-2"><span className="rounded-lg bg-[#eef8fd] px-2.5 py-1 text-xs font-black text-[#168fc7]">D{getDomain(question.domainId).number} · {getDomain(question.domainId).shortName}</span><span className="rounded-lg bg-[#f3f3ef] px-2.5 py-1 text-xs font-black text-[#777]">{question.type === "multiple" ? "多选题" : "单选题"}</span></div>
        <h1 className="balance mt-5 text-xl font-black leading-[1.5] sm:text-2xl">{question.stem}</h1>
        <div className="mt-7 space-y-3">{question.options.map((option) => <button key={option.id} onClick={() => select(option.id)} className={cn("flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100", selected.includes(option.id) ? "border-[#1cb0f6] bg-[#e8f7ff] text-[#137eae] shadow-[0_3px_0_#1cb0f6]" : "border-[#deded8] shadow-[0_3px_0_#deded8] hover:bg-[#f8f8f5]")}><span className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-current/20">{selected.includes(option.id) ? <Check size={18} weight="bold" /> : option.id}</span>{option.text}</button>)}</div>
        {finishError && <p className="mt-5 rounded-xl bg-[#fff0f0] p-3 text-sm font-bold text-[#c63838]">{finishError}</p>}
        <div className="mt-8 flex items-center justify-between"><button onClick={() => setFlagged((current) => current.includes(question.id) ? current.filter((id) => id !== question.id) : [...current, question.id])} className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-black", flagged.includes(question.id) ? "bg-[#fff5dc] text-[#d38200]" : "text-[#999] hover:bg-[#f3f3ef]")}><Flag size={19} weight={flagged.includes(question.id) ? "fill" : "bold"} />标记</button><div className="flex gap-2"><Button variant="secondary" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0 || finishing}>上一题</Button>{index < questions.length - 1 ? <Button variant="blue" onClick={() => setIndex((value) => value + 1)} disabled={finishing}>下一题<ArrowRight size={18} weight="bold" /></Button> : <Button onClick={finishExam} disabled={finishing}>{finishing ? "正在保存…" : "交卷"}</Button>}</div></div>
      </section>
      <aside className="space-y-4"><div className="rounded-[1.5rem] border-2 border-[#e8e8e3] bg-white p-4"><div className="flex items-center justify-between"><h2 className="font-black">答题卡</h2><span className="text-xs font-bold text-[#999]">{unanswered} 未答</span></div><div className="mt-4 grid grid-cols-5 gap-2">{questions.map((q, i) => <button key={q.id} onClick={() => setIndex(i)} className={cn("grid aspect-square place-items-center rounded-lg text-xs font-black", i === index ? "bg-[#1cb0f6] text-white" : flagged.includes(q.id) ? "bg-[#fff1c9] text-[#bf7600]" : answers[q.id]?.length ? "bg-[#e9f8dc] text-[#58a700]" : "bg-[#f1f1ed] text-[#888]")}>{i + 1}</button>)}</div></div><div className="rounded-[1.5rem] bg-[#fff7e5] p-4"><p className="text-sm font-bold leading-6 text-[#8c6b2f]">考试中不显示答案或解析。交卷后统一批改，所有错题自动进入复习队列。</p><Button variant="secondary" className="mt-4 w-full" onClick={finishExam} disabled={finishing}>{finishing ? "正在保存…" : "提前交卷"}</Button></div></aside>
    </div>
  </div>;
}

function Setup({ count, setCount, minutes, setMinutes, selectedDomains, setSelectedDomains, available, onStart }: { count: number; setCount: (value: number) => void; minutes: number; setMinutes: (value: number) => void; selectedDomains: DomainId[]; setSelectedDomains: (value: DomainId[]) => void; available: number; onStart: () => void }) {
  const toggle = (id: DomainId) => setSelectedDomains(selectedDomains.includes(id) ? selectedDomains.filter((item) => item !== id) : [...selectedDomains, id]);
  return <div className="mx-auto max-w-4xl"><p className="flex items-center gap-2 text-sm font-black text-[#1cb0f6]"><Timer size={21} weight="fill" />全真模拟考试</p><h1 className="mt-2 text-3xl font-black tracking-[-0.035em] sm:text-4xl">配置一场属于你的模考</h1><p className="mt-3 font-semibold text-[#777]">全程计时，交卷后统一显示成绩、八域表现和完整错题。</p><div className="mt-8 grid gap-5 lg:grid-cols-2"><section className="rounded-[1.7rem] border-2 border-[#e8e8e3] bg-white p-6"><h2 className="text-lg font-black">题量与时间</h2><p className="mt-1 text-sm font-semibold text-[#888]">当前筛选范围有 {available} 道可用题目</p><div className="mt-5"><label className="text-sm font-black">题目数量</label><div className="mt-2 grid grid-cols-5 gap-2">{[50,100,150,200].map((value) => <button key={value} onClick={() => setCount(value)} className={cn("rounded-xl py-3 text-sm font-black", count === value ? "bg-[#1cb0f6] text-white shadow-[0_3px_0_#168fc7]" : "bg-[#f3f3ef] text-[#777]")}>{value}</button>)}</div></div><div className="mt-5"><label htmlFor="exam-time" className="text-sm font-black">倒计时（分钟）</label><input id="exam-time" type="number" min={5} max={360} value={minutes} onChange={(event) => setMinutes(Math.max(5, Number(event.target.value)))} className="mt-2 h-12 w-full rounded-xl border-2 border-[#deded8] px-4 font-black outline-none focus:border-[#1cb0f6]" /></div>{available < count && <p className="mt-4 flex gap-2 rounded-xl bg-[#fff4d8] p-3 text-xs font-bold leading-5 text-[#9b6a12]"><WarningCircle size={18} weight="fill" className="shrink-0" />现有题库不足 {count} 题，本次将使用全部 {available} 题且不重复。</p>}</section><section className="rounded-[1.7rem] border-2 border-[#e8e8e3] bg-white p-6"><h2 className="text-lg font-black">考试范围</h2><p className="mt-1 text-sm font-semibold text-[#888]">可选择单个或多个知识域</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{DOMAINS.map((domain) => <button key={domain.id} onClick={() => toggle(domain.id)} className={cn("flex items-center gap-3 rounded-xl border-2 p-3 text-left text-sm font-black", selectedDomains.includes(domain.id) ? "border-current" : "border-[#e8e8e3] text-[#999]")} style={selectedDomains.includes(domain.id) ? { color: domain.color, backgroundColor: domain.softColor } : undefined}><span className="grid size-7 place-items-center rounded-lg bg-white text-xs">D{domain.number}</span>{domain.shortName}</button>)}</div></section></div><div className="mt-6 flex justify-end"><Button variant="blue" size="lg" onClick={onStart} disabled={!available || !selectedDomains.length}>开始模考<ArrowRight size={19} weight="bold" /></Button></div></div>;
}

function Report({ result, questions, onRestart }: { result: ExamRecord; questions: Question[]; onRestart: () => void }) {
  const radar = DOMAINS.filter((domain) => result.domainScores[domain.id] !== undefined).map((domain) => ({ domain: `D${domain.number}`, score: result.domainScores[domain.id] ?? 0 }));
  const wrong = questions.filter((question) => { const selected = [...(result.answers[question.id] ?? [])].sort(); const correct = [...question.correctAnswers].sort(); return selected.length !== correct.length || selected.some((item, i) => item !== correct[i]); });
  return <div className="mx-auto max-w-5xl"><div className="rounded-[2rem] bg-[#263323] p-7 text-white sm:p-9"><p className="text-sm font-black tracking-[0.14em] text-[#a9d48f]">EXAM REPORT</p><div className="mt-3 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-4xl font-black tracking-[-0.04em]">本次得分 {result.score}</h1><p className="mt-2 font-bold text-[#cad5c4]">用时 {formatDuration(result.durationSeconds)} · {wrong.length} 道错题已加入复习</p></div><div className={cn("grid size-24 place-items-center rounded-full border-[10px] text-2xl font-black", result.score >= 70 ? "border-[#58cc02]" : "border-[#ff9600]")}>{result.score}%</div></div></div><div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1.1fr]"><section className="rounded-[1.7rem] border-2 border-[#e8e8e3] bg-white p-5"><h2 className="font-black">八域表现</h2><div className="mt-3 h-72"><ResponsiveContainer width="100%" height="100%"><RadarChart data={radar}><PolarGrid stroke="#ddddda" /><PolarAngleAxis dataKey="domain" tick={{ fill: "#777", fontWeight: 800, fontSize: 12 }} /><Radar dataKey="score" stroke="#1cb0f6" fill="#1cb0f6" fillOpacity={0.28} /></RadarChart></ResponsiveContainer></div><div className="space-y-2">{DOMAINS.filter((d) => result.domainScores[d.id] !== undefined).map((domain) => <div key={domain.id} className="flex items-center gap-3 text-sm"><span className="font-black">D{domain.number}</span><span className="font-bold text-[#777]">{domain.shortName}</span><span className="ml-auto font-black tabular-nums" style={{ color: domain.color }}>{result.domainScores[domain.id]}%</span></div>)}</div></section><section><div className="flex items-center justify-between"><h2 className="text-xl font-black">错题回顾</h2><span className="text-sm font-bold text-[#ff4b4b]">{wrong.length} 道</span></div><div className="mt-3 max-h-[34rem] space-y-3 overflow-auto pr-1">{wrong.length ? wrong.map((q, index) => <details key={q.id} className="rounded-[1.4rem] border-2 border-[#e8e8e3] bg-white p-4 open:border-[#ffc7c7]"><summary className="cursor-pointer list-none font-bold leading-6"><span className="mr-2 text-[#ff4b4b]">{index + 1}.</span>{q.stem}</summary><div className="mt-4 border-t-2 border-[#f0f0ec] pt-4 text-sm"><p className="font-black text-[#58a700]">正确答案：{q.correctAnswers.join("、")}</p><p className="mt-2 font-semibold leading-6 text-[#666]">{q.explanation.logic}</p></div></details>) : <div className="rounded-[1.7rem] bg-[#eefbdc] p-8 text-center"><Check className="mx-auto text-[#58a700]" size={45} weight="bold" /><p className="mt-3 font-black">全部答对</p></div>}</div></section></div><div className="mt-6 flex justify-end"><Button onClick={onRestart}>再配置一场</Button></div></div>;
}
