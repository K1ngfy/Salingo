import { describe, expect, it } from "vitest";
import { INITIAL_QUESTIONS } from "@/data/full-bank";
import { getQuestionBank } from "./question-banks";
import { buildSweepProgress } from "./sweep";
import type { AnswerRecord } from "./types";

function answer(questionId: string, answeredAt: string): AnswerRecord {
  return { id: `${questionId}-${answeredAt}`, questionId, bankId: "salingo-original", sectionId: "d1", domainId: "d1", response: { kind: "choice", selectedAnswers: ["A"] }, correct: false, answeredAt, durationSeconds: 10, mode: "sweep" };
}

describe("bank sweep progress", () => {
  it("counts unique completed questions and respects the daily target", () => {
    const ids = INITIAL_QUESTIONS.filter((question) => question.bankId === "salingo-original" || !question.bankId).slice(0, 3).map((question) => question.id);
    const progress = buildSweepProgress({ bankId: "salingo-original", bank: getQuestionBank("salingo-original"), questions: INITIAL_QUESTIONS, answers: [answer(ids[0], "2026-07-16T08:00:00"), answer(ids[0], "2026-07-16T09:00:00"), answer(ids[1], "2026-07-15T08:00:00")], dailyTarget: 2, now: new Date("2026-07-16T12:00:00") });
    expect(progress.completed).toBe(2);
    expect(progress.todayCompleted).toBe(1);
    expect(progress.remainingDaily).toBe(1);
    expect(progress.nextQuestionIds).toHaveLength(1);
    expect(progress.nextQuestionIds).not.toContain(ids[0]);
    expect(progress.nextQuestionIds).not.toContain(ids[1]);
  });

  it("reports completion when every enabled question has been swept", () => {
    const questions = INITIAL_QUESTIONS.slice(0, 2);
    const answers = questions.map((question, index) => answer(question.id, `2026-07-1${index + 5}T08:00:00`));
    const bank = { ...getQuestionBank("salingo-original"), sections: getQuestionBank("salingo-original").sections.filter((section) => section.id === questions[0].sectionId) };
    const progress = buildSweepProgress({ bankId: "salingo-original", bank, questions, answers, dailyTarget: 20, now: new Date("2026-07-16T12:00:00") });
    expect(progress.finished).toBe(true);
    expect(progress.remaining).toBe(0);
  });
});
