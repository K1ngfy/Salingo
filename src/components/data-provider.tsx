"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  LEGACY_STORAGE_KEY,
  addQuestions as addQuestionsToDb,
  completeExam as completeExamInDb,
  db,
  importBackup,
  installQuestionBank,
  isQuestionBankInstalled,
  initialAppData,
  initializeDatabase,
  mergeSeedQuestions,
  parseLegacyData,
  readAppData,
  recordAnswer as recordAnswerInDb,
  resetDatabase,
  saveAISettings,
  saveChecklistProgress,
  saveOutlineProgress,
  savePrepProfile,
  savePreferences,
  upsertReview as upsertReviewInDb,
} from "@/lib/db";
import { aiSettingsSchema, appDataSchema, questionArraySchema } from "@/lib/validation";
import { dateKey, downloadJsonFile } from "@/lib/utils";
import { getQuestionBank, normalizeSeedQuestion, questionBankId } from "@/lib/question-banks";
import type { AISettings, AnswerRecord, AppData, BankId, ChecklistProgress, ExamRecord, OutlineProgress, PrepProfile, Question, ReviewCardState, UserPreferences } from "@/lib/types";

type StorageStatus = "loading" | "ready" | "volatile";
type ImportResult = { ok: boolean; message: string };

interface DataContextValue {
  data: AppData;
  hydrated: boolean;
  storageStatus: StorageStatus;
  storageError?: string;
  loadingBankId?: BankId;
  recordAnswer: (answer: AnswerRecord, review?: ReviewCardState) => Promise<void>;
  completeExam: (exam: ExamRecord, reviews: ReviewCardState[]) => Promise<void>;
  upsertReview: (review: ReviewCardState) => Promise<void>;
  addQuestions: (questions: Question[]) => Promise<number>;
  ensureBankLoaded: (bankId: BankId) => Promise<void>;
  setAI: (settings: AISettings) => Promise<void>;
  setPreferences: (preferences: UserPreferences) => Promise<void>;
  setPrepProfile: (profile: PrepProfile) => Promise<void>;
  setOutlineProgress: (progress: OutlineProgress) => Promise<void>;
  setChecklistProgress: (progress: ChecklistProgress) => Promise<void>;
  reset: () => Promise<void>;
  exportData: () => Promise<void>;
  importData: (text: string) => Promise<ImportResult>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [storageStatus, setStorageStatus] = useState<StorageStatus>("loading");
  const [storageError, setStorageError] = useState<string>();
  const [memoryData, setMemoryData] = useState<AppData>(() => initialAppData());
  const [loadingBankId, setLoadingBankId] = useState<BankId>();
  const autoLoadedBankRef = useRef<BankId | undefined>(undefined);

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
        reviews: review ? [...current.reviews.filter((item) => item.id !== review.id), review] : current.reviews,
        streakDates: current.streakDates.includes(dateKey(new Date(answer.answeredAt))) ? current.streakDates : [...current.streakDates, dateKey(new Date(answer.answeredAt))],
      }));
      return;
    }
    try { await recordAnswerInDb(db, answer, review); } catch (cause) { fail(cause); }
  }, [assertInitialized, fail, storageStatus]);

  const completeExam = useCallback(async (exam: ExamRecord, reviews: ReviewCardState[]) => {
    assertInitialized();
    if (storageStatus === "volatile") {
      setMemoryData((current) => {
        const nextReviews = new Map(current.reviews.map((review) => [review.id, review]));
        reviews.forEach((review) => nextReviews.set(review.id, review));
        const streakDate = dateKey(new Date(exam.finishedAt));
        return {
          ...current,
          exams: [...current.exams, exam],
          reviews: [...nextReviews.values()],
          streakDates: current.streakDates.includes(streakDate) ? current.streakDates : [...current.streakDates, streakDate],
        };
      });
      return;
    }
    try { await completeExamInDb(db, exam, reviews); } catch (cause) { fail(cause); }
  }, [assertInitialized, fail, storageStatus]);

  const upsertReview = useCallback(async (review: ReviewCardState) => {
    assertInitialized();
    if (storageStatus === "volatile") {
      setMemoryData((current) => ({ ...current, reviews: [...current.reviews.filter((item) => item.id !== review.id), review] }));
      return;
    }
    try { await upsertReviewInDb(db, review); } catch (cause) { fail(cause); }
  }, [assertInitialized, fail, storageStatus]);

  const addQuestions = useCallback(async (questions: Question[]) => {
    assertInitialized();
    if (storageStatus === "volatile") {
      const ids = new Set(memoryData.questions.map((question) => question.id));
      const missing = [...new Map(questions.map((question) => {
        const value = normalizeSeedQuestion(question);
        return [value.id, value] as const;
      })).values()].filter((question) => !ids.has(question.id));
      setMemoryData((current) => ({ ...current, questions: [...current.questions, ...missing] }));
      return missing.length;
    }
    try { return await addQuestionsToDb(db, questions); } catch (cause) { fail(cause); return 0; }
  }, [assertInitialized, fail, memoryData.questions, storageStatus]);

  const setAI = useCallback(async (ai: AISettings) => {
    assertInitialized();
    const validated = aiSettingsSchema.parse({ baseUrl: ai.baseUrl.trim(), apiKey: ai.apiKey.trim(), model: ai.model.trim() });
    if (storageStatus === "volatile") {
      setMemoryData((current) => ({ ...current, ai: validated }));
      return;
    }
    try { await saveAISettings(db, validated); } catch (cause) { fail(cause); }
  }, [assertInitialized, fail, storageStatus]);

  const setPreferences = useCallback(async (preferences: UserPreferences) => {
    assertInitialized();
    if (storageStatus === "volatile") {
      setMemoryData((current) => ({ ...current, preferences }));
      return;
    }
    try { await savePreferences(db, preferences); } catch (cause) { fail(cause); }
  }, [assertInitialized, fail, storageStatus]);

  const setPrepProfile = useCallback(async (prepProfile: PrepProfile) => {
    assertInitialized();
    if (storageStatus === "volatile") { setMemoryData((current) => ({ ...current, prepProfile })); return; }
    try { await savePrepProfile(db, prepProfile); } catch (cause) { fail(cause); }
  }, [assertInitialized, fail, storageStatus]);

  const setOutlineProgress = useCallback(async (progress: OutlineProgress) => {
    assertInitialized();
    if (storageStatus === "volatile") { setMemoryData((current) => ({ ...current, outlineProgress: [...current.outlineProgress.filter((item) => item.objectiveId !== progress.objectiveId), progress] })); return; }
    try { await saveOutlineProgress(db, progress); } catch (cause) { fail(cause); }
  }, [assertInitialized, fail, storageStatus]);

  const setChecklistProgress = useCallback(async (progress: ChecklistProgress) => {
    assertInitialized();
    if (storageStatus === "volatile") { setMemoryData((current) => ({ ...current, checklistProgress: [...current.checklistProgress.filter((item) => item.itemId !== progress.itemId), progress] })); return; }
    try { await saveChecklistProgress(db, progress); } catch (cause) { fail(cause); }
  }, [assertInitialized, fail, storageStatus]);

  const ensureBankLoaded = useCallback(async (bankId: BankId) => {
    assertInitialized();
    const bank = getQuestionBank(bankId);
    if (!bank.dataUrl) return;
    if (storageStatus === "volatile" && data.questions.some((question) => questionBankId(question) === bankId)) return;
    if (storageStatus === "ready" && await isQuestionBankInstalled(db, bank.id, bank.version)) return;
    setLoadingBankId(bankId);
    try {
      const response = await fetch(bank.dataUrl);
      if (!response.ok) throw new Error(`题库文件加载失败（${response.status}）`);
      const questions = questionArraySchema.parse(await response.json());
      if (storageStatus === "volatile") {
        setMemoryData((current) => {
          const merged = new Map(current.questions.map((question) => [question.id, question]));
          questions.map(normalizeSeedQuestion).forEach((question) => merged.set(question.id, question));
          return { ...current, questions: [...merged.values()] };
        });
      } else await installQuestionBank(db, bank.id, bank.version, questions);
    } catch (cause) {
      fail(cause);
    } finally {
      setLoadingBankId(undefined);
    }
  }, [assertInitialized, data.questions, fail, storageStatus]);

  useEffect(() => {
    const activeBankId = data.preferences.activeBankId;
    if (!hydrated || autoLoadedBankRef.current === activeBankId) return;
    autoLoadedBankRef.current = activeBankId;
    void ensureBankLoaded(activeBankId).catch(() => {
      if (autoLoadedBankRef.current === activeBankId) autoLoadedBankRef.current = undefined;
    });
  }, [data.preferences.activeBankId, ensureBankLoaded, hydrated]);

  const reset = useCallback(async () => {
    assertInitialized();
    if (storageStatus === "volatile") setMemoryData(initialAppData());
    else {
      try { await resetDatabase(db); } catch (cause) { fail(cause); }
    }
    try { window.localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* storage unavailable */ }
  }, [assertInitialized, fail, storageStatus]);

  const exportData = useCallback(async () => {
    downloadJsonFile(data, `salingo-backup-${new Date().toISOString().slice(0, 10)}.json`);
  }, [data]);

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

  const value = useMemo(() => ({ data, hydrated, storageStatus, storageError, loadingBankId, recordAnswer, completeExam, upsertReview, addQuestions, ensureBankLoaded, setAI, setPreferences, setPrepProfile, setOutlineProgress, setChecklistProgress, reset, exportData, importData }), [data, hydrated, storageStatus, storageError, loadingBankId, recordAnswer, completeExam, upsertReview, addQuestions, ensureBankLoaded, setAI, setPreferences, setPrepProfile, setOutlineProgress, setChecklistProgress, reset, exportData, importData]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useAppData() {
  const context = useContext(DataContext);
  if (!context) throw new Error("useAppData must be used inside DataProvider");
  return context;
}
