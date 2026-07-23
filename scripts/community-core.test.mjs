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
});
