-- Epic Board Games — initial schema (Cloudflare D1 / SQLite).
-- All timestamps are Unix epoch milliseconds.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,                -- random UUID
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  avatar        TEXT NOT NULL DEFAULT '🙂',
  password_hash TEXT NOT NULL,                   -- base64 PBKDF2-SHA256 output
  password_salt TEXT NOT NULL,                   -- base64 16-byte salt
  password_iterations INTEGER NOT NULL,          -- allows raising the cost later
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  last_login_at INTEGER,
  disabled      INTEGER NOT NULL DEFAULT 0
);

-- Only the SHA-256 of the session token is stored; a DB leak cannot be replayed.
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,                   -- hex SHA-256(token)
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE friendships (
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'blocked')),
  relation     TEXT NOT NULL DEFAULT 'friend' CHECK (relation IN ('friend', 'family')),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id, status);
-- One relationship per unordered pair, regardless of who asked first.
CREATE UNIQUE INDEX idx_friendships_pair ON friendships(
  MIN(requester_id, addressee_id), MAX(requester_id, addressee_id)
);

CREATE TABLE notifications (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('friend_request', 'friend_accepted', 'game_ping')),
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id      TEXT,
  room_id      TEXT,
  created_at   INTEGER NOT NULL,
  read         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at DESC);

CREATE TABLE game_sessions (
  id             TEXT PRIMARY KEY,               -- '<GameRoom id>:<round>' (rematches add rounds)
  room_id        TEXT NOT NULL,                  -- GameRoom Durable Object id
  game_id        TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('playing', 'finished', 'abandoned')),
  mode           TEXT NOT NULL CHECK (mode IN ('matchmaking', 'ai', 'private')),
  has_ai_players INTEGER NOT NULL DEFAULT 0,     -- AI games are excluded from ranked leaderboards
  started_at     INTEGER NOT NULL,
  ended_at       INTEGER,
  winner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  winner_seat    INTEGER,
  rng_seed       INTEGER,                        -- with move_log, lets disputes replay the game exactly
  move_log       TEXT                            -- JSON [[seat, move], ...], written when the game ends
);
CREATE INDEX idx_game_sessions_game ON game_sessions(game_id, ended_at DESC);
CREATE INDEX idx_game_sessions_room ON game_sessions(room_id);

CREATE TABLE game_players (
  game_session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  seat            INTEGER NOT NULL,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,   -- NULL for AI seats
  is_ai           INTEGER NOT NULL DEFAULT 0,
  ai_difficulty   TEXT CHECK (ai_difficulty IN ('easy', 'medium', 'hard', 'impossible')),
  ai_persona      TEXT CHECK (ai_persona IN ('buddy', 'nova', 'titan', 'oracle')),
  result          TEXT CHECK (result IN ('win', 'loss', 'draw', 'forfeit')),
  PRIMARY KEY (game_session_id, seat)
);
CREATE INDEX idx_game_players_user ON game_players(user_id);

CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  event      TEXT NOT NULL,                      -- signup, login_success, login_failure, logout, profile_update, ...
  ip         TEXT,
  user_agent TEXT,
  detail     TEXT,                               -- small JSON blob, never secrets
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_event ON audit_log(event, created_at DESC);
