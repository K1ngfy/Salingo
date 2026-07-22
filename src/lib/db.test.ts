import { afterEach, describe, expect, it, vi } from "vitest";
import Dexie from "dexie";
import { INITIAL_QUESTIONS } from "@/data/full-bank";
import type { AnswerRecord, AppData, ExamRecord, ReviewCardState } from "./types";
import {
  LEGACY_STORAGE_KEY,
  SalingoDatabase,
  completeExam,
  addQuestions,
  importBackup,
  installQuestionBank,
  initialAppData,
  initializeDatabase,
  readAppData,
  recordAnswer,
  resetDatabase,
} from "./db";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const databases: SalingoDatabase[] = [];
function createDb() {
  const database = new SalingoDatabase(`salingo-test-${crypto.randomUUID()}`);
  databases.push(database);
  return database;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(databases.splice(0).map(async (database) => {
    database.close();
    await database.delete();
  }));
});

function sampleAnswer(): AnswerRecord {
  return { id: "answer-1", questionId: "d1-care-001", bankId: "salingo-original", sectionId: "d1", domainId: "d1", response: { kind: "choice", selectedAnswers: ["A"] }, correct: false, answeredAt: "2026-07-15T10:00:00.000Z", durationSeconds: 20, mode: "practice" };
}

function sampleReview(): ReviewCardState {
  return { id: "question:d1-care-001", targetType: "question", targetId: "d1-care-001", due: "2026-07-16T10:00:00.000Z", stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps: 1, lapses: 1, state: 1, mistakeType: "概念盲区", favorite: false };
}

describe("IndexedDB initialization", () => {
  it("seeds the complete question bank and is idempotent", async () => {
    const database = createDb();
    const storage = new MemoryStorage();
    await initializeDatabase(database, storage);
    await initializeDatabase(database, storage);
    expect(await database.questions.count()).toBe(INITIAL_QUESTIONS.length);
  });

  it("migrates a complete legacy snapshot and removes it only after commit", async () => {
    const database = createDb();
    const storage = new MemoryStorage();
    const legacy: AppData = { ...initialAppData(), answers: [sampleAnswer()], reviews: [sampleReview()], streakDates: ["2026-07-15"], ai: { baseUrl: "https://example.test/v1", apiKey: "test-key", model: "test-model" } };
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacy));
    const result = await initializeDatabase(database, storage);
    const snapshot = await readAppData(database);
    expect(result.migratedLegacy).toBe(true);
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(snapshot.answers).toEqual(legacy.answers);
    expect(snapshot.reviews).toEqual(legacy.reviews);
    expect(snapshot.ai).toEqual(legacy.ai);
  });

  it("preserves invalid legacy data and starts with a clean database", async () => {
    const database = createDb();
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_STORAGE_KEY, "{invalid");
    const result = await initializeDatabase(database, storage);
    expect(result.warning).toContain("格式无效");
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBe("{invalid");
    expect(await database.questions.count()).toBe(INITIAL_QUESTIONS.length);
  });

  it("does not remove legacy data when the initialization transaction fails", async () => {
    const database = createDb();
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(initialAppData()));
    await database.open();
    vi.spyOn(database.questions, "bulkPut").mockRejectedValueOnce(new Error("write failed"));
    await expect(initializeDatabase(database, storage)).rejects.toThrow("write failed");
    expect(storage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
  });

  it("restores missing seed rows without overwriting an existing row", async () => {
    const database = createDb();
    await initializeDatabase(database, new MemoryStorage());
    const first = (await database.questions.toArray())[0];
    const second = (await database.questions.toArray())[1];
    await database.questions.put({ ...first, stem: "这是用户保留的自定义题干，不应在题库升级时被覆盖。" });
    await database.questions.delete(second.id);
    await database.metadata.put({ key: "seedVersion", value: 0 });
    await initializeDatabase(database, new MemoryStorage());
    expect((await database.questions.get(first.id))?.stem).toContain("用户保留");
    expect(await database.questions.get(second.id)).toBeDefined();
    expect(await database.questions.count()).toBe(INITIAL_QUESTIONS.length);
  });

  it("upgrades Dexie v2 question reviews to generic v3 review targets", async () => {
    const name = `salingo-v2-upgrade-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(2).stores({ questions: "id, bankId", answers: "id", reviews: "questionId, due", exams: "id", streaks: "date", settings: "key", metadata: "key" });
    await legacy.open();
    await legacy.table("reviews").put({ questionId: "legacy-q", due: "2026-07-16T00:00:00.000Z", stability: 2, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps: 2, lapses: 1, state: 1, mistakeType: "审题失误", favorite: true });
    await legacy.table("settings").put({ key: "preferences", value: { activeBankId: "salingo-original", contentLanguage: "zh" } });
    await legacy.table("metadata").put({ key: "initialized", value: true });
    legacy.close();
    const database = new SalingoDatabase(name);
    databases.push(database);
    await database.open();
    const review = await database.reviewTargets.get("question:legacy-q");
    expect(review).toMatchObject({ targetType: "question", targetId: "legacy-q", reps: 2, mistakeType: "审题失误", favorite: true });
    expect((await database.settings.get("preferences"))?.value).toMatchObject({ questionAssistEnabled: true });
  });

  it("moves existing CISSP2508 questions and progress into the essentials bank", async () => {
    const name = `salingo-v3-upgrade-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(3).stores({
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
    });
    await legacy.open();
    const legacyQuestion = { ...INITIAL_QUESTIONS[0], id: "cissp2508-001", bankId: "salingo-original", sectionId: "d1", source: "imported" };
    await legacy.table("questions").put(legacyQuestion);
    await legacy.table("answers").put({ ...sampleAnswer(), questionId: legacyQuestion.id });
    await legacy.table("exams").put({ id: "essentials-exam", bankId: "salingo-original", startedAt: "2026-07-15T10:00:00.000Z", finishedAt: "2026-07-15T11:00:00.000Z", durationSeconds: 3600, questionIds: [legacyQuestion.id], answers: {}, score: 0, domainScores: {}, sectionScores: { d1: 0 } });
    legacy.close();

    const database = new SalingoDatabase(name);
    databases.push(database);
    await database.open();
    expect((await database.questions.get(legacyQuestion.id))?.bankId).toBe("cissp2508-essentials");
    expect((await database.answers.get("answer-1"))?.bankId).toBe("cissp2508-essentials");
    expect((await database.exams.get("essentials-exam"))?.bankId).toBe("cissp2508-essentials");
  });
});

describe("IndexedDB transactions and backups", () => {
  it("records answer, review and streak together", async () => {
    const database = createDb();
    await initializeDatabase(database, new MemoryStorage());
    await recordAnswer(database, sampleAnswer(), sampleReview());
    const snapshot = await readAppData(database);
    expect(snapshot.answers).toHaveLength(1);
    expect(snapshot.reviews).toHaveLength(1);
    expect(snapshot.streakDates).toEqual(["2026-07-15"]);
  });

  it("rolls back answer and streak when review persistence fails", async () => {
    const database = createDb();
    await initializeDatabase(database, new MemoryStorage());
    vi.spyOn(database.reviewTargets, "put").mockRejectedValueOnce(new Error("review failed"));
    await expect(recordAnswer(database, sampleAnswer(), sampleReview())).rejects.toThrow("review failed");
    expect(await database.answers.count()).toBe(0);
    expect(await database.streaks.count()).toBe(0);
  });

  it("adds only questions with new IDs", async () => {
    const database = createDb();
    await initializeDatabase(database, new MemoryStorage());
    const existing = (await database.questions.toArray())[0];
    const imported = { ...existing, id: "imported-new-question", source: "imported" as const };
    expect(await addQuestions(database, [existing, imported])).toBe(1);
    expect(await database.questions.count()).toBe(INITIAL_QUESTIONS.length + 1);
  });

  it("skips duplicate IDs within the same question import", async () => {
    const database = createDb();
    await initializeDatabase(database, new MemoryStorage());
    const imported = { ...(await database.questions.toArray())[0], id: "duplicate-import-id", source: "imported" as const };
    expect(await addQuestions(database, [imported, { ...imported }])).toBe(1);
    expect(await database.questions.where("id").equals(imported.id).count()).toBe(1);
  });

  it("installs a versioned bank idempotently", async () => {
    const database = createDb();
    await initializeDatabase(database, new MemoryStorage());
    const seed = (await database.questions.toArray())[0];
    const official = { ...seed, id: "official-test-question", bankId: "official-practice-tests" as const, sectionId: "d1", source: "imported" as const };
    expect(await installQuestionBank(database, "official-practice-tests", 1, [official])).toEqual({ installed: true, count: 1 });
    expect(await installQuestionBank(database, "official-practice-tests", 1, [official])).toEqual({ installed: false, count: 1 });
    expect(await database.questions.get(official.id)).toBeDefined();
  });

  it("records an exam and its review set together", async () => {
    const database = createDb();
    await initializeDatabase(database, new MemoryStorage());
    const prepReview: ReviewCardState = { ...sampleReview(), id: "prep-card:card-1", targetType: "prep-card", targetId: "card-1" };
    await database.reviewTargets.put(prepReview);
    const exam: ExamRecord = { id: "exam-1", bankId: "salingo-original", startedAt: "2026-07-15T10:00:00.000Z", finishedAt: "2026-07-15T11:00:00.000Z", durationSeconds: 3600, questionIds: ["d1-care-001"], answers: { "d1-care-001": { kind: "choice", selectedAnswers: ["A"] } }, score: 0, domainScores: { d1: 0 }, sectionScores: { d1: 0 } };
    await completeExam(database, exam, [sampleReview()]);
    const snapshot = await readAppData(database);
    expect(snapshot.exams).toEqual([exam]);
    expect(snapshot.reviews).toEqual(expect.arrayContaining([prepReview, sampleReview()]));
    expect(snapshot.streakDates).toEqual(["2026-07-15"]);
  });

  it("imports version 1 backups, rejects invalid input, and resets to seeds", async () => {
    const database = createDb();
    await initializeDatabase(database, new MemoryStorage());
    const backup: AppData = { ...initialAppData(), answers: [sampleAnswer()], reviews: [sampleReview()] };
    await importBackup(database, JSON.stringify(backup));
    expect((await readAppData(database)).answers).toHaveLength(1);
    await expect(importBackup(database, JSON.stringify({ version: 1 }))).rejects.toBeDefined();
    await resetDatabase(database);
    const reset = await readAppData(database);
    expect(reset.questions).toHaveLength(INITIAL_QUESTIONS.length);
    expect(reset.answers).toHaveLength(0);
    expect(reset.reviews).toHaveLength(0);
  });
});
