-- Additive and repeatable. Never claims legacy orders based on email.
CREATE TABLE IF NOT EXISTS members (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL COLLATE NOCASE UNIQUE,
 password_hash TEXT NOT NULL,
 name TEXT NOT NULL,
 birthday TEXT NOT NULL,
 country TEXT NOT NULL,
 phone TEXT NOT NULL DEFAULT '',
 address TEXT NOT NULL DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS member_sessions (
 token_hash TEXT PRIMARY KEY,
 member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS member_sessions_member ON member_sessions(member_id);
CREATE INDEX IF NOT EXISTS member_sessions_expiry ON member_sessions(expires_at);
CREATE TABLE IF NOT EXISTS member_orders (
 order_number TEXT PRIMARY KEY,
 member_id TEXT NOT NULL REFERENCES members(id),
 shipping_country TEXT NOT NULL,
 request_key TEXT NOT NULL,
 UNIQUE(member_id, request_key)
);
CREATE INDEX IF NOT EXISTS member_orders_member ON member_orders(member_id, order_number);
CREATE TABLE IF NOT EXISTS member_rate_limits (
 key TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS member_rate_limits_expiry ON member_rate_limits(expires_at);

CREATE TABLE IF NOT EXISTS member_email_verified (
 member_id TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
 verified_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS member_email_tokens (
 token_hash TEXT PRIMARY KEY,
 member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),
 password_snapshot TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 consumed_by TEXT
);
CREATE INDEX IF NOT EXISTS member_email_tokens_member ON member_email_tokens(member_id);
CREATE INDEX IF NOT EXISTS member_email_tokens_expiry ON member_email_tokens(expires_at);
