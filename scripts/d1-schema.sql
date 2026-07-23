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

CREATE INDEX IF NOT EXISTS idx_users_streak ON users (current_streak DESC);
CREATE INDEX IF NOT EXISTS idx_daily_user ON daily_stats (user_id, date);
CREATE INDEX IF NOT EXISTS idx_domain_lookup ON domain_stats (domain_id, user_id);
