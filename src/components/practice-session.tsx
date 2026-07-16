"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, CheckCircle, Lightbulb, MapPin, Shuffle, Sparkle, XCircle } from "@phosphor-icons/react";
import { useAppData } from "./data-provider";
import { Button } from "./ui/button";
import { ContentLanguageToggle } from "./bank-controls";
import { QuestionAnswerInput, QuestionStem } from "./question-answer";
import { getDomain } from "@/lib/domains";
import { explainQuestion } from "@/lib/ai";
import { scheduleReview } from "@/lib/fsrs";
import { getQuestionBank, isPracticeEnabled, questionBankId, questionSectionId } from "@/lib/question-banks";
import { choiceResponse, correctResponse, isCorrectResponse, questionContent, responseIsComplete, responseLabel } from "@/lib/question-utils";
import { cn } from "@/lib/utils";
import type { AnswerResponse, BankId, Explanation, MistakeType, Question, ReviewCardState } from "@/lib/types";

function diversePracticeSet(source: Question[]) {
  const shuffled = [...source].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 10);
}

export function PracticeSession({ bankId, domainId, sectionId, reviewMode = false, questionIds, sessionMode = "practice" }: {
  bankId?: BankId;
  domainId?: string;
  sectionId?: string;
  reviewMode?: boolean;
  questionIds?: string[];
  sessionMode?: "practice" | "sweep";
}) {
  const { data, recordAnswer, setPreferences, upsertReview } = useAppData();
  const activeBankId = bankId ?? data.preferences.activeBankId;
  const questions = useMemo(() => {
    const source = reviewMode
      ? data.reviews.filter((review) => review.targetType === "question" && new Date(review.due) <= new Date() && (!questionIds || questionIds.includes(review.targetId))).map((review) => data.questions.find((q) => q.id === review.targetId)).filter((q): q is Question => Boolean(q))
      : data.questions.filter((question) => questionBankId(question) === activeBankId && isPracticeEnabled(question) && (!domainId || question.domainId === domainId) && (!sectionId || questionSectionId(question) === sectionId) && (!questionIds || questionIds.includes(question.id)));
    if (reviewMode) return source.slice(0, 10);
    if (sessionMode === "sweep") {
      const byId = new Map(source.map((question) => [question.id, question]));
      return questionIds ? questionIds.map((id) => byId.get(id)).filter((question): question is Question => Boolean(question)) : source;
    }
    return diversePracticeSet(source);
  }, [activeBankId, data.questions, data.reviews, domainId, questionIds, reviewMode, sectionId, sessionMode]);
  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState<AnswerResponse>(() => choiceResponse([]));
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [finished, setFinished] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [aiExplanation, setAIExplanation] = useState<Explanation | null>(null);
  const [aiLoading, setAILoading] = useState(false);
  const [aiError, setAIError] = useState("");
  const [saving, setSaving] = useState(false);
  const [mistakeType, setMistakeType] = useState<MistakeType>("概念盲区");
  const [currentReview, setCurrentReview] = useState<ReviewCardState>();

  const question = questions[index];
  if (!question && !finished) {
    return <div className="mx-auto max-w-2xl rounded-[2rem] border-2 border-[#ecece8] bg-white p-8 text-center"><CheckCircle className="mx-auto text-[#58cc02]" size={56} weight="duotone" /><h1 className="mt-4 text-2xl font-black">{reviewMode ? "今天的复习已完成" : sessionMode === "sweep" ? "今日通刷任务已完成" : "当前范围暂时没有可作答题目"}</h1><p className="mt-2 font-semibold text-[#777]">{reviewMode ? "新的错题和到期卡片会自动出现在这里。" : sessionMode === "sweep" ? "明天继续，直到刷完整个题库。" : "缺少原图的题目可在题库浏览，但不会进入闯关。"}</p><Button asChild className="mt-6"><Link href={reviewMode ? "/review" : sessionMode === "sweep" ? `/learn?bank=${activeBankId}&mode=sweep` : "/learn"}>返回</Link></Button></div>;
  }

  if (finished) {
    const rate = questions.length ? Math.round((sessionCorrect / questions.length) * 100) : 0;
    return <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto max-w-2xl rounded-[2rem] bg-[#effbe5] p-8 text-center sm:p-12"><span className="mx-auto grid size-20 place-items-center rounded-[1.6rem] bg-[#58cc02] text-white shadow-[0_6px_0_#46a302]"><Check size={44} weight="bold" /></span><p className="mt-7 text-sm font-black tracking-[0.16em] text-[#58a700]">SESSION COMPLETE</p><h1 className="mt-2 text-3xl font-black">{sessionMode === "sweep" ? "今日通刷完成" : "这一关完成了"}</h1><p className="mt-3 font-bold text-[#6d8061]">答对 {sessionCorrect} / {questions.length} 题 · 正确率 {rate}%</p><div className="mt-8 flex justify-center"><Button asChild><Link href={reviewMode ? "/review" : sessionMode === "sweep" ? `/learn?bank=${activeBankId}&mode=sweep` : "/learn"}>返回</Link></Button></div></motion.div>;
  }

  const domain = question.domainId ? getDomain(question.domainId) : undefined;
  const bank = getQuestionBank(questionBankId(question));
  const section = bank.sections.find((item) => item.id === questionSectionId(question));
  const submit = async () => {
    if (!responseIsComplete(question, response)) return;
    const isCorrect = isCorrectResponse(question, response);
    const previous = data.reviews.find((item) => item.targetType === "question" && item.targetId === question.id);
    const review = !isCorrect || reviewMode || previous ? scheduleReview(question.id, previous, isCorrect) : undefined;
    setSaving(true); setAIError("");
    try {
      await recordAnswer({ id: crypto.randomUUID(), questionId: question.id, bankId: questionBankId(question), sectionId: questionSectionId(question), domainId: question.domainId, response, correct: isCorrect, answeredAt: new Date().toISOString(), durationSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)), mode: reviewMode ? "review" : sessionMode === "sweep" ? "sweep" : "practice" }, review);
      setCurrentReview(review);
      setCorrect(isCorrect); setChecked(true); if (isCorrect) setSessionCorrect((value) => value + 1);
    } catch (cause) { setAIError(cause instanceof Error ? cause.message : "答题记录保存失败，请重试"); }
    finally { setSaving(false); }
  };
  const next = () => {
    if (index >= questions.length - 1) setFinished(true);
    else { setIndex((value) => value + 1); setResponse(choiceResponse([])); setChecked(false); setCorrect(false); setMistakeType("概念盲区"); setCurrentReview(undefined); setAIExplanation(null); setAIError(""); setStartedAt(Date.now()); }
  };
  const requestAIExplanation = async () => {
    setAILoading(true); setAIError("");
    try { setAIExplanation(await explainQuestion(data.ai, question, response)); }
    catch (cause) { setAIError(cause instanceof Error ? cause.message : "AI 解析失败，已保留原始解析"); }
    finally { setAILoading(false); }
  };
  const content = questionContent(question, data.preferences.contentLanguage);
  const shownExplanation = aiExplanation ?? question.explanation;
  const hasOptionAnalysis = Object.values(shownExplanation.optionAnalysis).some(Boolean);

  return <div className="mx-auto max-w-3xl">
    <div className="mb-5 flex flex-wrap items-center gap-3"><Link href={reviewMode ? "/review" : sessionMode === "sweep" ? `/learn?bank=${activeBankId}&mode=sweep` : "/learn"} aria-label="退出本次练习" className="grid size-10 place-items-center rounded-xl text-[#888] hover:bg-[#eee]"><ArrowLeft size={22} weight="bold" /></Link><div className="h-3 min-w-28 flex-1 overflow-hidden rounded-full bg-[#e8e8e3]"><motion.div className="h-full rounded-full bg-[#58cc02]" animate={{ width: `${((index + (checked ? 1 : 0)) / questions.length) * 100}%` }} /></div><span className="text-sm font-black text-[#888]">{index + 1}/{questions.length}</span><button type="button" onClick={() => void setPreferences({ ...data.preferences, questionAssistEnabled: !data.preferences.questionAssistEnabled })} className={cn("rounded-xl px-3 py-2 text-xs font-black", data.preferences.questionAssistEnabled ? "bg-[#fff2b8] text-[#8a681d]" : "bg-[#f1f1ed] text-[#888]")}>审题辅助</button><ContentLanguageToggle /></div>
    <div className="mb-5 flex flex-wrap gap-2"><span className="rounded-lg bg-[#eef8fd] px-2.5 py-1 text-xs font-black text-[#168fc7]">{domain ? `D${domain.number} · ${domain.shortName}` : section?.name ?? "综合模拟"}</span><span className="rounded-lg bg-[#f0f0ec] px-2.5 py-1 text-xs font-black text-[#777]">{question.type === "matching" ? "匹配题" : question.type === "multiple" ? "多选题" : "单选题"}</span></div>
    <AnimatePresence mode="wait"><motion.div key={question.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}><QuestionStem question={question} language={data.preferences.contentLanguage} assistEnabled={data.preferences.questionAssistEnabled} />{question.type === "multiple" && <p className="mt-2 text-sm font-bold text-[#168fc7]">可选择多个答案</p>}<QuestionAnswerInput question={question} response={response} onChange={setResponse} language={data.preferences.contentLanguage} disabled={checked} reveal={checked} /></motion.div></AnimatePresence>
    <AnimatePresence>{checked && <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className={cn("mt-7 rounded-[1.6rem] p-5 sm:p-6", correct ? "bg-[#eefbdc]" : "bg-[#fff0f0]")}>
      <div className="flex items-center gap-3">{correct ? <CheckCircle size={30} weight="fill" className="text-[#58a700]" /> : <XCircle size={30} weight="fill" className="text-[#e33d3d]" />}<h2 className="text-xl font-black">{correct ? "判断正确" : `正确答案：${responseLabel(correctResponse(question))}`}</h2></div>
      <div className="mt-5 grid gap-4 text-sm leading-6 sm:grid-cols-2"><div className="rounded-2xl bg-white/75 p-4 sm:col-span-2"><h3 className="flex items-center gap-2 font-black"><Lightbulb size={19} weight="duotone" />{aiExplanation ? "AI 核心作答逻辑" : "原始解析"}</h3><p className="mt-2 font-semibold text-[#666]">{aiExplanation ? shownExplanation.logic : content.primary.explanation}</p>{content.secondary && !aiExplanation && <p className="mt-3 border-t border-[#deded8] pt-3 font-semibold text-[#778086]">{content.secondary.explanation}</p>}</div><div className="rounded-2xl bg-white/75 p-4"><h3 className="flex items-center gap-2 font-black"><MapPin size={19} weight="duotone" />考点定位</h3><p className="mt-2 font-semibold text-[#666]">{shownExplanation.knowledgePoint}</p></div><div className="rounded-2xl bg-white/75 p-4"><h3 className="font-black">通俗解读</h3><p className="mt-2 font-semibold text-[#666]">{shownExplanation.plainLanguage}</p></div>{hasOptionAnalysis && question.type !== "matching" && <div className="rounded-2xl bg-white/75 p-4 sm:col-span-2"><h3 className="flex items-center gap-2 font-black"><Shuffle size={19} weight="duotone" />逐项排错</h3><ul className="mt-2 grid gap-2 sm:grid-cols-2">{question.options.map((option) => shownExplanation.optionAnalysis[option.id] && <li key={option.id} className="font-semibold text-[#666]"><strong>{option.id}.</strong> {shownExplanation.optionAnalysis[option.id]}</li>)}</ul></div>}</div>
      {!correct && <div className="mt-4 rounded-xl bg-white/70 p-3"><p className="text-xs font-black text-[#8a6a6a]">这次错误主要属于</p><div className="mt-2 flex flex-wrap gap-2">{(["概念盲区", "审题失误", "混淆考点"] as MistakeType[]).map((type) => <button key={type} type="button" onClick={() => { setMistakeType(type); if (currentReview) { const nextReview = { ...currentReview, mistakeType: type }; setCurrentReview(nextReview); void upsertReview(nextReview); } }} className={cn("rounded-lg px-3 py-1.5 text-xs font-black", mistakeType === type ? "bg-[#ff4b4b] text-white" : "bg-[#f3f3ef] text-[#777]")}>{type}</button>)}</div></div>}
      <div className="mt-4 flex flex-wrap items-center gap-3"><Button variant="secondary" size="sm" onClick={requestAIExplanation} disabled={aiLoading}><Sparkle size={17} weight="fill" />{aiLoading ? "AI 正在深度解析…" : aiExplanation ? "重新生成 AI 解析" : "AI 深度解析"}</Button>{aiError && <span className="text-xs font-bold text-[#c63838]">{aiError}</span>}</div>
    </motion.section>}</AnimatePresence>
    <div className="mt-7 flex justify-end">{checked ? <Button size="lg" onClick={next}>继续<ArrowRight size={19} weight="bold" /></Button> : <Button size="lg" onClick={submit} disabled={!responseIsComplete(question, response) || saving}>{saving ? "正在保存…" : "检查答案"}</Button>}</div>
  </div>;
}
