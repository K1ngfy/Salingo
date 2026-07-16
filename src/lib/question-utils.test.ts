import { describe, expect, it } from "vitest";
import { choiceResponse, isCorrectResponse, matchingResponse, questionContent, responseIsComplete } from "./question-utils";
import type { MatchingQuestion } from "./types";

const matchingQuestion: MatchingQuestion = {
  id: "matching-test",
  bankId: "official-practice-tests",
  sectionId: "d1",
  domainId: "d1",
  type: "matching",
  difficulty: "进阶",
  tags: [],
  stem: "匹配项目",
  matchingPrompts: [{ id: "1", text: "项目一" }, { id: "2", text: "项目二" }],
  options: [{ id: "A", text: "说明 A" }, { id: "B", text: "说明 B" }],
  correctMatches: { "1": "B", "2": "A" },
  explanation: { logic: "这是用于测试的完整匹配题解析。", optionAnalysis: {}, knowledgePoint: "D1 · 测试", plainLanguage: "用于验证匹配答案评分。" },
  translations: { en: { stem: "Match items", matchingPrompts: [{ id: "1", text: "One" }, { id: "2", text: "Two" }], options: [{ id: "A", text: "A" }, { id: "B", text: "B" }], explanation: "Explanation" } },
  practiceEnabled: true,
  source: "imported",
  outlineVersion: "source-unspecified",
  createdAt: "2026-07-16T00:00:00.000Z",
};

describe("question answer helpers", () => {
  it("scores matching responses without depending on object key order", () => {
    expect(responseIsComplete(matchingQuestion, matchingResponse({ "2": "A", "1": "B" }))).toBe(true);
    expect(isCorrectResponse(matchingQuestion, matchingResponse({ "2": "A", "1": "B" }))).toBe(true);
    expect(isCorrectResponse(matchingQuestion, matchingResponse({ "1": "A", "2": "B" }))).toBe(false);
    expect(isCorrectResponse(matchingQuestion, choiceResponse(["A"]))).toBe(false);
  });

  it("returns Chinese, English and bilingual content with fallback", () => {
    expect(questionContent(matchingQuestion, "zh").primary.stem).toBe("匹配项目");
    expect(questionContent(matchingQuestion, "en").primary.stem).toBe("Match items");
    expect(questionContent(matchingQuestion, "bilingual").secondary?.stem).toBe("Match items");
  });
});
