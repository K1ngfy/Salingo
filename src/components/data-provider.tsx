"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { INITIAL_QUESTIONS } from "@/data/full-bank";
import type { AISettings, AnswerRecord, AppData, ExamRecord, Question, ReviewCardState } from "@/lib/types";
import { dateKey } from "@/lib/utils";

const STORAGE_KEY = "salingo:data:v1";

const defaultAI: AISettings = {
  baseUrl: process.env.NEXT_PUBLIC_AI_BASE_URL ?? "",
  apiKey: process.env.NEXT_PUBLIC_AI_API_KEY ?? "",
  model: process.env.NEXT_PUBLIC_AI_MODEL ?? "gpt-5-mini",
};

const initialData: AppData = {
  version: 1,
  questions: INITIAL_QUESTIONS,
  answers: [],
  reviews: [],
  exams: [],
  streakDates: [],
  ai: defaultAI,
};

interface DataContextValue {
  data: AppData;
  hydrated: boolean;
  update: (recipe: (current: AppData) => AppData) => void;
  addAnswer: (answer: AnswerRecord) => void;
  addQuestions: (questions: Question[]) => void;
  setReviews: (reviews: ReviewCardState[]) => void;
  addExam: (exam: ExamRecord) => void;
  setAI: (settings: AISettings) => void;
  reset: () => void;
  exportData: () => void;
  importData: (text: string) => { ok: boolean; message: string };
}

const DataContext = createContext<DataContextValue | null>(null);

function mergeSeedQuestions(saved: AppData): AppData {
  const ids = new Set(saved.questions.map((item) => item.id));
  return { ...saved, questions: [...saved.questions, ...INITIAL_QUESTIONS.filter((item) => !ids.has(item.id))] };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(initialData);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setData(mergeSeedQuestions(JSON.parse(raw) as AppData));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, hydrated]);

  const update = useCallback((recipe: (current: AppData) => AppData) => setData((current) => recipe(current)), []);
  const addAnswer = useCallback((answer: AnswerRecord) => update((current) => {
    const today = dateKey(new Date(answer.answeredAt));
    return { ...current, answers: [...current.answers, answer], streakDates: current.streakDates.includes(today) ? current.streakDates : [...current.streakDates, today] };
  }), [update]);
  const addQuestions = useCallback((questions: Question[]) => update((current) => {
    const ids = new Set(current.questions.map((item) => item.id));
    return { ...current, questions: [...current.questions, ...questions.filter((item) => !ids.has(item.id))] };
  }), [update]);
  const setReviews = useCallback((reviews: ReviewCardState[]) => update((current) => ({ ...current, reviews })), [update]);
  const addExam = useCallback((exam: ExamRecord) => update((current) => ({ ...current, exams: [...current.exams, exam] })), [update]);
  const setAI = useCallback((ai: AISettings) => update((current) => ({ ...current, ai })), [update]);
  const reset = useCallback(() => setData(initialData), []);
  const exportData = useCallback(() => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `salingo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [data]);
  const importData = useCallback((text: string) => {
    try {
      const parsed = JSON.parse(text) as AppData;
      if (parsed.version !== 1 || !Array.isArray(parsed.questions) || !Array.isArray(parsed.answers)) throw new Error();
      setData(mergeSeedQuestions(parsed));
      return { ok: true, message: "数据已导入" };
    } catch {
      return { ok: false, message: "文件格式无效，请选择 SALINGO 备份文件" };
    }
  }, []);

  const value = useMemo(() => ({ data, hydrated, update, addAnswer, addQuestions, setReviews, addExam, setAI, reset, exportData, importData }), [data, hydrated, update, addAnswer, addQuestions, setReviews, addExam, setAI, reset, exportData, importData]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useAppData() {
  const context = useContext(DataContext);
  if (!context) throw new Error("useAppData must be used inside DataProvider");
  return context;
}
