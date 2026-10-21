export const SCHEMA = `
CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  contact_email TEXT,
  contact_phone TEXT,
  webhook_url TEXT,
  webhook_secret TEXT,
  branding TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_receiving_accounts (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  upi_id TEXT NOT NULL,
  payee_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  is_slot_busy INTEGER NOT NULL DEFAULT 0 CHECK (is_slot_busy IN (0, 1)),
  current_active_session_id TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_receiving_account
  ON payment_receiving_accounts(merchant_id)
  WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  mobile_number TEXT UNIQUE,
  otp_code TEXT,
  otp_expires_at TEXT,
  otp_attempts INTEGER NOT NULL DEFAULT 0,
  is_phone_verified INTEGER NOT NULL DEFAULT 0 CHECK (is_phone_verified IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  ban_reason TEXT,
  banned_at TEXT,
  unbanned_at TEXT,
  last_device TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_sessions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  token_digest TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_session_token_active
  ON customer_sessions(token_digest, is_active);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  public_key TEXT,
  fingerprint_hash TEXT,
  user_agent TEXT,
  platform TEXT,
  browser TEXT,
  timezone TEXT,
  language TEXT,
  screen_signature TEXT,
  device_token_digest TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS payment_sessions (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  customer_id TEXT REFERENCES customers(id),
  receiving_account_id TEXT REFERENCES payment_receiving_accounts(id),
  order_id TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  method TEXT NOT NULL DEFAULT 'UPI' CHECK (method IN ('UPI', 'COD', 'CASH_COUNTER', 'CARD_COUNTER')),
  status TEXT NOT NULL DEFAULT 'INITIATED' CHECK (status IN (
    'INITIATED', 'QUEUED', 'ACTIVE', 'PROCESSING', 'SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED', 'SUSPICIOUS'
  )),
  queue_position INTEGER NOT NULL DEFAULT 0,
  slot_acquired_at TEXT,
  expires_at TEXT,
  processing_started_at TEXT,
  processing_expires_at TEXT,
  completed_at TEXT,
  return_url TEXT,
  attributed_observation_id TEXT,
  idempotency_key TEXT,
  device_id TEXT REFERENCES devices(id),
  verification_level INTEGER NOT NULL DEFAULT 0,
  verification_sources TEXT NOT NULL DEFAULT '[]',
  verification_tag TEXT NOT NULL DEFAULT 'UNVERIFIED',
  vpa_snapshot TEXT,
  payee_snapshot TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_open_order
  ON payment_sessions(merchant_id, order_id)
  WHERE status NOT IN ('FAILED', 'EXPIRED', 'CANCELLED');

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_one_slot
  ON payment_sessions(receiving_account_id)
  WHERE status IN ('ACTIVE', 'PROCESSING') AND receiving_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_session_account_status
  ON payment_sessions(receiving_account_id, status);

CREATE INDEX IF NOT EXISTS idx_session_device
  ON payment_sessions(device_id);

CREATE INDEX IF NOT EXISTS idx_session_merchant_order_created
  ON payment_sessions(merchant_id, order_id, created_at);

CREATE INDEX IF NOT EXISTS idx_session_idempotency
  ON payment_sessions(merchant_id, idempotency_key);

CREATE TABLE IF NOT EXISTS payment_observations (
  id TEXT PRIMARY KEY,
  receiving_account_id TEXT NOT NULL REFERENCES payment_receiving_accounts(id),
  source TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  observed_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  sender_vpa TEXT,
  bank_reference_number TEXT,
  fingerprint_hash TEXT NOT NULL,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  attribution_status TEXT NOT NULL DEFAULT 'UNATTRIBUTED',
  attributed_payment_id TEXT REFERENCES payment_sessions(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_obs_account_amount_attr
  ON payment_observations(receiving_account_id, amount_paise, attribution_status);

CREATE INDEX IF NOT EXISTS idx_obs_bank_ref
  ON payment_observations(bank_reference_number);

CREATE INDEX IF NOT EXISTS idx_obs_fingerprint
  ON payment_observations(fingerprint_hash);

CREATE INDEX IF NOT EXISTS idx_obs_attributed_payment
  ON payment_observations(attributed_payment_id);

CREATE TABLE IF NOT EXISTS android_devices (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  device_name TEXT,
  device_model TEXT,
  signing_key_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_heartbeat_at TEXT,
  last_observation_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  payment_id TEXT NOT NULL REFERENCES payment_sessions(id),
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  endpoint_url TEXT,
  response_status INTEGER,
  response_body TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  is_successful INTEGER NOT NULL DEFAULT 0 CHECK (is_successful IN (0, 1)),
  next_retry_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_success_retry
  ON webhook_deliveries(is_successful, next_retry_at);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  customer_id TEXT REFERENCES customers(id),
  payment_id TEXT REFERENCES payment_sessions(id),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('CUSTOMER', 'ADMIN')),
  sender_id TEXT,
  message TEXT NOT NULL,
  attachments TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  merchant_id TEXT REFERENCES merchants(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  actor_type TEXT,
  actor_id TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  ip_address TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  merchant_id TEXT REFERENCES merchants(id),
  customer_id TEXT REFERENCES customers(id),
  payment_session_id TEXT REFERENCES payment_sessions(id),
  event_type TEXT NOT NULL,
  source TEXT,
  sender TEXT,
  device_info TEXT,
  raw_message TEXT,
  normalized_message TEXT,
  extracted_amount INTEGER,
  extracted_reference TEXT,
  fraud_reason TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
`;
