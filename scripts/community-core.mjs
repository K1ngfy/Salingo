// Leaderboard / multi-user backend for the Sites deployment.
// The frontend talks to these routes same-origin; this module reaches Cloudflare D1
// over its HTTP REST API using server-only secrets (CF_ACCOUNT_ID / CF_D1_DATABASE_ID / CF_D1_API_TOKEN).

const MAX_BODY_BYTES = 400_000;
const MAX_NICKNAME = 24;
const MAX_DAYS = 3660;
const MAX_ANSWERS = 200;
const D1_MAX_BOUND_PARAMETERS = 100;
const ADMIN_SESSION_COOKIE = "salingo_admin_session";
const ADMIN_SESSION_SECONDS = 12 * 60 * 60;
const ADMIN_PASSWORD_ITERATIONS = 100_000;
const ADMIN_MAX_FAILED_LOGINS = 5;
const ADMIN_LOCK_MINUTES = 15;
const ADMIN_DUMMY_SALT = "6e6f742d612d7265616c2d61646d696e";
const ADMIN_DUMMY_HASH = "0000000000000000000000000000000000000000000000000000000000000000";
const DOMAIN_IDS = new Set(["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"]);
const BANK_IDS = new Set(["salingo-original", "cissp2508-essentials", "official-practice-tests"]);
const ANSWER_MODES = new Set(["practice", "review", "exam", "sweep"]);
const RECOVERY_WORDS = [
  "apple", "tiger", "lake", "cloud", "stone", "river", "maple", "coral",
  "amber", "olive", "comet", "delta", "flint", "grove", "harbor", "ivory",
  "jade", "koala", "lotus", "meadow", "nova", "orbit", "pearl", "quartz",
  "raven", "sage", "topaz", "umbra", "violet", "willow", "xenon", "yarrow",
];

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
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

function d1Chunk(array, variablesPerRow) {
  return chunk(array, Math.max(1, Math.floor(D1_MAX_BOUND_PARAMETERS / variablesPerRow)));
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

function cleanString(value, maxLength) {
  return typeof value === "string"
    ? value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength)
    : "";
}

function sanitizeResponse(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("答题内容格式无效");
  if (value.kind === "choice" && Array.isArray(value.selectedAnswers)) {
    return {
      kind: "choice",
      selectedAnswers: value.selectedAnswers.slice(0, 32).map((answer) => cleanString(answer, 80)).filter(Boolean),
    };
  }
  if (value.kind === "matching" && value.matches && typeof value.matches === "object" && !Array.isArray(value.matches)) {
    return {
      kind: "matching",
      matches: Object.fromEntries(Object.entries(value.matches).slice(0, 64)
        .map(([key, answer]) => [cleanString(key, 80), cleanString(answer, 80)])
        .filter(([key, answer]) => key && answer)),
    };
  }
  throw new Error("答题内容格式无效");
}

function sanitizeAnswers(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("答题记录格式无效");
  const answers = [];
  for (const entry of value.slice(0, MAX_ANSWERS)) {
    const id = cleanString(entry?.id, 80);
    const questionId = cleanString(entry?.questionId, 160);
    const sectionId = cleanString(entry?.sectionId, 160);
    const bankId = cleanString(entry?.bankId, 80);
    const domainId = entry?.domainId === undefined ? undefined : cleanString(entry.domainId, 8);
    const mode = cleanString(entry?.mode, 20);
    const answeredAt = cleanString(entry?.answeredAt, 40);
    const date = cleanString(entry?.date, 10);
    if (!id || !questionId || !sectionId || !BANK_IDS.has(bankId) || !ANSWER_MODES.has(mode)
      || (domainId && !DOMAIN_IDS.has(domainId)) || !isDateKey(date)
      || !Number.isFinite(Date.parse(answeredAt))) {
      throw new Error("答题记录字段无效");
    }
    answers.push({
      id,
      questionId,
      bankId,
      sectionId,
      domainId,
      response: sanitizeResponse(entry.response),
      correct: Boolean(entry.correct),
      answeredAt,
      durationSeconds: Math.min(toCount(entry.durationSeconds), 86_400),
      mode,
      date,
    });
  }
  return answers;
}

function randomWord() {
  return RECOVERY_WORDS[Math.floor(Math.random() * RECOVERY_WORDS.length)];
}

function generateRecoveryCode() {
  const digits = String(Math.floor(Math.random() * 900) + 100);
  return `${randomWord()}-${randomWord()}-${digits}-${randomWord()}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value) {
  if (typeof value !== "string" || !/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) {
    throw new Error("管理员凭据配置无效");
  }
  return new Uint8Array(value.match(/.{2}/g).map((pair) => Number.parseInt(pair, 16)));
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function passwordHash(password, saltHex, iterations = ADMIN_PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: hexToBytes(saltHex),
    iterations,
  }, key, 256);
  return bytesToHex(new Uint8Array(bits));
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function parseCookies(request) {
  const cookies = {};
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    cookies[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim());
  }
  return cookies;
}

function sessionCookie(token) {
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=${ADMIN_SESSION_SECONDS}`;
}

function clearSessionCookie() {
  return `${ADMIN_SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=0`;
}

function sanitizeAdminUsername(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 64)
    : "";
}

function validateNewAdminPassword(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128) {
    throw new Error("新密码需要 12 至 128 个字符");
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    throw new Error("新密码需要同时包含字母和数字");
  }
  return value;
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

async function authenticateProfile(config, body) {
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const recoveryCode = typeof body?.recoveryCode === "string" ? body.recoveryCode : "";
  if (!userId || !recoveryCode) return { response: jsonResponse(400, { error: "缺少身份信息" }) };
  const owner = await d1Query(config, "SELECT recovery_code FROM users WHERE user_id = ? LIMIT 1", [userId]);
  if (!owner.length || owner[0].recovery_code !== recoveryCode) {
    return { response: jsonResponse(403, { error: "身份校验失败" }) };
  }
  return { userId };
}

async function deleteUserData(config, userId) {
  await d1Query(config, "DELETE FROM answer_events WHERE user_id = ?", [userId]);
  await d1Query(config, "DELETE FROM domain_stats WHERE user_id = ?", [userId]);
  await d1Query(config, "DELETE FROM daily_stats WHERE user_id = ?", [userId]);
  await d1Query(config, "DELETE FROM users WHERE user_id = ?", [userId]);
}

async function deleteProfile(config, body) {
  const identity = await authenticateProfile(config, body);
  if (identity.response) return identity.response;
  // Delete owned rows first and the identity last. If an intermediate query fails,
  // the account remains authenticated so the user can safely retry cleanup.
  await deleteUserData(config, identity.userId);
  return jsonResponse(200, { ok: true });
}

async function adminLogin(config, body) {
  const username = sanitizeAdminUsername(body?.username);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password) return jsonResponse(400, { error: "请输入管理员账号和密码" });

  const rows = await d1Query(
    config,
    `SELECT admin_id, username, password_hash, password_salt, password_iterations,
            must_change_password, failed_attempts, locked_until, disabled
     FROM admins WHERE username = ? LIMIT 1`,
    [username],
  );
  const admin = rows[0];
  const now = new Date();
  if (admin?.locked_until && Date.parse(admin.locked_until) > now.getTime()) {
    return jsonResponse(429, { error: "登录失败次数过多，请 15 分钟后重试" });
  }

  const candidateHash = await passwordHash(
    password,
    admin?.password_salt || ADMIN_DUMMY_SALT,
    admin?.password_iterations || ADMIN_PASSWORD_ITERATIONS,
  );
  if (!admin || admin.disabled || !constantTimeEqual(candidateHash, admin?.password_hash || ADMIN_DUMMY_HASH)) {
    if (admin && !admin.disabled) {
      const attempts = Number(admin.failed_attempts || 0) + 1;
      const shouldLock = attempts >= ADMIN_MAX_FAILED_LOGINS;
      const lockedUntil = shouldLock
        ? new Date(now.getTime() + ADMIN_LOCK_MINUTES * 60_000).toISOString()
        : null;
      await d1Query(
        config,
        "UPDATE admins SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE admin_id = ?",
        [shouldLock ? 0 : attempts, lockedUntil, now.toISOString(), admin.admin_id],
      );
    }
    return jsonResponse(401, { error: "管理员账号或密码错误" });
  }

  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_SECONDS * 1000).toISOString();
  await d1Query(config, "DELETE FROM admin_sessions WHERE expires_at <= ?", [now.toISOString()]);
  await d1Query(
    config,
    `INSERT INTO admin_sessions
       (session_id, admin_id, token_hash, created_at, expires_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), admin.admin_id, tokenHash, now.toISOString(), expiresAt, now.toISOString()],
  );
  await d1Query(
    config,
    "UPDATE admins SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE admin_id = ?",
    [now.toISOString(), admin.admin_id],
  );
  return jsonResponse(200, {
    authenticated: true,
    username: admin.username,
    mustChangePassword: Boolean(admin.must_change_password),
  }, { "Set-Cookie": sessionCookie(token) });
}

async function authenticateAdmin(config, request, allowPasswordChange = false) {
  const token = parseCookies(request)[ADMIN_SESSION_COOKIE];
  if (!token) return { response: jsonResponse(401, { error: "管理员登录已失效，请重新登录" }) };
  const tokenHash = await sha256(token);
  const rows = await d1Query(
    config,
    `SELECT s.session_id, s.admin_id, s.expires_at, a.username, a.must_change_password, a.disabled
     FROM admin_sessions s JOIN admins a ON a.admin_id = s.admin_id
     WHERE s.token_hash = ? LIMIT 1`,
    [tokenHash],
  );
  const session = rows[0];
  if (!session || session.disabled || Date.parse(session.expires_at) <= Date.now()) {
    if (session?.session_id) {
      await d1Query(config, "DELETE FROM admin_sessions WHERE session_id = ?", [session.session_id]);
    }
    return { response: jsonResponse(401, { error: "管理员登录已失效，请重新登录" }, { "Set-Cookie": clearSessionCookie() }) };
  }
  if (session.must_change_password && !allowPasswordChange) {
    return { response: jsonResponse(403, { error: "首次登录必须先修改管理员密码", mustChangePassword: true }) };
  }
  await d1Query(config, "UPDATE admin_sessions SET last_used_at = ? WHERE session_id = ?", [
    new Date().toISOString(),
    session.session_id,
  ]);
  return {
    adminId: session.admin_id,
    username: session.username,
    mustChangePassword: Boolean(session.must_change_password),
    sessionId: session.session_id,
  };
}

async function adminSession(config, request) {
  const admin = await authenticateAdmin(config, request, true);
  if (admin.response) return admin.response;
  return jsonResponse(200, {
    authenticated: true,
    username: admin.username,
    mustChangePassword: admin.mustChangePassword,
  });
}

async function recordAdminAudit(config, values) {
  try {
    await d1Query(
      config,
      `INSERT INTO admin_audit_log
         (audit_id, admin_id, action, target_user_id, target_public_id, target_nickname, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        values.adminId,
        values.action,
        values.targetUserId ?? null,
        values.targetPublicId ?? null,
        values.targetNickname ?? null,
        values.createdAt,
      ],
    );
  } catch (error) {
    console.warn("Admin audit write failed", {
      action: values.action,
      targetUserId: values.targetUserId,
      message: error instanceof Error ? error.message : "unknown error",
    });
  }
}

async function changeAdminPassword(config, request, body) {
  const admin = await authenticateAdmin(config, request, true);
  if (admin.response) return admin.response;
  const newPassword = validateNewAdminPassword(body?.newPassword);
  const salt = randomToken(16);
  const hash = await passwordHash(newPassword, salt);
  const now = new Date().toISOString();
  await d1Query(
    config,
    `UPDATE admins SET password_hash = ?, password_salt = ?, password_iterations = ?,
       must_change_password = 0, failed_attempts = 0, locked_until = NULL, updated_at = ?
     WHERE admin_id = ?`,
    [hash, salt, ADMIN_PASSWORD_ITERATIONS, now, admin.adminId],
  );
  await d1Query(config, "DELETE FROM admin_sessions WHERE admin_id = ?", [admin.adminId]);
  await recordAdminAudit(config, {
    adminId: admin.adminId,
    action: "password_changed",
    createdAt: now,
  });
  return jsonResponse(200, {
    ok: true,
    message: "密码已更新，请使用新密码重新登录",
  }, { "Set-Cookie": clearSessionCookie() });
}

async function adminLogout(config, request) {
  const token = parseCookies(request)[ADMIN_SESSION_COOKIE];
  if (token) {
    await d1Query(config, "DELETE FROM admin_sessions WHERE token_hash = ?", [await sha256(token)]);
  }
  return jsonResponse(200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
}

function mapAdminUser(row) {
  return {
    userId: row.user_id,
    publicId: row.public_id,
    nickname: row.nickname,
    currentStreak: row.current_streak ?? 0,
    longestStreak: row.longest_streak ?? 0,
    totalAnswered: row.total_answered ?? 0,
    lastActiveDate: row.last_active_date ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function adminUsers(config, request, url) {
  const admin = await authenticateAdmin(config, request);
  if (admin.response) return admin.response;
  const query = cleanString(url.searchParams.get("q"), 60);
  const escaped = query.replace(/[\\%_]/g, "\\$&");
  const rows = query
    ? await d1Query(
      config,
      `SELECT user_id, public_id, nickname, current_streak, longest_streak,
              total_answered, last_active_date, created_at, updated_at
       FROM users
       WHERE nickname LIKE ? ESCAPE '\\' OR public_id LIKE ? ESCAPE '\\'
       ORDER BY updated_at DESC LIMIT 50`,
      [`%${escaped}%`, `%${escaped}%`],
    )
    : await d1Query(
      config,
      `SELECT user_id, public_id, nickname, current_streak, longest_streak,
              total_answered, last_active_date, created_at, updated_at
       FROM users ORDER BY updated_at DESC LIMIT 50`,
    );
  return jsonResponse(200, { users: rows.map(mapAdminUser) });
}

async function uniqueRecoveryCode(config) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const recoveryCode = generateRecoveryCode();
    const existing = await d1Query(config, "SELECT 1 FROM users WHERE recovery_code = ? LIMIT 1", [recoveryCode]);
    if (!existing.length) return recoveryCode;
  }
  throw new Error("暂时无法生成唯一恢复码，请重试");
}

async function adminResetRecoveryCode(config, request, body) {
  const admin = await authenticateAdmin(config, request);
  if (admin.response) return admin.response;
  const userId = cleanString(body?.userId, 64);
  if (!userId) return jsonResponse(400, { error: "缺少用户标识" });
  const users = await d1Query(
    config,
    "SELECT user_id, public_id, nickname FROM users WHERE user_id = ? LIMIT 1",
    [userId],
  );
  if (!users.length) return jsonResponse(404, { error: "账号不存在或已被删除" });
  const recoveryCode = await uniqueRecoveryCode(config);
  const now = new Date().toISOString();
  await d1Query(config, "UPDATE users SET recovery_code = ?, updated_at = ? WHERE user_id = ?", [
    recoveryCode,
    now,
    userId,
  ]);
  await recordAdminAudit(config, {
    adminId: admin.adminId,
    action: "recovery_code_reset",
    targetUserId: userId,
    targetPublicId: users[0].public_id,
    targetNickname: users[0].nickname,
    createdAt: now,
  });
  return jsonResponse(200, {
    recoveryCode,
    user: {
      publicId: users[0].public_id,
      nickname: users[0].nickname,
    },
  });
}

async function adminDeleteUser(config, request, body) {
  const admin = await authenticateAdmin(config, request);
  if (admin.response) return admin.response;
  const userId = cleanString(body?.userId, 64);
  if (!userId) return jsonResponse(400, { error: "缺少用户标识" });
  const users = await d1Query(
    config,
    "SELECT user_id, public_id, nickname FROM users WHERE user_id = ? LIMIT 1",
    [userId],
  );
  if (!users.length) return jsonResponse(404, { error: "账号不存在或已被删除" });
  const user = users[0];
  const now = new Date().toISOString();
  await deleteUserData(config, userId);
  await recordAdminAudit(config, {
    adminId: admin.adminId,
    action: "user_deleted",
    targetUserId: userId,
    targetPublicId: user.public_id,
    targetNickname: user.nickname,
    createdAt: now,
  });
  return jsonResponse(200, { ok: true });
}

async function mergeAnswerAggregates(config, userId) {
  const eventDays = await d1Query(
    config,
    `SELECT date, COUNT(*) AS count, SUM(correct) AS correct_count
     FROM answer_events WHERE user_id = ? GROUP BY date`,
    [userId],
  );
  for (const group of d1Chunk(eventDays, 4)) {
    const placeholders = group.map(() => "(?, ?, ?, ?)").join(", ");
    const params = group.flatMap((day) => [userId, day.date, day.count ?? 0, day.correct_count ?? 0]);
    await d1Query(
      config,
      `INSERT INTO daily_stats (user_id, date, count, correct_count) VALUES ${placeholders}
       ON CONFLICT(user_id, date) DO UPDATE SET
         count = MAX(daily_stats.count, excluded.count),
         correct_count = MAX(daily_stats.correct_count, excluded.correct_count)`,
      params,
    );
  }

  const eventDomains = await d1Query(
    config,
    `SELECT date, domain_id, COUNT(*) AS count, SUM(correct) AS correct_count
     FROM answer_events WHERE user_id = ? AND domain_id IS NOT NULL
     GROUP BY date, domain_id`,
    [userId],
  );
  for (const group of d1Chunk(eventDomains, 5)) {
    const placeholders = group.map(() => "(?, ?, ?, ?, ?)").join(", ");
    const params = group.flatMap((domain) => [
      userId,
      domain.date,
      domain.domain_id,
      domain.count ?? 0,
      domain.correct_count ?? 0,
    ]);
    await d1Query(
      config,
      `INSERT INTO domain_stats (user_id, date, domain_id, count, correct_count) VALUES ${placeholders}
       ON CONFLICT(user_id, date, domain_id) DO UPDATE SET
         count = MAX(domain_stats.count, excluded.count),
         correct_count = MAX(domain_stats.correct_count, excluded.correct_count)`,
      params,
    );
  }
}

async function syncProgress(config, body) {
  const identity = await authenticateProfile(config, body);
  if (identity.response) return identity.response;
  const { userId } = identity;

  const days = sanitizeDays(body?.days);
  const answers = sanitizeAnswers(body?.answers);

  for (const group of d1Chunk(answers, 12)) {
    const placeholders = group.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const params = group.flatMap((answer) => [
      userId,
      answer.id,
      answer.questionId,
      answer.bankId,
      answer.sectionId,
      answer.domainId ?? null,
      JSON.stringify(answer.response),
      answer.correct ? 1 : 0,
      answer.answeredAt,
      answer.durationSeconds,
      answer.mode,
      answer.date,
    ]);
    await d1Query(
      config,
      `INSERT INTO answer_events
         (user_id, answer_id, question_id, bank_id, section_id, domain_id, response_json,
          correct, answered_at, duration_seconds, mode, date)
       VALUES ${placeholders}
       ON CONFLICT(user_id, answer_id) DO NOTHING`,
      params,
    );
  }

  for (const group of d1Chunk(days, 4)) {
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

  if (answers.length) await mergeAnswerAggregates(config, userId);

  const domainRows = days.flatMap((day) => day.domains.map((domain) => [userId, day.date, domain.domainId, domain.count, domain.correct]));
  for (const group of d1Chunk(domainRows, 5)) {
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

async function restoreProgress(config, body) {
  const identity = await authenticateProfile(config, body);
  if (identity.response) return identity.response;
  const rows = await d1Query(
    config,
    `SELECT answer_id, question_id, bank_id, section_id, domain_id, response_json,
            correct, answered_at, duration_seconds, mode
     FROM answer_events WHERE user_id = ? ORDER BY answered_at ASC`,
    [identity.userId],
  );
  const answers = rows.map((row) => ({
    id: row.answer_id,
    questionId: row.question_id,
    bankId: row.bank_id,
    sectionId: row.section_id,
    ...(row.domain_id ? { domainId: row.domain_id } : {}),
    response: JSON.parse(row.response_json),
    correct: Boolean(row.correct),
    answeredAt: row.answered_at,
    durationSeconds: row.duration_seconds ?? 0,
    mode: row.mode,
  }));
  return jsonResponse(200, { answers });
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
  const isAdminRoute = url.pathname === "/api/admin" || url.pathname.startsWith("/api/admin/");
  const route = url.pathname.replace(isAdminRoute ? /^\/api\/admin/ : /^\/api\/community/, "") || "/";
  const config = d1Config(env);

  if (!isAdminRoute && request.method === "GET" && route === "/health") {
    return jsonResponse(200, { ok: true, configured: Boolean(config) });
  }
  if (!config) return jsonResponse(503, { error: "排行榜服务尚未配置，请在 Sites 托管环境设置 CF_ACCOUNT_ID / CF_D1_DATABASE_ID / CF_D1_API_TOKEN" });

  try {
    if (isAdminRoute) {
      if (request.method === "POST" && route === "/login") return await adminLogin(config, await parseBody(request));
      if (request.method === "GET" && route === "/session") return await adminSession(config, request);
      if (request.method === "POST" && route === "/password") {
        return await changeAdminPassword(config, request, await parseBody(request));
      }
      if (request.method === "POST" && route === "/logout") return await adminLogout(config, request);
      if (request.method === "GET" && route === "/users") return await adminUsers(config, request, url);
      if (request.method === "POST" && route === "/recovery-code/reset") {
        return await adminResetRecoveryCode(config, request, await parseBody(request));
      }
      if (request.method === "DELETE" && route === "/user") {
        return await adminDeleteUser(config, request, await parseBody(request));
      }
      return jsonResponse(404, { error: "Not found" });
    }
    if (request.method === "POST" && route === "/profile") return await createProfile(config, await parseBody(request));
    if (request.method === "DELETE" && route === "/profile") return await deleteProfile(config, await parseBody(request));
    if (request.method === "POST" && route === "/restore") return await restoreProfile(config, await parseBody(request));
    if (request.method === "POST" && route === "/progress") return await syncProgress(config, await parseBody(request));
    if (request.method === "POST" && route === "/progress/restore") return await restoreProgress(config, await parseBody(request));
    if (request.method === "GET" && route === "/leaderboard") return await leaderboard(config, url);
    if (request.method === "GET" && route === "/leaderboard/domain") return await domainLeaderboard(config, url);
    if (request.method === "GET" && route === "/user") return await userStats(config, url);
    return jsonResponse(404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "排行榜请求失败";
    return jsonResponse(502, { error: message });
  }
}

export const __test__ = {
  computeStreaks,
  sanitizeAnswers,
  sanitizeDays,
  sanitizeNickname,
  generateRecoveryCode,
  passwordHash,
};
