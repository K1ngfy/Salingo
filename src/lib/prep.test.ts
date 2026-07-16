import { describe, expect, it } from "vitest";
import { PREP_CONTENT } from "@/data/prep-source";
import { buildTodayPlan, domainQuestionAllocation, prepPhase, questionReadingWarnings, splitQuestionKeywords } from "./prep";
import type { AnswerRecord, PrepProfile } from "./types";

const profile: PrepProfile = { examDate: "2026-08-01", studyWeekdays: [1, 2, 3, 4, 5, 6], dailyQuestionTarget: 20, startedAt: "2026-07-01T00:00:00.000Z", favoriteCardIds: [] };

describe("prep content and planning", () => {
  it("preserves complete source inventories", () => {
    expect(PREP_CONTENT.objectives).toHaveLength(62);
    expect(PREP_CONTENT.cards.filter((item) => item.kind === "knowledge")).toHaveLength(88);
    expect(PREP_CONTENT.cards.filter((item) => item.kind === "vocabulary")).toHaveLength(85);
    expect(PREP_CONTENT.cards.filter((item) => item.reviewEligible).every((item) => item.verificationStatus === "verified")).toBe(true);
  });

  it("allocates the exact target while favoring a weak domain", () => {
    const answers: AnswerRecord[] = Array.from({ length: 20 }, (_, index) => ({ id: `a${index}`, questionId: `q${index}`, bankId: "salingo-original", sectionId: "d1", domainId: "d1", response: { kind: "choice", selectedAnswers: ["A"] }, correct: true, answeredAt: "2026-07-01T00:00:00.000Z", durationSeconds: 10, mode: "practice" }));
    const allocation = domainQuestionAllocation(answers, 25);
    expect(allocation.reduce((sum, item) => sum + item.count, 0)).toBe(25);
    expect((allocation.find((item) => item.domainId === "d1")?.count ?? 0)).toBeLessThan(allocation.find((item) => item.domainId === "d7")?.count ?? 0);
  });

  it("uses sprint and 48-hour mock boundaries", () => {
    expect(prepPhase(profile, new Date("2026-07-20T12:00:00"))).toBe("sprint");
    const plan = buildTodayPlan({ profile, answers: [], reviews: [], objectives: PREP_CONTENT.objectives, outlineProgress: [], now: new Date("2026-07-31T12:00:00") });
    expect(plan.scheduleMock).toBe(false);
  });

  it("rolls unfinished work forward but caps today at twice the target", () => {
    const plan = buildTodayPlan({ profile: { ...profile, startedAt: "2026-07-01T00:00:00.000Z" }, answers: [], reviews: [], objectives: PREP_CONTENT.objectives, outlineProgress: [], now: new Date("2026-07-10T12:00:00") });
    expect(plan.carryover).toBe(20);
    expect(plan.questionTarget).toBe(40);
  });

  it("highlights priority words and warns about double negatives", () => {
    expect(splitQuestionKeywords("Which is the BEST control?").some((item) => item.highlighted && item.value === "BEST")).toBe(true);
    expect(questionReadingWarnings("Which is NOT a control that should NOT be used?")).toContain("题干可能包含双重否定，请先改写为肯定句再判断。");
  });
});
