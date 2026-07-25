CREATE TABLE IF NOT EXISTS admins (
  admin_id            TEXT PRIMARY KEY,
  username            TEXT NOT NULL UNIQUE,
  password_hash       TEXT NOT NULL,
  password_salt       TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  failed_attempts     INTEGER NOT NULL DEFAULT 0,
  locked_until        TEXT,
  disabled            INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
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

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry
  ON admin_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created
  ON admin_audit_log (created_at DESC);

INSERT OR IGNORE INTO admins (
  admin_id,
  username,
  password_hash,
  password_salt,
  password_iterations,
  must_change_password,
  created_at,
  updated_at
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
