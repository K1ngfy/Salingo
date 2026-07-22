import Dexie, { type EntityTable } from "dexie";
import { INITIAL_QUESTIONS } from "@/data/full-bank";
import type { AISettings, AnswerRecord, AppData, ChecklistProgress, ExamRecord, OutlineProgress, PrepProfile, Question, ReviewCardState, UserPreferences } from "./types";
import { appDataSchema } from "./validation";
import { dateKey } from "./utils";
import { DEFAULT_PREFERENCES, ESSENTIALS_BANK_ID, ORIGINAL_BANK_ID, normalizeSeedQuestion, questionBankId, questionSectionId } from "./question-banks";
import { DEFAULT_PREP_PROFILE } from "./prep";

export const DATABASE_NAME = "salingo";
export const LEGACY_STORAGE_KEY = "salingo:data:v1";
export const SEED_DATA_VERSION = 4;

export const DEFAULT_AI_SETTINGS: AISettings = {
  baseUrl: process.env.NEXT_PUBLIC_AI_BASE_URL?.trim() ?? "",
  apiKey: "",
  model: process.env.NEXT_PUBLIC_AI_MODEL?.trim() || "gpt-5-mini",
};

interface StreakRow { date: string }
interface SettingRow { key: "ai" | "preferences" | "prepProfile"; value: AISettings | UserPreferences | PrepProfile }
interface MetadataRow { key: string; value: string | number | boolean }
interface LegacyReviewRow extends Omit<ReviewCardState, "id" | "targetType" | "targetId"> { questionId: string }

export class SalingoDatabase extends Dexie {
  questions!: EntityTable<Question, "id">;
  answers!: EntityTable<AnswerRecord, "id">;
  reviews!: EntityTable<LegacyReviewRow, "questionId">;
  reviewTargets!: EntityTable<ReviewCardState, "id">;
  exams!: EntityTable<ExamRecord, "id">;
  streaks!: EntityTable<StreakRow, "date">;
  settings!: EntityTable<SettingRow, "key">;
  metadata!: EntityTable<MetadataRow, "key">;
  outlineProgress!: EntityTable<OutlineProgress, "objectiveId">;
  checklistProgress!: EntityTable<ChecklistProgress, "itemId">;

  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(1).stores({
      questions: "id, domainId, difficulty, source, createdAt, *tags, [domainId+difficulty]",
      answers: "id, questionId, domainId, answeredAt, mode, [domainId+answeredAt]",
      reviews: "questionId, due, mistakeType",
      exams: "id, startedAt, finishedAt",
      streaks: "date",
      settings: "key",
      metadata: "key",
    });
    this.version(2).stores({
      questions: "id, bankId, sectionId, domainId, difficulty, source, createdAt, *tags, [bankId+sectionId]",
      answers: "id, questionId, bankId, sectionId, domainId, answeredAt, mode, [bankId+answeredAt]",
      reviews: "questionId, due, mistakeType",
      exams: "id, bankId, startedAt, finishedAt",
      streaks: "date",
      settings: "key",
      metadata: "key",
    }).upgrade(async (transaction) => {
      await transaction.table("questions").toCollection().modify((question: Question) => {
        Object.assign(question, normalizeSeedQuestion(question));
      });
      await transaction.table("answers").toCollection().modify((answer: Record<string, unknown>) => {
        const domainId = answer.domainId as string | undefined;
        answer.bankId = ORIGINAL_BANK_ID;
        answer.sectionId = domainId ?? "unclassified";
        answer.response = { kind: "choice", selectedAnswers: answer.selectedAnswers ?? [] };
        delete answer.selectedAnswers;
      });
      await transaction.table("exams").toCollection().modify((exam: Record<string, unknown>) => {
        const answers = exam.answers as Record<string, string[]> | undefined;
        exam.bankId = ORIGINAL_BANK_ID;
        exam.answers = Object.fromEntries(Object.entries(answers ?? {}).map(([id, selectedAnswers]) => [id, { kind: "choice", selectedAnswers }]));
        exam.sectionScores = exam.domainScores ?? {};
      });
    });
    this.version(3).stores({
      questions: "id, bankId, sectionId, domainId, difficulty, source, createdAt, *tags, [bankId+sectionId]",
      answers: "id, questionId, bankId, sectionId, domainId, answeredAt, mode, [bankId+answeredAt]",
      reviews: "questionId, due, mistakeType",
      reviewTargets: "id, targetType, targetId, due, mistakeType, [targetType+due]",
      exams: "id, bankId, startedAt, finishedAt",
      streaks: "date",
      settings: "key",
      metadata: "key",
      outlineProgress: "objectiveId, status, updatedAt",
      checklistProgress: "itemId, completed, updatedAt",
    }).upgrade(async (transaction) => {
      const reviews = await transaction.table("reviews").toArray() as Array<Record<string, unknown>>;
      if (reviews.length) await transaction.table("reviewTargets").bulkPut(reviews.map((review) => {
        const questionId = String(review.questionId ?? "");
        const { questionId: _legacyKey, ...state } = review;
        void _legacyKey;
        return { ...state, id: `question:${questionId}`, targetType: "question", targetId: questionId };
      }));
      const preferences = await transaction.table("settings").get("preferences") as SettingRow | undefined;
      if (preferences) preferences.value = { ...DEFAULT_PREFERENCES, ...(preferences.value as UserPreferences) };
      if (preferences) await transaction.table("settings").put(preferences);
    });
    this.version(4).stores({
      questions: "id, bankId, sectionId, domainId, difficulty, source, createdAt, *tags, [bankId+sectionId]",
      answers: "id, questionId, bankId, sectionId, domainId, answeredAt, mode, [bankId+answeredAt]",
      reviews: "questionId, due, mistakeType",
      reviewTargets: "id, targetType, targetId, due, mistakeType, [targetType+due]",
      exams: "id, bankId, startedAt, finishedAt",
      streaks: "date",
      settings: "key",
      metadata: "key",
      outlineProgress: "objectiveId, status, updatedAt",
      checklistProgress: "itemId, completed, updatedAt",
    }).upgrade(async (transaction) => {
      await transaction.table("questions").where("id").startsWith("cissp2508-").modify((question: Question) => {
        question.bankId = ESSENTIALS_BANK_ID;
        question.sectionId = question.domainId ?? "unclassified";
      });
      await transaction.table("answers").where("questionId").startsWith("cissp2508-").modify((answer: AnswerRecord) => {
        answer.bankId = ESSENTIALS_BANK_ID;
        answer.sectionId = answer.domainId ?? "unclassified";
      });
      const essentialsExams = (await transaction.table("exams").toArray() as ExamRecord[])
        .filter((exam) => exam.questionIds.length > 0 && exam.questionIds.every((id) => id.startsWith("cissp2508-")));
      if (essentialsExams.length) await transaction.table("exams").bulkPut(essentialsExams.map((exam) => ({ ...exam, bankId: ESSENTIALS_BANK_ID })));
    });
  }
}

export const db = new SalingoDatabase();

export function initialAppData(): AppData {
  return {
    version: 3,
    questions: INITIAL_QUESTIONS,
    answers: [],
    reviews: [],
    exams: [],
    streakDates: [],
    ai: DEFAULT_AI_SETTINGS,
    preferences: DEFAULT_PREFERENCES,
    prepProfile: { ...DEFAULT_PREP_PROFILE, startedAt: new Date().toISOString() },
    outlineProgress: [],
    checklistProgress: [],
  };
}

export function mergeSeedQuestions(data: AppData): AppData {
  const questions = data.questions.map((question) => question.id.startsWith("cissp2508-")
    ? { ...question, bankId: ESSENTIALS_BANK_ID, sectionId: question.domainId ?? "unclassified" }
    : question);
  const answers = data.answers.map((answer) => answer.questionId.startsWith("cissp2508-")
    ? { ...answer, bankId: ESSENTIALS_BANK_ID, sectionId: answer.domainId ?? "unclassified" }
    : answer);
  const exams = data.exams.map((exam) => exam.questionIds.length > 0 && exam.questionIds.every((id) => id.startsWith("cissp2508-"))
    ? { ...exam, bankId: ESSENTIALS_BANK_ID }
    : exam);
  const ids = new Set(questions.map((question) => question.id));
  return { ...data, questions: [...questions, ...INITIAL_QUESTIONS.filter((question) => !ids.has(question.id))], answers, exams };
}

export function parseLegacyData(raw: string | null): AppData | undefined {
  if (!raw) return undefined;
  try {
    const result = appDataSchema.safeParse(JSON.parse(raw));
    return result.success ? mergeSeedQuestions(result.data) : undefined;
  } catch {
    return undefined;
  }
}

async function replaceBusinessData(database: SalingoDatabase, data: AppData) {
  await Promise.all([
    database.questions.clear(),
    database.answers.clear(),
    database.reviews.clear(),
    database.reviewTargets.clear(),
    database.exams.clear(),
    database.streaks.clear(),
    database.settings.clear(),
    database.metadata.clear(),
    database.outlineProgress.clear(),
    database.checklistProgress.clear(),
  ]);
  await Promise.all([
    database.questions.bulkPut(data.questions),
    database.answers.bulkPut(data.answers),
    database.reviewTargets.bulkPut(data.reviews),
    database.exams.bulkPut(data.exams),
    database.streaks.bulkPut(data.streakDates.map((date) => ({ date }))),
    database.settings.put({ key: "ai", value: data.ai }),
    database.settings.put({ key: "preferences", value: data.preferences }),
    database.settings.put({ key: "prepProfile", value: data.prepProfile }),
    database.outlineProgress.bulkPut(data.outlineProgress),
    database.checklistProgress.bulkPut(data.checklistProgress),
  ]);
}

export async function initializeDatabase(database = db, storage?: Pick<Storage, "getItem" | "removeItem">) {
  await database.open();
  const initialized = await database.metadata.get("initialized");
  let warning: string | undefined;
  let migratedLegacy = false;

  if (!initialized) {
    const raw = storage?.getItem(LEGACY_STORAGE_KEY) ?? null;
    const legacy = parseLegacyData(raw);
    if (raw && !legacy) warning = "旧版 LocalStorage 数据格式无效，原数据已保留；当前已使用全新 IndexedDB。";
    const source = legacy ?? initialAppData();
    await database.transaction("rw", database.tables, async () => {
      await replaceBusinessData(database, source);
      await database.metadata.bulkPut([
        { key: "initialized", value: true },
        { key: "seedVersion", value: SEED_DATA_VERSION },
        { key: "legacyMigrated", value: Boolean(legacy) },
      ]);
    });
    if (legacy) {
      storage?.removeItem(LEGACY_STORAGE_KEY);
      migratedLegacy = true;
    }
  } else {
    const seedVersion = await database.metadata.get("seedVersion");
    if (seedVersion?.value !== SEED_DATA_VERSION) {
      await database.transaction("rw", database.questions, database.metadata, async () => {
        const existing = await database.questions.bulkGet(INITIAL_QUESTIONS.map((question) => question.id));
        const missing = INITIAL_QUESTIONS.filter((_, index) => !existing[index]);
        if (missing.length) await database.questions.bulkAdd(missing);
        await database.metadata.put({ key: "seedVersion", value: SEED_DATA_VERSION });
      });
    }
  }
  return { warning, migratedLegacy };
}

export async function readAppData(database = db): Promise<AppData> {
  const [questions, answers, reviews, exams, streaks, ai, preferences, prepProfile, outlineProgress, checklistProgress] = await Promise.all([
    database.questions.toArray(),
    database.answers.toArray(),
    database.reviewTargets.toArray(),
    database.exams.toArray(),
    database.streaks.toArray(),
    database.settings.get("ai"),
    database.settings.get("preferences"),
    database.settings.get("prepProfile"),
    database.outlineProgress.toArray(),
    database.checklistProgress.toArray(),
  ]);
  return {
    version: 3,
    questions,
    answers: answers.sort((a, b) => a.answeredAt.localeCompare(b.answeredAt)),
    reviews,
    exams: exams.sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    streakDates: streaks.map((item) => item.date).sort(),
    ai: (ai?.value as AISettings | undefined) ?? DEFAULT_AI_SETTINGS,
    preferences: (preferences?.value as UserPreferences | undefined) ?? DEFAULT_PREFERENCES,
    prepProfile: (prepProfile?.value as PrepProfile | undefined) ?? { ...DEFAULT_PREP_PROFILE, startedAt: new Date().toISOString() },
    outlineProgress,
    checklistProgress,
  };
}

export async function recordAnswer(database: SalingoDatabase, answer: AnswerRecord, review?: ReviewCardState) {
  await database.transaction("rw", database.answers, database.reviewTargets, database.streaks, async () => {
    await database.answers.add(answer);
    if (review) await database.reviewTargets.put(review);
    await database.streaks.put({ date: dateKey(new Date(answer.answeredAt)) });
  });
}

export async function completeExam(database: SalingoDatabase, exam: ExamRecord, reviews: ReviewCardState[]) {
  await database.transaction("rw", database.exams, database.reviewTargets, database.streaks, async () => {
    await database.exams.add(exam);
    await database.reviewTargets.bulkPut(reviews);
    await database.streaks.put({ date: dateKey(new Date(exam.finishedAt)) });
  });
}

export async function upsertReview(database: SalingoDatabase, review: ReviewCardState) {
  await database.reviewTargets.put(review);
}

export async function addQuestions(database: SalingoDatabase, questions: Question[]) {
  return database.transaction("rw", database.questions, async () => {
    const normalized = [...new Map(questions.map((question) => {
      const value = normalizeSeedQuestion(question);
      return [value.id, value] as const;
    })).values()];
    const existing = await database.questions.bulkGet(normalized.map((question) => question.id));
    const missing = normalized.filter((_, index) => !existing[index]);
    if (missing.length) await database.questions.bulkAdd(missing);
    return missing.length;
  });
}

export async function saveAISettings(database: SalingoDatabase, value: AISettings) {
  await database.settings.put({ key: "ai", value });
}

export async function savePreferences(database: SalingoDatabase, value: UserPreferences) {
  await database.settings.put({ key: "preferences", value });
}

export async function savePrepProfile(database: SalingoDatabase, value: PrepProfile) {
  await database.settings.put({ key: "prepProfile", value });
}

export async function saveOutlineProgress(database: SalingoDatabase, value: OutlineProgress) {
  await database.outlineProgress.put(value);
}

export async function saveChecklistProgress(database: SalingoDatabase, value: ChecklistProgress) {
  await database.checklistProgress.put(value);
}

export async function installQuestionBank(database: SalingoDatabase, bankId: string, version: number, questions: Question[]) {
  const normalized = questions.map((question) => ({
    ...normalizeSeedQuestion(question),
    bankId: questionBankId(question),
    sectionId: questionSectionId(question),
  }));
  const metadataKey = `bank:${bankId}:version`;
  const installed = await database.metadata.get(metadataKey);
  if (installed?.value === version) return { installed: false, count: await database.questions.where("bankId").equals(bankId).count() };
  await database.transaction("rw", database.questions, database.metadata, async () => {
    if (normalized.length) await database.questions.bulkPut(normalized);
    await database.metadata.put({ key: metadataKey, value: version });
  });
  return { installed: true, count: normalized.length };
}

export async function isQuestionBankInstalled(database: SalingoDatabase, bankId: string, version: number) {
  return (await database.metadata.get(`bank:${bankId}:version`))?.value === version;
}

export async function resetDatabase(database = db) {
  await database.transaction("rw", database.tables, async () => {
    await replaceBusinessData(database, initialAppData());
    await database.metadata.bulkPut([
      { key: "initialized", value: true },
      { key: "seedVersion", value: SEED_DATA_VERSION },
      { key: "legacyMigrated", value: true },
    ]);
  });
}

export async function importBackup(database: SalingoDatabase, text: string) {
  const parsed = appDataSchema.parse(JSON.parse(text));
  const data = mergeSeedQuestions(parsed);
  await database.transaction("rw", database.tables, async () => {
    await replaceBusinessData(database, data);
    await database.metadata.bulkPut([
      { key: "initialized", value: true },
      { key: "seedVersion", value: SEED_DATA_VERSION },
    ]);
  });
  return data;
}
