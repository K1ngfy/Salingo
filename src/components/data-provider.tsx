"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  LEGACY_STORAGE_KEY,
  addQuestions as addQuestionsToDb,
  completeExam as completeExamInDb,
  db,
  importBackup,
  initialAppData,
  initializeDatabase,
  mergeSeedQuestions,
  parseLegacyData,
  readAppData,
  recordAnswer as recordAnswerInDb,
  resetDatabase,
  saveAISettings,
  upsertReview as upsertReviewInDb,
} from "@/lib/db";
import { appDataSchema } from "@/lib/validation";
import { dateKey } from "@/lib/utils";
import type { AISettings, AnswerRecord, AppData, ExamRecord, Question, ReviewCardState } from "@/lib/types";

type StorageStatus = "loading" | "ready" | "volatile";
type ImportResult = { ok: boolean; message: string };

interface DataContextValue {
  data: AppData;
  hydrated: boolean;
  storageStatus: StorageStatus;
  storageError?: string;
  recordAnswer: (answer: AnswerRecord, review?: ReviewCardState) => Promise<void>;
  completeExam: (exam: ExamRecord, reviews: ReviewCardState[]) => Promise<void>;
  upsertReview: (review: ReviewCardState) => Promise<void>;
  addQuestions: (questions: Question[]) => Promise<number>;
  setAI: (settings: AISettings) => Promise<void>;
  reset: () => Promise<void>;
  exportData: () => Promise<void>;
  importData: (text: string) => Promise<ImportResult>;
}

const DataContext = createContext<DataContextValue | null>(null);

function downloadJson(data: AppData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `salingo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [storageStatus, setStorageStatus] = useState<StorageStatus>("loading");
  const [storageError, setStorageError] = useState<string>();
  const [memoryData, setMemoryData] = useState<AppData>(() => initialAppData());

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await initializeDatabase(db, window.localStorage);
        if (!active) return;
        setStorageError(result.warning);
        setStorageStatus("ready");
      } catch {
        if (!active) return;
        let legacy: AppData | undefined;
        try { legacy = parseLegacyData(window.localStorage.getItem(LEGACY_STORAGE_KEY)); } catch { /* storage unavailable */ }
        setMemoryData(legacy ?? initialAppData());
        setStorageError("IndexedDB 不可用，当前改为会话内存模式；关闭或刷新页面后，本次更改不会保留。");
        setStorageStatus("volatile");
      }
    })();
    return () => { active = false; };
  }, []);

  const persistedData = useLiveQuery(
    () => storageStatus === "ready" ? readAppData(db) : Promise.resolve(undefined),
    [storageStatus],
  );
  const data = storageStatus === "ready" ? (persistedData ?? initialAppData()) : memoryData;
  const hydrated = storageStatus !== "loading" && (storageStatus !== "ready" || persistedData !== undefined);

  const fail = useCallback((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : "本地数据写入失败";
    setStorageError(`本地数据写入失败：${message}`);
    throw cause;
  }, []);

  const assertInitialized = useCallback(() => {
    if (storageStatus === "loading") throw new Error("本地数据正在初始化，请稍后重试");
  }, [storageStatus]);

  const recordAnswer = useCallback(async (answer: AnswerRecord, review?: ReviewCardState) => {
    assertInitialized();
    if (storageStatus === "volatile") {
      setMemoryData((current) => ({
        ...current,
        answers: [...current.answers, answer],
        reviews: review ? [...current.reviews.filter((item) => item.questionId !== review.questionId), review] : current.reviews,
        streakDates: current.streakDates.includes(dateKey(new Date(answer.answeredAt))) ? current.streakDates : [...current.streakDates, dateKey(new Date(answer.answeredAt))],
      }));
      return;
    }
    try { await recordAnswerInDb(db, answer, review); } catch (cause) { fail(cause); }
  }, [assertInitialized, fail, storageStatus]);

  const completeExam = useCallback(async (exam: ExamRecord, reviews: ReviewCardState[]) => {
    assertInitialized();
    if (storageStatus === "volatile") {
      setMemoryData((current) => ({ ...current, exams: [...current.exams, exam], reviews }));
      return;
    }
    try { await completeExamInDb(db, exam, reviews); } catch (cause) { fail(cause); }
  }, [assertInitialized, fail, storageStatus]);

  const upsertReview = useCallback(async (review: ReviewCardState) => {
    assertInitialized();
    if (storageStatus === "volatile") {
      setMemoryData((current) => ({ ...current, reviews: [...current.reviews.filter((item) => item.questionId !== review.questionId), review] }));
      return;
    }
    try { await upsertReviewInDb(db, review); } catch (cause) { fail(cause); }
  }, [assertInitialized, fail, storageStatus]);

  const addQuestions = useCallback(async (questions: Question[]) => {
    assertInitialized();
    if (storageStatus === "volatile") {
      const ids = new Set(memoryData.questions.map((question) => question.id));
      const missing = questions.filter((question) => !ids.has(question.id));
      setMemoryData((current) => ({ ...current, questions: [...current.questions, ...missing] }));
      return missing.length;
    }
    try { return await addQuestionsToDb(db, questions); } catch (cause) { fail(cause); return 0; }
  }, [assertInitialized, fail, memoryData.questions, storageStatus]);

  const setAI = useCallback(async (ai: AISettings) => {
    assertInitialized();
    if (storageStatus === "volatile") {
      setMemoryData((current) => ({ ...current, ai }));
      return;
    }
    try { await saveAISettings(db, ai); } catch (cause) { fail(cause); }
  }, [assertInitialized, fail, storageStatus]);

  const reset = useCallback(async () => {
    assertInitialized();
    if (storageStatus === "volatile") setMemoryData(initialAppData());
    else {
      try { await resetDatabase(db); } catch (cause) { fail(cause); }
    }
    try { window.localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* storage unavailable */ }
  }, [assertInitialized, fail, storageStatus]);

  const exportData = useCallback(async () => { downloadJson(data); }, [data]);

  const importData = useCallback(async (text: string): Promise<ImportResult> => {
    try {
      assertInitialized();
      if (storageStatus === "volatile") {
        const parsed = appDataSchema.parse(JSON.parse(text));
        setMemoryData(mergeSeedQuestions(parsed));
      } else await importBackup(db, text);
      return { ok: true, message: "数据已导入" };
    } catch {
      return { ok: false, message: "文件格式无效，请选择 SALINGO 备份文件" };
    }
  }, [assertInitialized, storageStatus]);

  const value = useMemo(() => ({ data, hydrated, storageStatus, storageError, recordAnswer, completeExam, upsertReview, addQuestions, setAI, reset, exportData, importData }), [data, hydrated, storageStatus, storageError, recordAnswer, completeExam, upsertReview, addQuestions, setAI, reset, exportData, importData]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useAppData() {
  const context = useContext(DataContext);
  if (!context) throw new Error("useAppData must be used inside DataProvider");
  return context;
}
