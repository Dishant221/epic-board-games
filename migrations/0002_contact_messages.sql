-- Contact form submissions (read by the team; purged after 180 days by the nightly job).

CREATE TABLE contact_messages (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  topic      TEXT NOT NULL CHECK (topic IN ('bug', 'feature', 'account', 'privacy', 'business', 'other')),
  message    TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  handled_at INTEGER
);
CREATE INDEX idx_contact_created ON contact_messages(created_at DESC);
