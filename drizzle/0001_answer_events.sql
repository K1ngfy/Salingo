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

CREATE INDEX IF NOT EXISTS idx_answer_events_user_date
  ON answer_events (user_id, date, answered_at);
