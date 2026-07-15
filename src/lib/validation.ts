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
