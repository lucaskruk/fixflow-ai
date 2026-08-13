PRAGMA foreign_keys = ON;

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK (length(token_hash) = 43),
  username TEXT NOT NULL CHECK (length(trim(username)) > 0),
  csrf_token TEXT NOT NULL CHECK (length(csrf_token) = 43),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  absolute_expires_at INTEGER NOT NULL,
  CHECK (last_seen_at >= created_at),
  CHECK (absolute_expires_at > created_at)
);

CREATE INDEX auth_sessions_expiration_idx
  ON auth_sessions(absolute_expires_at, last_seen_at);

CREATE TABLE auth_login_attempts (
  scope TEXT NOT NULL CHECK (scope IN ('ip', 'username')),
  identifier_hash TEXT NOT NULL CHECK (length(identifier_hash) = 43),
  window_started_at INTEGER NOT NULL,
  failure_count INTEGER NOT NULL CHECK (failure_count > 0),
  blocked_until INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, identifier_hash)
);

CREATE INDEX auth_login_attempts_cleanup_idx
  ON auth_login_attempts(window_started_at, blocked_until);
