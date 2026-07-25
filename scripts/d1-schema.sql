-- SALINGO 排行榜 / 多用户后端的 Cloudflare D1 表结构。
-- 在 Cloudflare D1 控制台执行一次即可。

CREATE TABLE IF NOT EXISTS users (
  user_id          TEXT PRIMARY KEY,
  public_id        TEXT NOT NULL UNIQUE,
  recovery_code    TEXT NOT NULL UNIQUE,
  nickname         TEXT NOT NULL,
  current_streak   INTEGER NOT NULL DEFAULT 0,
  longest_streak   INTEGER NOT NULL DEFAULT 0,
  today_count      INTEGER NOT NULL DEFAULT 0,
  today_date       TEXT,
  total_answered   INTEGER NOT NULL DEFAULT 0,
  last_active_date TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_stats (
  user_id       TEXT NOT NULL,
  date          TEXT NOT NULL,
  count         INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS domain_stats (
  user_id       TEXT NOT NULL,
  date          TEXT NOT NULL,
  domain_id     TEXT NOT NULL,
  count         INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date, domain_id)
);

CREATE TABLE IF NOT EXISTS answer_events (
  user_id          TEXT NOT NULL,
  answer_id        TEXT NOT NULL,
  question_id      TEXT NOT NULL,
  bank_id          TEXT NOT NULL,
  section_id       TEXT NOT NULL,
  domain_id        TEXT,
  response_json    TEXT NOT NULL,
  correct          INTEGER NOT NULL,
  answered_at      TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  mode             TEXT NOT NULL,
  date             TEXT NOT NULL,
  PRIMARY KEY (user_id, answer_id)
);

CREATE INDEX IF NOT EXISTS idx_users_streak ON users (current_streak DESC);
CREATE INDEX IF NOT EXISTS idx_daily_user ON daily_stats (user_id, date);
CREATE INDEX IF NOT EXISTS idx_domain_lookup ON domain_stats (domain_id, user_id);
CREATE INDEX IF NOT EXISTS idx_answer_events_user_date ON answer_events (user_id, date, answered_at);

CREATE TABLE IF NOT EXISTS admins (
  admin_id             TEXT PRIMARY KEY,
  username             TEXT NOT NULL UNIQUE,
  password_hash        TEXT NOT NULL,
  password_salt        TEXT NOT NULL,
  password_iterations  INTEGER NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  failed_attempts      INTEGER NOT NULL DEFAULT 0,
  locked_until         TEXT,
  disabled             INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  session_id   TEXT PRIMARY KEY,
  admin_id     TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  audit_id         TEXT PRIMARY KEY,
  admin_id         TEXT NOT NULL,
  action           TEXT NOT NULL,
  target_user_id   TEXT,
  target_public_id TEXT,
  target_nickname  TEXT,
  created_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log (created_at DESC);

INSERT OR IGNORE INTO admins (
  admin_id, username, password_hash, password_salt, password_iterations,
  must_change_password, created_at, updated_at
) VALUES (
  'primary-admin',
  'salingo-admin',
  '1469d32a5d1ccdee53d98d95a9455fca40f5e83c0705fff602242ff324bc5c63',
  '8214df6c5cba92bc1b8dadea8c311288',
  210000,
  1,
  '2026-07-25T00:00:00.000Z',
  '2026-07-25T00:00:00.000Z'
);
