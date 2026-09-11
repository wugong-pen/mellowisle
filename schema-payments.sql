CREATE TABLE IF NOT EXISTS payment_attempts (
 order_number TEXT PRIMARY KEY,
 provider TEXT NOT NULL CHECK(provider IN ('bank','linepay','paypal')),
 state TEXT NOT NULL,
 provider_id TEXT,
 redirect_url TEXT,
 bank_details TEXT,
 due_at TEXT,
 remittance_last5 TEXT,
 remittance_date TEXT,
 reported_at TEXT,
 UNIQUE(provider,provider_id)
);
