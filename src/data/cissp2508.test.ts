import { describe, expect, it } from "vitest";
import { questionArraySchema } from "@/lib/validation";
import { CISSP2508_QUESTIONS } from "./cissp2508";

describe("CISSP2508 imported question bank", () => {
  it("converts all 277 source rows into valid unique questions", () => {
    expect(questionArraySchema.parse(CISSP2508_QUESTIONS)).toHaveLength(277);
    expect(new Set(CISSP2508_QUESTIONS.map((question) => question.id)).size).toBe(277);
    expect(CISSP2508_QUESTIONS.filter((question) => question.type === "multiple")).toHaveLength(1);
    expect(CISSP2508_QUESTIONS.filter((question) => question.options.length === 5)).toHaveLength(2);
  });

  it("covers every CISSP domain through explicit automatic classification", () => {
    const domains = new Set(CISSP2508_QUESTIONS.map((question) => question.domainId));
    expect(domains).toEqual(new Set(["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"]));
    expect(CISSP2508_QUESTIONS.every((question) => question.tags.includes("用户导入"))).toBe(true);
  });

  it("provides basic four-part explanations while preserving source answers", () => {
    for (const question of CISSP2508_QUESTIONS) {
      expect(question.explanation.logic).toContain(question.correctAnswers.join("、"));
      expect(question.explanation.knowledgePoint).toContain("自动归类");
      expect(question.explanation.plainLanguage).toMatch(/原文件未附解析|保留了源文件随题附带的说明/);
      expect(Object.keys(question.explanation.optionAnalysis)).toEqual(question.options.map((option) => option.id));
      expect(question.correctAnswers.every((answer) => question.options.some((option) => option.id === answer))).toBe(true);
      expect(question.options.some((option) => /解析[:：]/.test(option.text))).toBe(false);
    }
  });
});
