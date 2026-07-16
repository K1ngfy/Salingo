import { isPracticeEnabled, questionBankId, questionSectionId } from "./question-banks";
import { dateKey } from "./utils";
import type { AnswerRecord, BankId, Question, QuestionBank } from "./types";

export interface SweepSectionProgress {
  sectionId: string;
  completed: number;
  total: number;
}

export function buildSweepProgress(input: {
  bankId: BankId;
  bank: QuestionBank;
  questions: Question[];
  answers: AnswerRecord[];
  dailyTarget: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const sectionOrder = new Map(input.bank.sections.map((section, index) => [section.id, index]));
  const pool = input.questions
    .filter((question) => questionBankId(question) === input.bankId && isPracticeEnabled(question))
    .sort((a, b) => (sectionOrder.get(questionSectionId(a)) ?? 999) - (sectionOrder.get(questionSectionId(b)) ?? 999)
      || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const sweepAnswers = input.answers.filter((answer) => answer.bankId === input.bankId && answer.mode === "sweep");
  const completedIds = new Set(sweepAnswers.map((answer) => answer.questionId));
  const today = dateKey(now);
  const todayIds = new Set(sweepAnswers.filter((answer) => dateKey(new Date(answer.answeredAt)) === today).map((answer) => answer.questionId));
  const remainingDaily = Math.max(0, input.dailyTarget - todayIds.size);
  const remaining = pool.filter((question) => !completedIds.has(question.id));
  const sectionProgress: SweepSectionProgress[] = input.bank.sections.map((section) => {
    const sectionQuestions = pool.filter((question) => questionSectionId(question) === section.id);
    return { sectionId: section.id, completed: sectionQuestions.filter((question) => completedIds.has(question.id)).length, total: sectionQuestions.length };
  });
  return {
    total: pool.length,
    completed: pool.length - remaining.length,
    remaining: remaining.length,
    todayCompleted: todayIds.size,
    dailyTarget: input.dailyTarget,
    remainingDaily,
    finished: pool.length > 0 && remaining.length === 0,
    nextQuestionIds: remaining.slice(0, remainingDaily).map((question) => question.id),
    sectionProgress,
  };
}
