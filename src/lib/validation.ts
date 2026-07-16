import { z } from "zod";

export const explanationSchema = z.object({
  logic: z.string().min(5),
  optionAnalysis: z.record(z.string(), z.string()),
  knowledgePoint: z.string().min(3),
  plainLanguage: z.string().min(5),
});

export const questionSchema = z.object({
  id: z.string().min(3),
  domainId: z.enum(["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"]),
  type: z.enum(["single", "multiple"]),
  difficulty: z.enum(["基础", "进阶", "高难", "陷阱"]),
  tags: z.array(z.string()),
  stem: z.string().min(10),
  options: z.array(z.object({ id: z.string(), text: z.string().min(1) })).min(4),
  correctAnswers: z.array(z.string()).min(1),
  explanation: explanationSchema,
  source: z.enum(["original", "ai", "imported"]),
  outlineVersion: z.literal("2024-current"),
  createdAt: z.string(),
});

export const questionArraySchema = z.array(questionSchema);

export const answerRecordSchema = z.object({
  id: z.string().min(1),
  questionId: z.string().min(1),
  domainId: z.enum(["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"]),
  selectedAnswers: z.array(z.string()),
  correct: z.boolean(),
  answeredAt: z.string(),
  durationSeconds: z.number().nonnegative(),
  mode: z.enum(["practice", "review", "exam"]),
});

export const reviewCardSchema = z.object({
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

export const examRecordSchema = z.object({
  id: z.string().min(1),
  startedAt: z.string(),
  finishedAt: z.string(),
  durationSeconds: z.number().nonnegative(),
  questionIds: z.array(z.string()),
  answers: z.record(z.string(), z.array(z.string())),
  score: z.number(),
  domainScores: z.partialRecord(z.enum(["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"]), z.number()),
});

export const aiSettingsSchema = z.object({
  baseUrl: z.string(),
  apiKey: z.string(),
  model: z.string().min(1),
});

export const appDataSchema = z.object({
  version: z.literal(1),
  questions: questionArraySchema,
  answers: z.array(answerRecordSchema),
  reviews: z.array(reviewCardSchema),
  exams: z.array(examRecordSchema),
  streakDates: z.array(z.string()),
  ai: aiSettingsSchema,
});
