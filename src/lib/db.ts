import Dexie, { type EntityTable } from "dexie";
import { INITIAL_QUESTIONS } from "@/data/full-bank";
import type { AISettings, AnswerRecord, AppData, ExamRecord, Question, ReviewCardState } from "./types";
import { appDataSchema } from "./validation";
import { dateKey } from "./utils";

export const DATABASE_NAME = "salingo";
export const LEGACY_STORAGE_KEY = "salingo:data:v1";
export const SEED_DATA_VERSION = 1;

export const DEFAULT_AI_SETTINGS: AISettings = {
  baseUrl: process.env.NEXT_PUBLIC_AI_BASE_URL ?? "",
  apiKey: process.env.NEXT_PUBLIC_AI_API_KEY ?? "",
  model: process.env.NEXT_PUBLIC_AI_MODEL ?? "gpt-5-mini",
};

interface StreakRow { date: string }
interface SettingRow { key: "ai"; value: AISettings }
interface MetadataRow { key: "initialized" | "seedVersion" | "legacyMigrated"; value: string | number | boolean }

export class SalingoDatabase extends Dexie {
  questions!: EntityTable<Question, "id">;
  answers!: EntityTable<AnswerRecord, "id">;
  reviews!: EntityTable<ReviewCardState, "questionId">;
  exams!: EntityTable<ExamRecord, "id">;
  streaks!: EntityTable<StreakRow, "date">;
  settings!: EntityTable<SettingRow, "key">;
  metadata!: EntityTable<MetadataRow, "key">;

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
  }
}

export const db = new SalingoDatabase();

export function initialAppData(): AppData {
  return {
    version: 1,
    questions: INITIAL_QUESTIONS,
    answers: [],
    reviews: [],
    exams: [],
    streakDates: [],
    ai: DEFAULT_AI_SETTINGS,
  };
}

export function mergeSeedQuestions(data: AppData): AppData {
  const ids = new Set(data.questions.map((question) => question.id));
  return { ...data, questions: [...data.questions, ...INITIAL_QUESTIONS.filter((question) => !ids.has(question.id))] };
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
    database.exams.clear(),
    database.streaks.clear(),
    database.settings.clear(),
  ]);
  await Promise.all([
    database.questions.bulkPut(data.questions),
    database.answers.bulkPut(data.answers),
    database.reviews.bulkPut(data.reviews),
    database.exams.bulkPut(data.exams),
    database.streaks.bulkPut(data.streakDates.map((date) => ({ date }))),
    database.settings.put({ key: "ai", value: data.ai }),
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
  const [questions, answers, reviews, exams, streaks, ai] = await Promise.all([
    database.questions.toArray(),
    database.answers.toArray(),
    database.reviews.toArray(),
    database.exams.toArray(),
    database.streaks.toArray(),
    database.settings.get("ai"),
  ]);
  return {
    version: 1,
    questions,
    answers: answers.sort((a, b) => a.answeredAt.localeCompare(b.answeredAt)),
    reviews,
    exams: exams.sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    streakDates: streaks.map((item) => item.date).sort(),
    ai: ai?.value ?? DEFAULT_AI_SETTINGS,
  };
}

export async function recordAnswer(database: SalingoDatabase, answer: AnswerRecord, review?: ReviewCardState) {
  await database.transaction("rw", database.answers, database.reviews, database.streaks, async () => {
    await database.answers.add(answer);
    if (review) await database.reviews.put(review);
    await database.streaks.put({ date: dateKey(new Date(answer.answeredAt)) });
  });
}

export async function completeExam(database: SalingoDatabase, exam: ExamRecord, reviews: ReviewCardState[]) {
  await database.transaction("rw", database.exams, database.reviews, async () => {
    await database.exams.add(exam);
    await database.reviews.bulkPut(reviews);
  });
}

export async function upsertReview(database: SalingoDatabase, review: ReviewCardState) {
  await database.reviews.put(review);
}

export async function addQuestions(database: SalingoDatabase, questions: Question[]) {
  return database.transaction("rw", database.questions, async () => {
    const existing = await database.questions.bulkGet(questions.map((question) => question.id));
    const missing = questions.filter((_, index) => !existing[index]);
    if (missing.length) await database.questions.bulkAdd(missing);
    return missing.length;
  });
}

export async function saveAISettings(database: SalingoDatabase, value: AISettings) {
  await database.settings.put({ key: "ai", value });
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
