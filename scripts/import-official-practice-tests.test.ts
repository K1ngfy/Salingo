import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { convertOfficialPracticeTests, parseCsv } from "./import-official-practice-tests";

const source = readFileSync(resolve(process.cwd(), "src/data/imports/official-practice-tests-bilingual.csv"), "utf8");
const converted = convertOfficialPracticeTests(parseCsv(source));

describe("Official Practice Tests CSV conversion", () => {
  it("preserves all rows, sections, source types and bilingual content", () => {
    expect(converted.questions).toHaveLength(1301);
    expect(new Set(converted.questions.map((question) => question.id)).size).toBe(1301);
    expect(converted.questions.filter((question) => question.requiresFigure)).toHaveLength(25);
    expect(converted.questions.filter((question) => question.practiceEnabled)).toHaveLength(1276);
    expect(converted.questions.every((question) => question.translations?.en?.stem)).toBe(true);
    expect(converted.questions.filter((question) => question.tags.includes("select_all_that_apply"))).toHaveLength(47);
    expect(converted.questions.filter((question) => question.tags.includes("matching"))).toHaveLength(15);
  });

  it("builds complete interactive matching questions", () => {
    const matching = converted.questions.filter((question) => question.type === "matching");
    expect(matching).toHaveLength(16);
    for (const question of matching) {
      expect(Object.keys(question.correctMatches)).toHaveLength(question.matchingPrompts.length);
      expect(question.translations?.en?.matchingPrompts).toHaveLength(question.matchingPrompts.length);
    }
  });

  it("applies the five audited source-answer repairs", () => {
    expect(converted.repairs.map((repair) => repair.sourceId)).toEqual(["2:100", "3:31", "5:98", "5:100", "9:125"]);
    const kerckhoffs = converted.questions.find((question) => question.id.endsWith("c03-q031"));
    expect(kerckhoffs?.type === "single" && kerckhoffs.correctAnswers).toEqual(["B"]);
    const factors = converted.questions.find((question) => question.id.endsWith("c09-q125"));
    expect(factors?.type === "matching" && factors.correctMatches.G).toBe("1");
  });
});
