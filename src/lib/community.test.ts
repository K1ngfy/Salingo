import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteProfile, fetchProgress, syncProgress } from "./community";
import type { AnswerRecord, CommunityProfile } from "./types";

const profile: CommunityProfile = {
  userId: "user-1",
  publicId: "public-1",
  nickname: "测试用户",
  recoveryCode: "apple-tiger-123-lake",
};

function answer(index: number): AnswerRecord {
  return {
    id: `answer-${index}`,
    questionId: `question-${index}`,
    bankId: "salingo-original",
    sectionId: "d1",
    domainId: "d1",
    response: { kind: "choice", selectedAnswers: ["A"] },
    correct: index % 2 === 0,
    answeredAt: "2026-07-24T08:00:00.000Z",
    durationSeconds: 10,
    mode: "sweep",
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("community progress transport", () => {
  it("uploads large answer histories in bounded idempotent batches", async () => {
    const requests: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    const answers = Array.from({ length: 205 }, (_, index) => answer(index));
    await syncProgress(profile, [{ date: "2026-07-24", count: 205, correct: 103, domains: [] }], answers);
    expect(requests).toHaveLength(3);
    expect(requests.map((request) => (request.answers as unknown[]).length)).toEqual([100, 100, 5]);
    expect(requests.map((request) => (request.days as unknown[]).length)).toEqual([1, 0, 0]);
  });

  it("restores private cloud answer records", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ answers: [answer(1)] }), { status: 200 })));
    await expect(fetchProgress(profile)).resolves.toEqual([answer(1)]);
  });

  it("deletes the current cloud profile with its recovery credential", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await deleteProfile(profile);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("DELETE");
    expect(JSON.parse(String(init?.body))).toEqual({
      userId: profile.userId,
      recoveryCode: profile.recoveryCode,
    });
  });
});
