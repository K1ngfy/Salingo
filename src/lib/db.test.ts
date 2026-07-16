import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnswerRecord, AppData, ExamRecord, ReviewCardState } from "./types";
import {
  LEGACY_STORAGE_KEY,
  SalingoDatabase,
  completeExam,
  addQuestions,
  importBackup,
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
  return { id: "answer-1", questionId: "d1-care-001", domainId: "d1", selectedAnswers: ["A"], correct: false, answeredAt: "2026-07-15T10:00:00.000Z", durationSeconds: 20, mode: "practice" };
}

function sampleReview(): ReviewCardState {
  return { questionId: "d1-care-001", due: "2026-07-16T10:00:00.000Z", stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps: 1, lapses: 1, state: 1, mistakeType: "概念盲区", favorite: false };
}

describe("IndexedDB initialization", () => {
  it("seeds exactly 800 questions and is idempotent", async () => {
    const database = createDb();
    const storage = new MemoryStorage();
    await initializeDatabase(database, storage);
    await initializeDatabase(database, storage);
    expect(await database.questions.count()).toBe(800);
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
    expect(await database.questions.count()).toBe(800);
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
    expect(await database.questions.count()).toBe(800);
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
    vi.spyOn(database.reviews, "put").mockRejectedValueOnce(new Error("review failed"));
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
    expect(await database.questions.count()).toBe(801);
  });

  it("records an exam and its review set together", async () => {
    const database = createDb();
    await initializeDatabase(database, new MemoryStorage());
    const exam: ExamRecord = { id: "exam-1", startedAt: "2026-07-15T10:00:00.000Z", finishedAt: "2026-07-15T11:00:00.000Z", durationSeconds: 3600, questionIds: ["d1-care-001"], answers: { "d1-care-001": ["A"] }, score: 0, domainScores: { d1: 0 } };
    await completeExam(database, exam, [sampleReview()]);
    const snapshot = await readAppData(database);
    expect(snapshot.exams).toEqual([exam]);
    expect(snapshot.reviews).toEqual([sampleReview()]);
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
    expect(reset.questions).toHaveLength(800);
    expect(reset.answers).toHaveLength(0);
    expect(reset.reviews).toHaveLength(0);
  });
});
