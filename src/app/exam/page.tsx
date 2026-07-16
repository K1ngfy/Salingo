"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Flag, Pause, Play, Timer, WarningCircle } from "@phosphor-icons/react";
import { BankSelector, ContentLanguageToggle } from "@/components/bank-controls";
import { QuestionAnswerInput, QuestionStem } from "@/components/question-answer";
import { useAppData } from "@/components/data-provider";
import { Button } from "@/components/ui/button";
import { scheduleReview } from "@/lib/fsrs";
import { getQuestionBank, isPracticeEnabled, questionBankId, questionSectionId } from "@/lib/question-banks";
import { choiceResponse, correctResponse, isCorrectResponse, responseIsComplete, responseLabel } from "@/lib/question-utils";
import { cn, formatDuration, percent } from "@/lib/utils";
import type { AnswerResponse, BankId, DomainId, ExamRecord, Question, ReviewCardState } from "@/lib/types";

type Stage = "setup" | "running" | "report";

function chooseQuestions(pool: Question[], count: number) {
  return [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(count, pool.length));
}

export default function ExamPage() {
  const { data, completeExam } = useAppData();
  const [stage, setStage] = useState<Stage>("setup");
  const [bankId, setBankId] = useState<BankId>(data.preferences.activeBankId);
  const bank = getQuestionBank(bankId);
  const [selectedSections, setSelectedSections] = useState<string[]>(bank.sections.map((item) => item.id));
  const [count, setCount] = useState(50);
  const [minutes, setMinutes] = useState(90);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerResponse>>({});
  const [index, setIndex] = useState(0);
  const [flagged, setFlagged] = useState<string[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [paused, setPaused] = useState(false);
  const [startedAt, setStartedAt] = useState("");
  const [result, setResult] = useState<ExamRecord | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");
  const finishRef = useRef<() => Promise<void>>(async () => undefined);

  const switchBank = (value: BankId | "all") => {
    if (value === "all") return;
    setBankId(value);
    setSelectedSections(getQuestionBank(value).sections.map((item) => item.id));
  };
  const pool = useMemo(() => data.questions.filter((question) => questionBankId(question) === bankId && isPracticeEnabled(question) && selectedSections.includes(questionSectionId(question))), [bankId, data.questions, selectedSections]);
  const start = () => {
    const selected = chooseQuestions(pool, count);
    setQuestions(selected); setAnswers({}); setFlagged([]); setIndex(0); setRemaining(minutes * 60); setStartedAt(new Date().toISOString()); setResult(null); setFinishError(""); setStage("running");
  };
  const finishExam = async () => {
    if (finishing || !questions.length) return;
    setFinishing(true); setFinishError("");
    try {
      const finishedAt = new Date().toISOString();
      const correctCount = questions.filter((question) => isCorrectResponse(question, answers[question.id] ?? choiceResponse([]))).length;
      const domainScores = {} as Partial<Record<DomainId, number>>;
      for (const domainId of ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"] as const) {
        const subset = questions.filter((question) => question.domainId === domainId);
        if (subset.length) domainScores[domainId] = percent(subset.filter((question) => isCorrectResponse(question, answers[question.id] ?? choiceResponse([]))).length, subset.length);
      }
      const sectionScores = Object.fromEntries([...new Set(questions.map(questionSectionId))].map((sectionId) => {
        const subset = questions.filter((question) => questionSectionId(question) === sectionId);
        return [sectionId, percent(subset.filter((question) => isCorrectResponse(question, answers[question.id] ?? choiceResponse([]))).length, subset.length)];
      }));
      const exam: ExamRecord = { id: crypto.randomUUID(), bankId, startedAt, finishedAt, durationSeconds: Math.max(0, minutes * 60 - remaining), questionIds: questions.map((question) => question.id), answers, score: percent(correctCount, questions.length), domainScores, sectionScores };
      const reviews: ReviewCardState[] = [...data.reviews];
      questions.forEach((question) => {
        const response = answers[question.id] ?? choiceResponse([]);
        if (!isCorrectResponse(question, response)) {
          const next = scheduleReview(question.id, reviews.find((item) => item.targetType === "question" && item.targetId === question.id), false);
          const existing = reviews.findIndex((item) => item.targetType === "question" && item.targetId === question.id);
          if (existing >= 0) reviews[existing] = next; else reviews.push(next);
        }
      });
      await completeExam(exam, reviews); setResult(exam); setPaused(false); setStage("report");
    } catch (cause) { setFinishError(cause instanceof Error ? cause.message : "模考记录保存失败，请重试"); }
    finally { setFinishing(false); }
  };
  finishRef.current = finishExam;
  useEffect(() => {
    if (stage !== "running" || paused) return;
    const id = window.setInterval(() => setRemaining((value) => {
      if (value <= 1) { window.clearInterval(id); window.setTimeout(() => void finishRef.current(), 0); return 0; }
      return value - 1;
    }), 1000);
    return () => window.clearInterval(id);
  }, [paused, stage]);

  if (stage === "setup") return <div className="mx-auto max-w-5xl"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="flex items-center gap-2 text-sm font-black text-[#1cb0f6]"><Timer size={21} weight="fill" />全真模拟考试</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">配置一场属于你的模考</h1></div><div className="flex flex-col items-start gap-2 sm:items-end"><BankSelector value={bankId} onChange={switchBank} /><ContentLanguageToggle /></div></div><div className="mt-8 grid gap-5 lg:grid-cols-2"><section className="rounded-[1.7rem] border-2 border-[#e8e8e3] bg-white p-6"><h2 className="text-lg font-black">题量与时间</h2><p className="mt-1 text-sm font-semibold text-[#888]">当前范围有 {pool.length} 道可用题目</p><div className="mt-5 grid grid-cols-5 gap-2">{[50, 100, 125, 150, 200].map((value) => <button key={value} onClick={() => setCount(value)} className={cn("rounded-xl py-3 text-sm font-black", count === value ? "bg-[#1cb0f6] text-white" : "bg-[#f3f3ef] text-[#777]")}>{value}</button>)}</div><label className="mt-5 block text-sm font-black">倒计时（分钟）<input type="number" min={5} max={360} value={minutes} onChange={(event) => setMinutes(Math.max(5, Number(event.target.value)))} className="mt-2 h-12 w-full rounded-xl border-2 border-[#deded8] px-4 font-black" /></label>{pool.length < count && <p className="mt-4 flex gap-2 rounded-xl bg-[#fff4d8] p-3 text-xs font-bold text-[#9b6a12]"><WarningCircle size={18} weight="fill" />将使用当前全部 {pool.length} 题且不重复。</p>}</section><section className="rounded-[1.7rem] border-2 border-[#e8e8e3] bg-white p-6"><h2 className="text-lg font-black">考试章节</h2><div className="mt-4 grid gap-2 sm:grid-cols-2">{bank.sections.map((section) => <button key={section.id} onClick={() => setSelectedSections((current) => current.includes(section.id) ? current.filter((id) => id !== section.id) : [...current, section.id])} className={cn("rounded-xl border-2 p-3 text-left text-sm font-black", selectedSections.includes(section.id) ? "border-[#1cb0f6] bg-[#e8f7ff] text-[#168fc7]" : "border-[#e8e8e3] text-[#999]")}>{section.name}<span className="mt-1 block text-xs opacity-70">{section.questionCount} 题</span></button>)}</div></section></div><div className="mt-6 flex justify-end"><Button variant="blue" size="lg" onClick={start} disabled={!pool.length || !selectedSections.length}>开始模考<ArrowRight size={19} weight="bold" /></Button></div></div>;
  if (stage === "report" && result) return <ExamReport result={result} questions={questions} onRestart={() => setStage("setup")} />;

  const question = questions[index];
  const response = answers[question.id] ?? choiceResponse([]);
  const unanswered = questions.filter((item) => !responseIsComplete(item, answers[item.id] ?? choiceResponse([]))).length;
  return <div className="mx-auto max-w-5xl"><div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-[#e8e8e3] bg-white p-3"><button onClick={() => setStage("setup")} aria-label="退出模考" className="grid size-10 place-items-center rounded-xl hover:bg-[#eee]"><ArrowLeft size={21} weight="bold" /></button><p className="font-black">第 {index + 1} / {questions.length} 题</p><div className="ml-auto flex items-center gap-2 rounded-xl bg-[#f3f3ef] px-3 py-2 font-black"><Timer size={20} />{formatDuration(remaining)}</div><button onClick={() => setPaused((value) => !value)} className="grid size-10 place-items-center rounded-xl bg-[#f3f3ef]">{paused ? <Play size={20} weight="fill" /> : <Pause size={20} weight="fill" />}</button><ContentLanguageToggle /></div><div className="grid gap-5 lg:grid-cols-[1fr_16rem]"><section className="relative rounded-[1.8rem] border-2 border-[#e8e8e3] bg-white p-6 sm:p-8">{paused && <div className="absolute inset-0 z-20 grid place-items-center rounded-[1.65rem] bg-white/95"><Button variant="blue" onClick={() => setPaused(false)}><Play size={18} weight="fill" />继续考试</Button></div>}<div className="mb-4 flex gap-2"><span className="rounded-lg bg-[#eef8fd] px-2.5 py-1 text-xs font-black text-[#168fc7]">{bank.sections.find((item) => item.id === questionSectionId(question))?.name}</span><span className="rounded-lg bg-[#f3f3ef] px-2.5 py-1 text-xs font-black">{question.type === "matching" ? "匹配题" : question.type === "multiple" ? "多选题" : "单选题"}</span></div><QuestionStem question={question} language={data.preferences.contentLanguage} /><QuestionAnswerInput question={question} response={response} onChange={(next) => setAnswers((current) => ({ ...current, [question.id]: next }))} language={data.preferences.contentLanguage} disabled={paused || finishing} />{finishError && <p className="mt-5 rounded-xl bg-[#fff0f0] p-3 text-sm font-bold text-[#c63838]">{finishError}</p>}<div className="mt-8 flex items-center justify-between"><button onClick={() => setFlagged((current) => current.includes(question.id) ? current.filter((id) => id !== question.id) : [...current, question.id])} className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-black", flagged.includes(question.id) ? "bg-[#fff5dc] text-[#d38200]" : "text-[#999]")}><Flag size={19} weight={flagged.includes(question.id) ? "fill" : "bold"} />标记</button><div className="flex gap-2"><Button variant="secondary" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}>上一题</Button>{index < questions.length - 1 ? <Button variant="blue" onClick={() => setIndex((value) => value + 1)}>下一题<ArrowRight size={18} /></Button> : <Button onClick={finishExam} disabled={finishing}>{finishing ? "正在保存…" : "交卷"}</Button>}</div></div></section><aside className="space-y-4"><div className="rounded-[1.5rem] border-2 border-[#e8e8e3] bg-white p-4"><div className="flex justify-between"><h2 className="font-black">答题卡</h2><span className="text-xs font-bold text-[#999]">{unanswered} 未答</span></div><div className="mt-4 grid grid-cols-5 gap-2">{questions.map((item, itemIndex) => <button key={item.id} onClick={() => setIndex(itemIndex)} className={cn("grid aspect-square place-items-center rounded-lg text-xs font-black", itemIndex === index ? "bg-[#1cb0f6] text-white" : flagged.includes(item.id) ? "bg-[#fff1c9]" : responseIsComplete(item, answers[item.id] ?? choiceResponse([])) ? "bg-[#e9f8dc] text-[#58a700]" : "bg-[#f1f1ed] text-[#888]")}>{itemIndex + 1}</button>)}</div></div><Button className="w-full" onClick={finishExam} disabled={finishing}>提前交卷</Button></aside></div></div>;
}

function ExamReport({ result, questions, onRestart }: { result: ExamRecord; questions: Question[]; onRestart: () => void }) {
  const bank = getQuestionBank(result.bankId);
  const wrong = questions.filter((question) => !isCorrectResponse(question, result.answers[question.id] ?? choiceResponse([])));
  return <div className="mx-auto max-w-5xl"><div className="rounded-[2rem] bg-[#263323] p-7 text-white sm:p-9"><p className="text-sm font-black text-[#a9d48f]">{bank.name}</p><h1 className="mt-3 text-4xl font-black">本次得分 {result.score}%</h1><p className="mt-2 font-bold text-[#cad5c4]">用时 {formatDuration(result.durationSeconds)} · {wrong.length} 道错题已加入复习</p></div><section className="mt-6 rounded-[1.7rem] border-2 border-[#e8e8e3] bg-white p-5"><h2 className="text-lg font-black">章节表现</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(result.sectionScores).map(([id, score]) => <div key={id} className="rounded-xl bg-[#f3f3ef] p-3"><p className="text-sm font-bold text-[#777]">{bank.sections.find((item) => item.id === id)?.name ?? id}</p><p className="mt-1 text-2xl font-black text-[#1cb0f6]">{score}%</p></div>)}</div></section><section className="mt-6"><h2 className="text-xl font-black">错题回顾</h2><div className="mt-3 space-y-3">{wrong.length ? wrong.map((question, index) => <details key={question.id} className="rounded-[1.4rem] border-2 border-[#e8e8e3] bg-white p-4"><summary className="cursor-pointer font-bold"><span className="mr-2 text-[#ff4b4b]">{index + 1}.</span>{question.stem}</summary><div className="mt-4 border-t-2 border-[#f0f0ec] pt-4 text-sm"><p className="font-black text-[#58a700]">正确答案：{responseLabel(correctResponse(question))}</p><p className="mt-2 font-semibold leading-6 text-[#666]">{question.explanation.logic}</p></div></details>) : <div className="rounded-[1.7rem] bg-[#eefbdc] p-8 text-center"><Check className="mx-auto text-[#58a700]" size={45} /><p className="mt-3 font-black">全部答对</p></div>}</div></section><div className="mt-6 flex justify-end"><Button onClick={onRestart}>再配置一场</Button></div></div>;
}
