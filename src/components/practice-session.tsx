"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, CheckCircle, Lightbulb, MapPin, Sparkle, Shuffle, X, XCircle } from "@phosphor-icons/react";
import { useAppData } from "./data-provider";
import { Button } from "./ui/button";
import { getDomain } from "@/lib/domains";
import { cn } from "@/lib/utils";
import { scheduleReview } from "@/lib/fsrs";
import type { Question } from "@/lib/types";
import type { Explanation } from "@/lib/types";
import { explainQuestion } from "@/lib/ai";

function sameAnswers(a: string[], b: string[]) {
  return a.length === b.length && [...a].sort().every((item, index) => item === [...b].sort()[index]);
}

function blueprintId(question: Question) {
  return question.id.replace(/-v\d+$/, "");
}

function diversePracticeSet(source: Question[]) {
  const groups = new Map<string, Question[]>();
  source.forEach((question) => {
    const key = blueprintId(question);
    groups.set(key, [...(groups.get(key) ?? []), question]);
  });
  const day = Math.floor(Date.now() / 86_400_000);
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, variants], index) => variants[(day + index) % variants.length])
    .slice(0, 10);
}

export function PracticeSession({ domainId, reviewMode = false, questionIds }: { domainId?: string; reviewMode?: boolean; questionIds?: string[] }) {
  const { data, recordAnswer } = useAppData();
  const questions = useMemo(() => {
    const source = reviewMode
      ? data.reviews.filter((review) => new Date(review.due) <= new Date() && (!questionIds || questionIds.includes(review.questionId))).map((review) => data.questions.find((q) => q.id === review.questionId)).filter((q): q is Question => Boolean(q))
      : data.questions.filter((question) => !domainId || question.domainId === domainId);
    return reviewMode ? source.slice(0, 10) : diversePracticeSet(source);
  }, [data.questions, data.reviews, domainId, questionIds, reviewMode]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [finished, setFinished] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [aiExplanation, setAIExplanation] = useState<Explanation | null>(null);
  const [aiLoading, setAILoading] = useState(false);
  const [aiError, setAIError] = useState("");
  const [saving, setSaving] = useState(false);

  const question = questions[index];
  if (!question && !finished) {
    return <div className="mx-auto max-w-2xl rounded-[2rem] border-2 border-[#ecece8] bg-white p-8 text-center"><CheckCircle className="mx-auto text-[#58cc02]" size={56} weight="duotone" /><h1 className="mt-4 text-2xl font-black">{reviewMode ? "今天的复习已完成" : "这个知识域暂时没有题目"}</h1><p className="mt-2 font-semibold text-[#777]">{reviewMode ? "新的错题和到期卡片会自动出现在这里。" : "可到题库导入题目，或选择其他知识域。"}</p><Button asChild className="mt-6"><Link href={reviewMode ? "/" : "/learn"}>返回总览</Link></Button></div>;
  }

  if (finished) {
    const rate = questions.length ? Math.round((sessionCorrect / questions.length) * 100) : 0;
    return <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto max-w-2xl rounded-[2rem] bg-[#effbe5] p-8 text-center sm:p-12"><span className="mx-auto grid size-20 place-items-center rounded-[1.6rem] bg-[#58cc02] text-white shadow-[0_6px_0_#46a302]"><Check size={44} weight="bold" /></span><p className="mt-7 text-sm font-black tracking-[0.16em] text-[#58a700]">SESSION COMPLETE</p><h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">这一关完成了</h1><p className="mt-3 font-bold text-[#6d8061]">答对 {sessionCorrect} / {questions.length} 题 · 正确率 {rate}%</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Button asChild><Link href="/">回到总览</Link></Button><Button variant="secondary" onClick={() => { setIndex(0); setSelected([]); setChecked(false); setFinished(false); setSessionCorrect(0); setStartedAt(Date.now()); }}>再练一轮</Button></div></motion.div>;
  }

  const domain = getDomain(question.domainId);
  const select = (answer: string) => {
    if (checked) return;
    if (question.type === "single") setSelected([answer]);
    else setSelected((current) => current.includes(answer) ? current.filter((item) => item !== answer) : [...current, answer]);
  };
  const submit = async () => {
    if (!selected.length) return;
    const isCorrect = sameAnswers(selected, question.correctAnswers);
    const previous = data.reviews.find((item) => item.questionId === question.id);
    const review = !isCorrect || reviewMode || previous ? scheduleReview(question.id, previous, isCorrect) : undefined;
    setSaving(true); setAIError("");
    try {
      await recordAnswer({ id: crypto.randomUUID(), questionId: question.id, domainId: question.domainId, selectedAnswers: selected, correct: isCorrect, answeredAt: new Date().toISOString(), durationSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)), mode: reviewMode ? "review" : "practice" }, review);
      setCorrect(isCorrect);
      setChecked(true);
      if (isCorrect) setSessionCorrect((value) => value + 1);
    } catch (cause) {
      setAIError(cause instanceof Error ? cause.message : "答题记录保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };
  const next = () => {
    if (index >= questions.length - 1) setFinished(true);
    else { setIndex((value) => value + 1); setSelected([]); setChecked(false); setCorrect(false); setAIExplanation(null); setAIError(""); setStartedAt(Date.now()); }
  };
  const requestAIExplanation = async () => {
    setAILoading(true); setAIError("");
    try { setAIExplanation(await explainQuestion(data.ai, question, selected)); }
    catch (cause) { setAIError(cause instanceof Error ? cause.message : "AI 解析失败，已保留内置解析"); }
    finally { setAILoading(false); }
  };
  const shownExplanation = aiExplanation ?? question.explanation;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3"><Link href={reviewMode ? "/review" : "/learn"} aria-label="退出本次练习" className="grid size-10 place-items-center rounded-xl text-[#888] hover:bg-[#eee]"><ArrowLeft size={22} weight="bold" /></Link><div className="h-3 flex-1 overflow-hidden rounded-full bg-[#e8e8e3]"><motion.div className="h-full rounded-full bg-[#58cc02]" animate={{ width: `${((index + (checked ? 1 : 0)) / questions.length) * 100}%` }} /></div><span className="min-w-12 text-right text-sm font-black tabular-nums text-[#888]">{index + 1}/{questions.length}</span></div>
      <div className="mb-5 flex flex-wrap items-center gap-2"><span className="rounded-lg px-2.5 py-1 text-xs font-black" style={{ backgroundColor: domain.softColor, color: domain.color }}>D{domain.number} · {domain.shortName}</span><span className="rounded-lg bg-[#f0f0ec] px-2.5 py-1 text-xs font-black text-[#777]">{question.difficulty}</span><span className="rounded-lg bg-[#f0f0ec] px-2.5 py-1 text-xs font-black text-[#777]">{question.type === "multiple" ? "多选题" : "单选题"}</span></div>
      <AnimatePresence mode="wait"><motion.div key={question.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
        <h1 className="balance text-2xl font-black leading-[1.45] tracking-[-0.025em] sm:text-3xl">{question.stem}</h1>
        {question.type === "multiple" && <p className="mt-2 text-sm font-bold text-[#168fc7]">可选择多个答案</p>}
        <div className={cn("mt-7 space-y-3", checked && !correct && "animate-[shake_.35s_ease-in-out]")}>
          {question.options.map((option) => {
            const chosen = selected.includes(option.id);
            const isAnswer = question.correctAnswers.includes(option.id);
            const state = checked ? isAnswer ? "correct" : chosen ? "wrong" : "idle" : chosen ? "selected" : "idle";
            return <button key={option.id} type="button" onClick={() => select(option.id)} disabled={checked} className={cn("flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left font-bold transition duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100", state === "idle" && "border-[#deded8] bg-white shadow-[0_3px_0_#deded8] hover:bg-[#f8f8f5]", state === "selected" && "border-[#1cb0f6] bg-[#e8f7ff] text-[#137eae] shadow-[0_3px_0_#1cb0f6]", state === "correct" && "border-[#58cc02] bg-[#eefbdc] text-[#438c0d] shadow-[0_3px_0_#58cc02]", state === "wrong" && "border-[#ff4b4b] bg-[#fff0f0] text-[#c53636] shadow-[0_3px_0_#ff4b4b]")}><span className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-current/20 text-sm font-black">{state === "correct" ? <Check size={19} weight="bold" /> : state === "wrong" ? <X size={19} weight="bold" /> : option.id}</span><span>{option.text}</span></button>;
          })}
        </div>
      </motion.div></AnimatePresence>

      <AnimatePresence>{checked && <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className={cn("mt-7 rounded-[1.6rem] p-5 sm:p-6", correct ? "bg-[#eefbdc]" : "bg-[#fff0f0]")}>
        <div className="flex items-center gap-3">{correct ? <CheckCircle size={30} weight="fill" className="text-[#58a700]" /> : <XCircle size={30} weight="fill" className="text-[#e33d3d]" />}<h2 className="text-xl font-black">{correct ? "判断正确" : `正确答案：${question.correctAnswers.join("、")}`}</h2></div>
        <div className="mt-5 grid gap-4 text-sm leading-6 sm:grid-cols-2">
          <div className="rounded-2xl bg-white/75 p-4"><h3 className="flex items-center gap-2 font-black"><Lightbulb size={19} weight="duotone" />核心作答逻辑</h3><p className="mt-2 font-semibold text-[#666]">{shownExplanation.logic}</p></div>
          <div className="rounded-2xl bg-white/75 p-4"><h3 className="flex items-center gap-2 font-black"><MapPin size={19} weight="duotone" />考点定位</h3><p className="mt-2 font-semibold text-[#666]">{shownExplanation.knowledgePoint}</p></div>
          <div className="rounded-2xl bg-white/75 p-4 sm:col-span-2"><h3 className="flex items-center gap-2 font-black"><Shuffle size={19} weight="duotone" />逐项排错</h3><ul className="mt-2 grid gap-2 sm:grid-cols-2">{question.options.map((option) => <li key={option.id} className="font-semibold text-[#666]"><strong className="text-[#444]">{option.id}.</strong> {shownExplanation.optionAnalysis[option.id]}</li>)}</ul></div>
          <div className="rounded-2xl bg-white/75 p-4 sm:col-span-2"><h3 className="font-black">通俗解读</h3><p className="mt-2 font-semibold text-[#666]">{shownExplanation.plainLanguage}</p></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3"><Button variant="secondary" size="sm" onClick={requestAIExplanation} disabled={aiLoading}><Sparkle size={17} weight="fill" />{aiLoading ? "AI 正在深度解析…" : aiExplanation ? "重新生成 AI 解析" : "AI 深度解析"}</Button>{aiExplanation && <span className="text-xs font-black text-[#168fc7]">当前显示 AI 解析</span>}{aiError && <span className="text-xs font-bold text-[#c63838]">{aiError}</span>}</div>
      </motion.section>}</AnimatePresence>
      <div className="mt-7 flex justify-end">{checked ? <Button size="lg" onClick={next}>继续<ArrowRight size={19} weight="bold" /></Button> : <Button size="lg" onClick={submit} disabled={!selected.length || saving}>{saving ? "正在保存…" : "检查答案"}</Button>}</div>
      <style jsx global>{`@keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 50%{transform:translateX(8px)} 75%{transform:translateX(-4px)} }`}</style>
    </div>
  );
}
