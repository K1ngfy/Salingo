// Leaderboard / multi-user backend for the Sites deployment.
// The frontend talks to these routes same-origin; this module reaches Cloudflare D1
// over its HTTP REST API using server-only secrets (CF_ACCOUNT_ID / CF_D1_DATABASE_ID / CF_D1_API_TOKEN).

const MAX_BODY_BYTES = 400_000;
const MAX_NICKNAME = 24;
const MAX_DAYS = 3660;
const DOMAIN_IDS = new Set(["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"]);
const RECOVERY_WORDS = [
  "apple", "tiger", "lake", "cloud", "stone", "river", "maple", "coral",
  "amber", "olive", "comet", "delta", "flint", "grove", "harbor", "ivory",
  "jade", "koala", "lotus", "meadow", "nova", "orbit", "pearl", "quartz",
  "raven", "sage", "topaz", "umbra", "violet", "willow", "xenon", "yarrow",
];

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function isSameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

function d1Config(env) {
  if (env.DB && typeof env.DB.prepare === "function") return { binding: env.DB };
  const accountId = (env.CF_ACCOUNT_ID || "").trim();
  const databaseId = (env.CF_D1_DATABASE_ID || "").trim();
  const apiToken = (env.CF_D1_API_TOKEN || "").trim();
  return accountId && databaseId && apiToken ? { accountId, databaseId, apiToken } : undefined;
}

async function d1Query(config, sql, params = []) {
  if (config.binding) {
    const statement = config.binding.prepare(sql);
    const result = await (params.length ? statement.bind(...params) : statement).all();
    return result?.results ?? [];
  }
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiToken}` },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    const message = payload?.errors?.[0]?.message || `D1 请求失败（HTTP ${response.status}）`;
    throw new Error(message);
  }
  return payload?.result?.[0]?.results ?? [];
}

async function parseBody(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_BODY_BYTES) throw new Error("请求体过大");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error("请求体过大");
  return text ? JSON.parse(text) : {};
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

function dayDiff(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function computeStreaks(dates) {
  if (!dates.length) return { current: 0, longest: 0 };
  let longest = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i += 1) {
    run = dayDiff(dates[i - 1], dates[i]) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  let current = 1;
  for (let i = dates.length - 1; i > 0; i -= 1) {
    if (dayDiff(dates[i - 1], dates[i]) === 1) current += 1;
    else break;
  }
  return { current, longest };
}

function sanitizeNickname(value) {
  const nickname = typeof value === "string"
    ? value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, MAX_NICKNAME)
    : "";
  if (!nickname) throw new Error("昵称不能为空");
  return nickname;
}

function isDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toCount(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? Math.min(number, 100_000) : 0;
}

function sanitizeDays(value) {
  if (!Array.isArray(value)) throw new Error("缺少每日数据");
  const days = [];
  for (const entry of value.slice(0, MAX_DAYS)) {
    if (!isDateKey(entry?.date)) continue;
    const count = toCount(entry.count);
    const correct = Math.min(count, toCount(entry.correct));
    const domains = [];
    if (Array.isArray(entry.domains)) {
      for (const domain of entry.domains) {
        if (!DOMAIN_IDS.has(domain?.domainId)) continue;
        const dCount = toCount(domain.count);
        domains.push({ domainId: domain.domainId, count: dCount, correct: Math.min(dCount, toCount(domain.correct)) });
      }
    }
    days.push({ date: entry.date, count, correct, domains });
  }
  return days;
}

function randomWord() {
  return RECOVERY_WORDS[Math.floor(Math.random() * RECOVERY_WORDS.length)];
}

function generateRecoveryCode() {
  const digits = String(Math.floor(Math.random() * 900) + 100);
  return `${randomWord()}-${randomWord()}-${digits}-${randomWord()}`;
}

function mapLeaderboardRow(row) {
  return {
    publicId: row.public_id,
    nickname: row.nickname,
    currentStreak: row.current_streak ?? 0,
    longestStreak: row.longest_streak ?? 0,
    todayCount: row.today_count ?? 0,
    todayDate: row.today_date ?? null,
    totalAnswered: row.total_answered ?? 0,
    lastActiveDate: row.last_active_date ?? null,
  };
}

async function createProfile(config, body) {
  const nickname = sanitizeNickname(body?.nickname);
  const userId = crypto.randomUUID();
  const publicId = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const now = new Date().toISOString();
  let recoveryCode = generateRecoveryCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await d1Query(config, "SELECT 1 FROM users WHERE recovery_code = ? LIMIT 1", [recoveryCode]);
    if (!existing.length) break;
    recoveryCode = generateRecoveryCode();
  }
  await d1Query(
    config,
    `INSERT INTO users (user_id, public_id, recovery_code, nickname, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, publicId, recoveryCode, nickname, now, now],
  );
  return jsonResponse(200, { userId, publicId, nickname, recoveryCode });
}

async function restoreProfile(config, body) {
  const recoveryCode = typeof body?.recoveryCode === "string" ? body.recoveryCode.trim() : "";
  if (!recoveryCode) return jsonResponse(400, { error: "请输入恢复码" });
  const rows = await d1Query(
    config,
    "SELECT user_id, public_id, nickname, recovery_code FROM users WHERE recovery_code = ? LIMIT 1",
    [recoveryCode],
  );
  if (!rows.length) return jsonResponse(404, { error: "恢复码无效，请检查后重试" });
  const row = rows[0];
  return jsonResponse(200, { userId: row.user_id, publicId: row.public_id, nickname: row.nickname, recoveryCode: row.recovery_code });
}

async function syncProgress(config, body) {
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const recoveryCode = typeof body?.recoveryCode === "string" ? body.recoveryCode : "";
  if (!userId || !recoveryCode) return jsonResponse(400, { error: "缺少身份信息" });
  const owner = await d1Query(config, "SELECT recovery_code FROM users WHERE user_id = ? LIMIT 1", [userId]);
  if (!owner.length || owner[0].recovery_code !== recoveryCode) return jsonResponse(403, { error: "身份校验失败" });

  const days = sanitizeDays(body?.days);

  for (const group of chunk(days, 20)) {
    const placeholders = group.map(() => "(?, ?, ?, ?)").join(", ");
    const params = group.flatMap((day) => [userId, day.date, day.count, day.correct]);
    await d1Query(
      config,
      `INSERT INTO daily_stats (user_id, date, count, correct_count) VALUES ${placeholders}
       ON CONFLICT(user_id, date) DO UPDATE SET
         count = MAX(daily_stats.count, excluded.count),
         correct_count = MAX(daily_stats.correct_count, excluded.correct_count)`,
      params,
    );
  }

  const domainRows = days.flatMap((day) => day.domains.map((domain) => [userId, day.date, domain.domainId, domain.count, domain.correct]));
  for (const group of chunk(domainRows, 20)) {
    const placeholders = group.map(() => "(?, ?, ?, ?, ?)").join(", ");
    const params = group.flat();
    await d1Query(
      config,
      `INSERT INTO domain_stats (user_id, date, domain_id, count, correct_count) VALUES ${placeholders}
       ON CONFLICT(user_id, date, domain_id) DO UPDATE SET
         count = MAX(domain_stats.count, excluded.count),
         correct_count = MAX(domain_stats.correct_count, excluded.correct_count)`,
      params,
    );
  }

  const stored = await d1Query(config, "SELECT date, count FROM daily_stats WHERE user_id = ? ORDER BY date ASC", [userId]);
  const dates = stored.map((row) => row.date);
  const total = stored.reduce((sum, row) => sum + (row.count ?? 0), 0);
  const { current, longest } = computeStreaks(dates);
  const last = stored[stored.length - 1];
  await d1Query(
    config,
    `UPDATE users SET current_streak = ?, longest_streak = ?, today_count = ?, today_date = ?,
       total_answered = ?, last_active_date = ?, updated_at = ? WHERE user_id = ?`,
    [current, longest, last?.count ?? 0, last?.date ?? null, total, last?.date ?? null, new Date().toISOString(), userId],
  );
  return jsonResponse(200, { ok: true, currentStreak: current, longestStreak: longest, totalAnswered: total });
}

async function leaderboard(config, url) {
  const type = url.searchParams.get("type") === "today" ? "today" : "streak";
  const columns = "public_id, nickname, current_streak, longest_streak, today_count, today_date, total_answered, last_active_date";
  let rows;
  if (type === "today") {
    const today = new Date().toISOString().slice(0, 10);
    rows = await d1Query(
      config,
      `SELECT ${columns}, (CASE WHEN today_date = ? THEN today_count ELSE 0 END) AS today_effective
       FROM users ORDER BY today_effective DESC, current_streak DESC LIMIT 100`,
      [today],
    );
  } else {
    rows = await d1Query(config, `SELECT ${columns} FROM users ORDER BY current_streak DESC, total_answered DESC LIMIT 100`);
  }
  return jsonResponse(200, { type, entries: rows.map(mapLeaderboardRow) });
}

async function domainLeaderboard(config, url) {
  const domainId = url.searchParams.get("domainId");
  if (!DOMAIN_IDS.has(domainId)) return jsonResponse(400, { error: "无效的知识域" });
  const rows = await d1Query(
    config,
    `SELECT u.public_id AS public_id, u.nickname AS nickname,
            SUM(d.count) AS count, SUM(d.correct_count) AS correct
     FROM domain_stats d JOIN users u ON u.user_id = d.user_id
     WHERE d.domain_id = ?
     GROUP BY d.user_id
     HAVING count > 0
     ORDER BY (CAST(correct AS REAL) / count) DESC, count DESC
     LIMIT 100`,
    [domainId],
  );
  const entries = rows.map((row) => ({
    publicId: row.public_id,
    nickname: row.nickname,
    count: row.count ?? 0,
    correct: row.correct ?? 0,
    rate: row.count ? Math.round((row.correct / row.count) * 100) : 0,
  }));
  return jsonResponse(200, { domainId, entries });
}

async function userStats(config, url) {
  const publicId = url.searchParams.get("publicId");
  if (!publicId) return jsonResponse(400, { error: "缺少用户标识" });
  const profileRows = await d1Query(
    config,
    `SELECT user_id, public_id, nickname, current_streak, longest_streak, today_count, today_date, total_answered, last_active_date
     FROM users WHERE public_id = ? LIMIT 1`,
    [publicId],
  );
  if (!profileRows.length) return jsonResponse(404, { error: "用户不存在" });
  const profile = profileRows[0];
  const [daily, domains] = await Promise.all([
    d1Query(config, "SELECT date, count, correct_count FROM daily_stats WHERE user_id = ? ORDER BY date ASC", [profile.user_id]),
    d1Query(config, "SELECT domain_id, SUM(count) AS count, SUM(correct_count) AS correct FROM domain_stats WHERE user_id = ? GROUP BY domain_id", [profile.user_id]),
  ]);
  return jsonResponse(200, {
    profile: mapLeaderboardRow(profile),
    daily: daily.map((row) => ({ date: row.date, count: row.count ?? 0, correct: row.correct_count ?? 0 })),
    domains: domains.map((row) => ({ domainId: row.domain_id, count: row.count ?? 0, correct: row.correct ?? 0 })),
  });
}

export async function handleCommunityRequest(request, env) {
  if (!isSameOrigin(request)) return jsonResponse(403, { error: "Origin not allowed" });
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/community/, "") || "/";
  const config = d1Config(env);

  if (request.method === "GET" && route === "/health") {
    return jsonResponse(200, { ok: true, configured: Boolean(config) });
  }
  if (!config) return jsonResponse(503, { error: "排行榜服务尚未配置，请在 Sites 托管环境设置 CF_ACCOUNT_ID / CF_D1_DATABASE_ID / CF_D1_API_TOKEN" });

  try {
    if (request.method === "POST" && route === "/profile") return await createProfile(config, await parseBody(request));
    if (request.method === "POST" && route === "/restore") return await restoreProfile(config, await parseBody(request));
    if (request.method === "POST" && route === "/progress") return await syncProgress(config, await parseBody(request));
    if (request.method === "GET" && route === "/leaderboard") return await leaderboard(config, url);
    if (request.method === "GET" && route === "/leaderboard/domain") return await domainLeaderboard(config, url);
    if (request.method === "GET" && route === "/user") return await userStats(config, url);
    return jsonResponse(404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "排行榜请求失败";
    return jsonResponse(502, { error: message });
  }
}

export const __test__ = { computeStreaks, sanitizeDays, sanitizeNickname, generateRecoveryCode };
