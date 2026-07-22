import { z } from "zod";
import { DEFAULT_PREFERENCES, ORIGINAL_BANK_ID, normalizeSeedQuestion } from "./question-banks";
import type { AppData } from "./types";

const domainIdSchema = z.enum(["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"]);
const bankIdSchema = z.enum(["salingo-original", "cissp2508-essentials", "official-practice-tests"]);
const optionSchema = z.object({ id: z.string().min(1), text: z.string().min(1) });

export const explanationSchema = z.object({
  logic: z.string().min(5),
  optionAnalysis: z.record(z.string(), z.string()),
  knowledgePoint: z.string().min(3),
  plainLanguage: z.string().min(5),
});

const localizedContentSchema = z.object({
  stem: z.string().min(1),
  options: z.array(optionSchema).min(2),
  explanation: z.string().min(1),
  matchingPrompts: z.array(optionSchema).optional(),
});

const baseQuestionShape = {
  id: z.string().min(3),
  bankId: bankIdSchema.optional(),
  sectionId: z.string().min(1).optional(),
  domainId: domainIdSchema.optional(),
  difficulty: z.enum(["基础", "进阶", "高难", "陷阱"]),
  tags: z.array(z.string()),
  stem: z.string().min(1),
  options: z.array(optionSchema).min(2),
  explanation: explanationSchema,
  translations: z.object({ en: localizedContentSchema.optional() }).optional(),
  practiceEnabled: z.boolean().optional(),
  requiresFigure: z.boolean().optional(),
  source: z.enum(["original", "ai", "imported"]),
  outlineVersion: z.enum(["2024-current", "source-unspecified"]),
  sourceReference: z.string().optional(),
  createdAt: z.string(),
};

const choiceQuestionSchema = z.object({
  ...baseQuestionShape,
  type: z.enum(["single", "multiple"]),
  correctAnswers: z.array(z.string().min(1)).min(1),
});

const matchingQuestionSchema = z.object({
  ...baseQuestionShape,
  type: z.literal("matching"),
  matchingPrompts: z.array(optionSchema).min(1),
  correctMatches: z.record(z.string(), z.string()),
});

export const questionSchema = z.discriminatedUnion("type", [choiceQuestionSchema, matchingQuestionSchema]).superRefine((question, context) => {
  const optionIds = question.options.map((option) => option.id);
  const optionIdSet = new Set(optionIds);
  if (optionIdSet.size !== optionIds.length) {
    context.addIssue({ code: "custom", path: ["options"], message: "选项 ID 不能重复" });
  }

  if (question.type === "matching") {
    const promptIds = question.matchingPrompts.map((prompt) => prompt.id);
    if (new Set(promptIds).size !== promptIds.length) {
      context.addIssue({ code: "custom", path: ["matchingPrompts"], message: "匹配项 ID 不能重复" });
    }
    for (const promptId of promptIds) {
      if (!question.correctMatches[promptId]) {
        context.addIssue({ code: "custom", path: ["correctMatches", promptId], message: "每个匹配项都必须有答案" });
      }
    }
    for (const [promptId, optionId] of Object.entries(question.correctMatches)) {
      if (!promptIds.includes(promptId)) {
        context.addIssue({ code: "custom", path: ["correctMatches", promptId], message: "答案包含不存在的匹配项" });
      }
      if (!optionIdSet.has(optionId)) {
        context.addIssue({ code: "custom", path: ["correctMatches", promptId], message: "匹配答案必须引用现有选项" });
      }
    }
    return;
  }

  if (new Set(question.correctAnswers).size !== question.correctAnswers.length) {
    context.addIssue({ code: "custom", path: ["correctAnswers"], message: "正确答案不能重复" });
  }
  if (question.type === "single" && question.correctAnswers.length !== 1) {
    context.addIssue({ code: "custom", path: ["correctAnswers"], message: "单选题必须且只能有一个正确答案" });
  }
  question.correctAnswers.forEach((optionId, index) => {
    if (!optionIdSet.has(optionId)) {
      context.addIssue({ code: "custom", path: ["correctAnswers", index], message: "正确答案必须引用现有选项" });
    }
  });
});
export const questionArraySchema = z.array(questionSchema).superRefine((questions, context) => {
  const seen = new Set<string>();
  questions.forEach((question, index) => {
    if (seen.has(question.id)) context.addIssue({ code: "custom", path: [index, "id"], message: "题目 ID 不能重复" });
    seen.add(question.id);
  });
});

export const answerResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice"), selectedAnswers: z.array(z.string()) }),
  z.object({ kind: z.literal("matching"), matches: z.record(z.string(), z.string()) }),
]);

export const answerRecordSchema = z.object({
  id: z.string().min(1),
  questionId: z.string().min(1),
  bankId: bankIdSchema,
  sectionId: z.string().min(1),
  domainId: domainIdSchema.optional(),
  response: answerResponseSchema,
  correct: z.boolean(),
  answeredAt: z.string(),
  durationSeconds: z.number().nonnegative(),
  mode: z.enum(["practice", "review", "exam", "sweep"]),
});

export const reviewCardSchema = z.object({
  id: z.string().min(1),
  targetType: z.enum(["question", "prep-card"]),
  targetId: z.string().min(1),
  due: z.string(),
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number(),
  scheduled_days: z.number(),
  learning_steps: z.number(),
  reps: z.number(),
  lapses: z.number(),
  state: z.number(),
  last_review: z.string().optional(),
  mistakeType: z.enum(["概念盲区", "审题失误", "混淆考点"]),
  favorite: z.boolean(),
});

export const examRecordSchema = z.object({
  id: z.string().min(1),
  bankId: bankIdSchema,
  startedAt: z.string(),
  finishedAt: z.string(),
  durationSeconds: z.number().nonnegative(),
  questionIds: z.array(z.string()),
  answers: z.record(z.string(), answerResponseSchema),
  score: z.number(),
  domainScores: z.partialRecord(domainIdSchema, z.number()),
  sectionScores: z.record(z.string(), z.number()),
});

export const aiSettingsSchema = z.object({
  baseUrl: z.string(),
  apiKey: z.string(),
  model: z.string().min(1),
});

export const userPreferencesSchema = z.object({
  activeBankId: bankIdSchema,
  contentLanguage: z.enum(["zh", "en", "bilingual"]),
  questionAssistEnabled: z.boolean(),
});

const prepProfileSchema = z.object({
  examDate: z.string().optional(),
  studyWeekdays: z.array(z.number().int().min(0).max(6)),
  dailyQuestionTarget: z.number().int().min(1).max(500),
  startedAt: z.string(),
  favoriteCardIds: z.array(z.string()).default([]),
});

const outlineProgressSchema = z.object({
  objectiveId: z.string().min(1),
  status: z.enum(["not-started", "learning", "mastered"]),
  updatedAt: z.string(),
});

const checklistProgressSchema = z.object({
  itemId: z.string().min(1),
  completed: z.boolean(),
  updatedAt: z.string(),
});

const appDataV3Schema = z.object({
  version: z.literal(3),
  questions: questionArraySchema,
  answers: z.array(answerRecordSchema),
  reviews: z.array(reviewCardSchema),
  exams: z.array(examRecordSchema),
  streakDates: z.array(z.string()),
  ai: aiSettingsSchema,
  preferences: userPreferencesSchema,
  prepProfile: prepProfileSchema,
  outlineProgress: z.array(outlineProgressSchema),
  checklistProgress: z.array(checklistProgressSchema),
});

const legacyReviewCardSchema = z.object({
  questionId: z.string().min(1),
  due: z.string(),
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number(),
  scheduled_days: z.number(),
  learning_steps: z.number(),
  reps: z.number(),
  lapses: z.number(),
  state: z.number(),
  last_review: z.string().optional(),
  mistakeType: z.enum(["概念盲区", "审题失误", "混淆考点"]),
  favorite: z.boolean(),
});

const legacyPreferencesSchema = z.object({
  activeBankId: bankIdSchema,
  contentLanguage: z.enum(["zh", "en", "bilingual"]),
  questionAssistEnabled: z.boolean().optional(),
});

const appDataV2Schema = z.object({
  version: z.literal(2),
  questions: questionArraySchema,
  answers: z.array(answerRecordSchema),
  reviews: z.array(legacyReviewCardSchema),
  exams: z.array(examRecordSchema),
  streakDates: z.array(z.string()),
  ai: aiSettingsSchema,
  preferences: legacyPreferencesSchema,
});

const legacyAnswerSchema = z.object({
  id: z.string(),
  questionId: z.string(),
  domainId: domainIdSchema,
  selectedAnswers: z.array(z.string()),
  correct: z.boolean(),
  answeredAt: z.string(),
  durationSeconds: z.number().nonnegative(),
  mode: z.enum(["practice", "review", "exam"]),
});

const legacyExamSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  durationSeconds: z.number().nonnegative(),
  questionIds: z.array(z.string()),
  answers: z.record(z.string(), z.array(z.string())),
  score: z.number(),
  domainScores: z.partialRecord(domainIdSchema, z.number()),
});

const legacyAppDataSchema = z.object({
  version: z.literal(1),
  questions: questionArraySchema,
  answers: z.array(legacyAnswerSchema),
  reviews: z.array(legacyReviewCardSchema),
  exams: z.array(legacyExamSchema),
  streakDates: z.array(z.string()),
  ai: aiSettingsSchema,
});

function migrateReview(review: z.infer<typeof legacyReviewCardSchema>) {
  const { questionId, ...state } = review;
  return { ...state, id: `question:${questionId}`, targetType: "question" as const, targetId: questionId };
}

export const appDataSchema: z.ZodType<AppData> = z.union([appDataV3Schema, appDataV2Schema, legacyAppDataSchema]).transform((data): AppData => {
  if (data.version === 3) return { ...data, prepProfile: { ...data.prepProfile, favoriteCardIds: data.prepProfile.favoriteCardIds ?? [] } } as AppData;
  if (data.version === 2) return {
    ...data,
    version: 3,
    reviews: data.reviews.map(migrateReview),
    preferences: { ...DEFAULT_PREFERENCES, ...data.preferences },
    prepProfile: { studyWeekdays: [1, 2, 3, 4, 5, 6], dailyQuestionTarget: 20, startedAt: new Date().toISOString(), favoriteCardIds: [] },
    outlineProgress: [],
    checklistProgress: [],
  };
  return {
    version: 3,
    questions: data.questions.map((question) => normalizeSeedQuestion(question)),
    answers: data.answers.map((answer) => ({
      id: answer.id,
      questionId: answer.questionId,
      bankId: ORIGINAL_BANK_ID,
      sectionId: answer.domainId,
      domainId: answer.domainId,
      response: { kind: "choice", selectedAnswers: answer.selectedAnswers },
      correct: answer.correct,
      answeredAt: answer.answeredAt,
      durationSeconds: answer.durationSeconds,
      mode: answer.mode,
    })),
    reviews: data.reviews.map(migrateReview),
    exams: data.exams.map((exam) => ({
      ...exam,
      bankId: ORIGINAL_BANK_ID,
      answers: Object.fromEntries(Object.entries(exam.answers).map(([id, selectedAnswers]) => [id, { kind: "choice" as const, selectedAnswers }])),
      sectionScores: Object.fromEntries(Object.entries(exam.domainScores)),
    })),
    streakDates: data.streakDates,
    ai: data.ai,
    preferences: DEFAULT_PREFERENCES,
    prepProfile: { studyWeekdays: [1, 2, 3, 4, 5, 6], dailyQuestionTarget: 20, startedAt: new Date().toISOString(), favoriteCardIds: [] },
    outlineProgress: [],
    checklistProgress: [],
  };
});
