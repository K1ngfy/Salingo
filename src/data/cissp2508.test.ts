import { describe, expect, it } from "vitest";
import { questionArraySchema } from "@/lib/validation";
import { CISSP2508_BANK_ID, CISSP2508_QUESTIONS } from "./cissp2508";
import generatedExplanations from "./cissp2508-ai-explanations.json";

describe("CISSP2508 imported question bank", () => {
  it("converts all 277 source rows into valid unique questions", () => {
    expect(questionArraySchema.parse(CISSP2508_QUESTIONS)).toHaveLength(277);
    expect(new Set(CISSP2508_QUESTIONS.map((question) => question.id)).size).toBe(277);
    expect(CISSP2508_QUESTIONS.filter((question) => question.type === "multiple")).toHaveLength(1);
    expect(CISSP2508_QUESTIONS.filter((question) => question.options.length === 5)).toHaveLength(2);
    expect(CISSP2508_QUESTIONS.every((question) => question.bankId === CISSP2508_BANK_ID)).toBe(true);
    expect(CISSP2508_QUESTIONS.every((question) => question.sectionId === question.domainId)).toBe(true);
    expect(CISSP2508_QUESTIONS.every((question) => question.sourceReference === "CISSP2508模拟题_含答案.csv")).toBe(true);
  });

  it("covers every CISSP domain through explicit automatic classification", () => {
    const domains = new Set(CISSP2508_QUESTIONS.map((question) => question.domainId));
    expect(domains).toEqual(new Set(["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"]));
    expect(CISSP2508_QUESTIONS.every((question) => question.tags.includes("用户导入"))).toBe(true);
  });

  it("ships complete pre-generated AI explanations while preserving source answers", () => {
    expect(generatedExplanations.model).not.toBe("");
    expect(Number.isNaN(Date.parse(generatedExplanations.generatedAt))).toBe(false);
    expect(Object.keys(generatedExplanations.explanations)).toHaveLength(277);
    for (const question of CISSP2508_QUESTIONS) {
      expect(question.type).not.toBe("matching");
      if (question.type === "matching") continue;
      expect(question.explanation.logic.length).toBeGreaterThanOrEqual(70);
      expect(question.explanation.knowledgePoint.length).toBeGreaterThanOrEqual(20);
      expect(question.explanation.plainLanguage.length).toBeGreaterThanOrEqual(45);
      expect(Object.keys(question.explanation.optionAnalysis)).toEqual(question.options.map((option) => option.id));
      expect(Object.values(question.explanation.optionAnalysis).every((value) => value.length >= 25)).toBe(true);
      expect(JSON.stringify(question.explanation)).not.toMatch(/可使用 AI 深度解析|原始题库(?:将|未将)|逐项说明|进一步核对其适用条件|进一步分析该选项/);
      expect(question.correctAnswers.every((answer) => question.options.some((option) => option.id === answer))).toBe(true);
      expect(question.options.some((option) => /解析[:：]/.test(option.text))).toBe(false);
    }
  });
});
