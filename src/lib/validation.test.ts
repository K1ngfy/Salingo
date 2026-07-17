import { describe, expect, it } from "vitest";
import { INITIAL_QUESTIONS } from "@/data/full-bank";
import { appDataSchema, questionArraySchema, questionSchema } from "./validation";

describe("AppData backup migration", () => {
  it("migrates version 1 choice answers, exams and preferences to version 3", () => {
    const question = { ...INITIAL_QUESTIONS[0], bankId: undefined, sectionId: undefined, practiceEnabled: undefined };
    const parsed = appDataSchema.parse({
      version: 1,
      questions: [question],
      answers: [{ id: "a1", questionId: question.id, domainId: question.domainId, selectedAnswers: ["A"], correct: false, answeredAt: "2026-07-15T10:00:00.000Z", durationSeconds: 10, mode: "practice" }],
      reviews: [],
      exams: [{ id: "e1", startedAt: "2026-07-15T10:00:00.000Z", finishedAt: "2026-07-15T11:00:00.000Z", durationSeconds: 3600, questionIds: [question.id], answers: { [question.id]: ["A"] }, score: 0, domainScores: { [question.domainId!]: 0 } }],
      streakDates: [],
      ai: { baseUrl: "", apiKey: "", model: "gpt-5-mini" },
    });
    expect(parsed.version).toBe(3);
    expect(parsed.questions[0].bankId).toBe("salingo-original");
    expect(parsed.answers[0].response).toEqual({ kind: "choice", selectedAnswers: ["A"] });
    expect(parsed.exams[0].answers[question.id]).toEqual({ kind: "choice", selectedAnswers: ["A"] });
    expect(parsed.preferences).toEqual({ activeBankId: "salingo-original", contentLanguage: "zh", questionAssistEnabled: true });
    expect(parsed.prepProfile.dailyQuestionTarget).toBe(20);
  });

  it("migrates version 2 review targets without losing FSRS state", () => {
    const base = appDataSchema.parse({ version: 1, questions: [], answers: [], reviews: [], exams: [], streakDates: [], ai: { baseUrl: "", apiKey: "", model: "gpt-5-mini" } });
    const parsed = appDataSchema.parse({
      ...base,
      version: 2,
      preferences: { activeBankId: "salingo-original", contentLanguage: "bilingual" },
      reviews: [{ questionId: "q1", due: "2026-07-17T00:00:00.000Z", stability: 2, difficulty: 4, elapsed_days: 1, scheduled_days: 2, learning_steps: 0, reps: 3, lapses: 1, state: 2, mistakeType: "审题失误", favorite: true }],
    });
    expect(parsed.reviews[0]).toMatchObject({ id: "question:q1", targetType: "question", targetId: "q1", reps: 3, mistakeType: "审题失误", favorite: true });
    expect(parsed.preferences.questionAssistEnabled).toBe(true);
  });

  it("rejects semantically invalid choice answers", () => {
    const question = INITIAL_QUESTIONS.find((item) => item.type === "single")!;
    expect(questionSchema.safeParse({ ...question, correctAnswers: ["missing-option"] }).success).toBe(false);
    expect(questionSchema.safeParse({ ...question, correctAnswers: question.options.slice(0, 2).map((option) => option.id) }).success).toBe(false);
    expect(questionSchema.safeParse({ ...question, options: [question.options[0], question.options[0]] }).success).toBe(false);
  });

  it("rejects duplicate question IDs and invalid persisted AI settings", () => {
    const question = INITIAL_QUESTIONS[0];
    expect(questionArraySchema.safeParse([question, { ...question }]).success).toBe(false);
    expect(appDataSchema.safeParse({ ...appDataSchema.parse({ version: 1, questions: [], answers: [], reviews: [], exams: [], streakDates: [], ai: { baseUrl: "", apiKey: "", model: "gpt-5-mini" } }), ai: { baseUrl: "", apiKey: "", model: "" } }).success).toBe(false);
  });
});
