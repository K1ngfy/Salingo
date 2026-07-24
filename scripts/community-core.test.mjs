import { afterEach, describe, expect, it, vi } from "vitest";
import { handleCommunityRequest, __test__ } from "./community-core.mjs";

const CONFIG = { CF_ACCOUNT_ID: "acct", CF_D1_DATABASE_ID: "db", CF_D1_API_TOKEN: "token" };

function d1Response(results) {
  return new Response(JSON.stringify({ result: [{ results, success: true }], success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Emulates the D1 REST endpoint by dispatching on the SQL in the request body.
function stubD1(handler) {
  const fetchMock = vi.fn(async (_url, init) => {
    const { sql, params } = JSON.parse(init.body);
    return d1Response(handler(sql, params) ?? []);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function post(route, body, headers = {}) {
  return new Request(`https://salingo.example/api/community/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://salingo.example", ...headers },
    body: JSON.stringify(body),
  });
}

function remove(route, body, headers = {}) {
  return new Request(`https://salingo.example/api/community/${route}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Origin: "https://salingo.example", ...headers },
    body: JSON.stringify(body),
  });
}

function get(route, headers = {}) {
  return new Request(`https://salingo.example/api/community/${route}`, {
    headers: { Origin: "https://salingo.example", ...headers },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("community backend", () => {
  it("rejects cross-origin requests", async () => {
    const response = await handleCommunityRequest(get("leaderboard", { Origin: "https://attacker.example" }), CONFIG);
    expect(response.status).toBe(403);
  });

  it("reports unconfigured health without secrets", async () => {
    const response = await handleCommunityRequest(get("health"), {});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ configured: false });
  });

  it("returns 503 for data routes when D1 is not configured", async () => {
    const response = await handleCommunityRequest(get("leaderboard"), {});
    expect(response.status).toBe(503);
  });

  it("uses the native Sites D1 binding when available", async () => {
    const all = vi.fn(async () => ({ results: [
      { public_id: "native", nickname: "原生用户", current_streak: 5, longest_streak: 8, today_count: 2, today_date: "2026-07-23", total_answered: 42, last_active_date: "2026-07-23" },
    ] }));
    const bind = vi.fn(() => ({ all }));
    const prepare = vi.fn(() => ({ bind, all }));
    const response = await handleCommunityRequest(get("leaderboard?type=streak"), { DB: { prepare } });
    expect(response.status).toBe(200);
    expect((await response.json()).entries[0]).toMatchObject({ publicId: "native", currentStreak: 5 });
    expect(prepare).toHaveBeenCalledOnce();
    expect(bind).not.toHaveBeenCalled();
  });

  it("creates a profile and returns a recovery code", async () => {
    stubD1((sql) => (sql.startsWith("SELECT 1") ? [] : []));
    const response = await handleCommunityRequest(post("profile", { nickname: "阿力" }), CONFIG);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.nickname).toBe("阿力");
    expect(body.userId).toBeTruthy();
    expect(body.publicId).toBeTruthy();
    expect(body.recoveryCode).toMatch(/^[a-z]+-[a-z]+-\d{3}-[a-z]+$/);
  });

  it("rejects an empty nickname", async () => {
    stubD1(() => []);
    const response = await handleCommunityRequest(post("profile", { nickname: "   " }), CONFIG);
    expect(response.status).toBe(502);
  });

  it("restores a profile by recovery code", async () => {
    stubD1(() => [{ user_id: "u1", public_id: "p1", nickname: "阿力", recovery_code: "apple-tiger-123-lake" }]);
    const response = await handleCommunityRequest(post("restore", { recoveryCode: "apple-tiger-123-lake" }), CONFIG);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ userId: "u1", publicId: "p1" });
  });

  it("404s an unknown recovery code", async () => {
    stubD1(() => []);
    const response = await handleCommunityRequest(post("restore", { recoveryCode: "nope-nope-000-nope" }), CONFIG);
    expect(response.status).toBe(404);
  });

  it("rejects progress writes with a mismatched recovery code", async () => {
    stubD1((sql) => (sql.includes("SELECT recovery_code") ? [{ recovery_code: "real-code-999-here" }] : []));
    const response = await handleCommunityRequest(post("progress", { userId: "u1", recoveryCode: "wrong", days: [] }), CONFIG);
    expect(response.status).toBe(403);
  });

  it("recomputes streak from stored days on progress sync", async () => {
    const updates = [];
    stubD1((sql, params) => {
      if (sql.includes("SELECT recovery_code")) return [{ recovery_code: "code" }];
      if (sql.startsWith("SELECT date, count")) {
        return [
          { date: "2026-07-20", count: 5 },
          { date: "2026-07-21", count: 8 },
          { date: "2026-07-22", count: 3 },
        ];
      }
      if (sql.startsWith("UPDATE users")) { updates.push(params); return []; }
      return [];
    });
    const response = await handleCommunityRequest(
      post("progress", { userId: "u1", recoveryCode: "code", days: [{ date: "2026-07-22", count: 3, correct: 2, domains: [{ domainId: "d1", count: 3, correct: 2 }] }] }),
      CONFIG,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ currentStreak: 3, longestStreak: 3, totalAnswered: 16 });
  });

  it("stores immutable answer events and merges their cross-device aggregates", async () => {
    const writes = [];
    stubD1((sql, params) => {
      if (sql.includes("SELECT recovery_code")) return [{ recovery_code: "code" }];
      if (sql.startsWith("INSERT INTO answer_events")) { writes.push(params); return []; }
      if (sql.startsWith("SELECT date, COUNT(*)")) return [{ date: "2026-07-22", count: 8, correct_count: 6 }];
      if (sql.startsWith("SELECT date, domain_id")) return [{ date: "2026-07-22", domain_id: "d1", count: 8, correct_count: 6 }];
      if (sql.startsWith("SELECT date, count")) return [{ date: "2026-07-22", count: 8 }];
      return [];
    });
    const answer = {
      id: "answer-1",
      questionId: "d1-care-001",
      bankId: "salingo-original",
      sectionId: "d1",
      domainId: "d1",
      response: { kind: "choice", selectedAnswers: ["A"] },
      correct: true,
      answeredAt: "2026-07-22T10:00:00.000Z",
      durationSeconds: 12,
      mode: "sweep",
      date: "2026-07-22",
    };
    const response = await handleCommunityRequest(
      post("progress", { userId: "u1", recoveryCode: "code", days: [], answers: [answer] }),
      CONFIG,
    );
    expect(response.status).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("answer-1");
    expect(await response.json()).toMatchObject({ totalAnswered: 8 });
  });

  it("keeps every D1 write within the 100-bound-parameter limit", async () => {
    const parameterCounts = [];
    stubD1((sql, params) => {
      parameterCounts.push(params.length);
      if (sql.includes("SELECT recovery_code")) return [{ recovery_code: "code" }];
      return [];
    });
    const answers = Array.from({ length: 17 }, (_, index) => ({
      id: `answer-${index}`,
      questionId: `d1-care-${index}`,
      bankId: "salingo-original",
      sectionId: "d1",
      domainId: "d1",
      response: { kind: "choice", selectedAnswers: ["A"] },
      correct: true,
      answeredAt: "2026-07-22T10:00:00.000Z",
      durationSeconds: 12,
      mode: "sweep",
      date: "2026-07-22",
    }));
    const response = await handleCommunityRequest(
      post("progress", { userId: "u1", recoveryCode: "code", days: [], answers }),
      CONFIG,
    );
    expect(response.status).toBe(200);
    expect(Math.max(...parameterCounts)).toBeLessThanOrEqual(100);
    expect(parameterCounts.filter((count) => count > 1)).toEqual([96, 96, 12, 8]);
  });

  it("restores exact answer records only after private profile verification", async () => {
    stubD1((sql) => {
      if (sql.includes("SELECT recovery_code")) return [{ recovery_code: "code" }];
      if (sql.includes("FROM answer_events")) return [{
        answer_id: "answer-1",
        question_id: "d1-care-001",
        bank_id: "salingo-original",
        section_id: "d1",
        domain_id: "d1",
        response_json: JSON.stringify({ kind: "choice", selectedAnswers: ["A"] }),
        correct: 1,
        answered_at: "2026-07-22T10:00:00.000Z",
        duration_seconds: 12,
        mode: "sweep",
      }];
      return [];
    });
    const response = await handleCommunityRequest(
      post("progress/restore", { userId: "u1", recoveryCode: "code" }),
      CONFIG,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).answers[0]).toMatchObject({
      id: "answer-1",
      questionId: "d1-care-001",
      mode: "sweep",
      correct: true,
    });
  });

  it("deletes owned cloud progress before deleting the authenticated account", async () => {
    const statements = [];
    stubD1((sql) => {
      statements.push(sql);
      if (sql.includes("SELECT recovery_code")) return [{ recovery_code: "code" }];
      return [];
    });
    const response = await handleCommunityRequest(
      remove("profile", { userId: "u1", recoveryCode: "code" }),
      CONFIG,
    );
    expect(response.status).toBe(200);
    expect(statements.slice(1)).toEqual([
      "DELETE FROM answer_events WHERE user_id = ?",
      "DELETE FROM domain_stats WHERE user_id = ?",
      "DELETE FROM daily_stats WHERE user_id = ?",
      "DELETE FROM users WHERE user_id = ?",
    ]);
  });

  it("maps the streak leaderboard", async () => {
    stubD1(() => [
      { public_id: "p1", nickname: "阿力", current_streak: 12, longest_streak: 20, today_count: 4, today_date: "2026-07-22", total_answered: 300, last_active_date: "2026-07-22" },
    ]);
    const response = await handleCommunityRequest(get("leaderboard?type=streak"), CONFIG);
    const body = await response.json();
    expect(body.type).toBe("streak");
    expect(body.entries[0]).toMatchObject({ publicId: "p1", currentStreak: 12, longestStreak: 20 });
  });

  it("validates the domain leaderboard domain id", async () => {
    stubD1(() => []);
    const response = await handleCommunityRequest(get("leaderboard/domain?domainId=nope"), CONFIG);
    expect(response.status).toBe(400);
  });
});

describe("community helpers", () => {
  it("computes consecutive-day streaks", () => {
    expect(__test__.computeStreaks([])).toEqual({ current: 0, longest: 0 });
    expect(__test__.computeStreaks(["2026-07-20", "2026-07-21", "2026-07-22"])).toEqual({ current: 3, longest: 3 });
    expect(__test__.computeStreaks(["2026-07-01", "2026-07-02", "2026-07-20", "2026-07-21"])).toEqual({ current: 2, longest: 2 });
    expect(__test__.computeStreaks(["2026-07-10", "2026-07-11", "2026-07-12", "2026-07-20"])).toEqual({ current: 1, longest: 3 });
  });

  it("sanitizes uploaded days and clamps correct counts", () => {
    const days = __test__.sanitizeDays([
      { date: "2026-07-22", count: 3, correct: 9, domains: [{ domainId: "d1", count: 2, correct: 2 }, { domainId: "bad", count: 5, correct: 5 }] },
      { date: "not-a-date", count: 5, correct: 5, domains: [] },
    ]);
    expect(days).toHaveLength(1);
    expect(days[0].correct).toBe(3);
    expect(days[0].domains).toHaveLength(1);
  });

  it("validates and normalizes uploaded answer events", () => {
    const answers = __test__.sanitizeAnswers([{
      id: "answer-1",
      questionId: "d1-care-001",
      bankId: "salingo-original",
      sectionId: "d1",
      domainId: "d1",
      response: { kind: "choice", selectedAnswers: ["A"] },
      correct: 1,
      answeredAt: "2026-07-22T10:00:00.000Z",
      durationSeconds: 999_999,
      mode: "sweep",
      date: "2026-07-22",
    }]);
    expect(answers[0]).toMatchObject({ correct: true, durationSeconds: 86_400 });
    expect(() => __test__.sanitizeAnswers([{ id: "bad" }])).toThrow("字段无效");
  });
});
