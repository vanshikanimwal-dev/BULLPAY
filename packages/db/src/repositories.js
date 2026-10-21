/** @type {Record<string, string[]>} */
const TABLES = {
  merchants: [
    "id", "business_name", "slug", "contact_email", "contact_phone", "webhook_url",
    "webhook_secret", "branding", "created_at", "updated_at",
  ],
  payment_receiving_accounts: [
    "id", "merchant_id", "upi_id", "payee_name", "is_active", "is_slot_busy", "current_active_session_id",
  ],
  customers: [
    "id", "name", "email", "mobile_number", "otp_code", "otp_expires_at", "otp_attempts",
    "is_phone_verified", "status", "ban_reason", "banned_at", "unbanned_at", "last_device",
    "last_login_at", "created_at", "updated_at",
  ],
  customer_sessions: [
    "id", "customer_id", "token_digest", "expires_at", "is_active", "ip_address", "user_agent",
    "created_at", "updated_at",
  ],
  devices: [
    "id", "customer_id", "public_key", "fingerprint_hash", "user_agent", "platform", "browser",
    "timezone", "language", "screen_signature", "device_token_digest", "status", "created_at", "last_seen_at",
  ],
  payment_sessions: [
    "id", "merchant_id", "customer_id", "receiving_account_id", "order_id", "amount_paise", "currency",
    "method", "status", "queue_position", "slot_acquired_at", "expires_at", "processing_started_at",
    "processing_expires_at", "completed_at", "return_url", "attributed_observation_id", "idempotency_key",
    "device_id", "verification_level", "verification_sources", "verification_tag", "vpa_snapshot",
    "payee_snapshot", "metadata", "created_at", "updated_at",
  ],
  payment_observations: [
    "id", "receiving_account_id", "source", "amount_paise", "observed_at", "ingested_at", "sender_vpa",
    "bank_reference_number", "fingerprint_hash", "raw_payload", "attribution_status", "attributed_payment_id",
    "created_at",
  ],
  android_devices: [
    "id", "merchant_id", "device_name", "device_model", "signing_key_hash", "is_active",
    "last_heartbeat_at", "last_observation_at", "created_at",
  ],
  webhook_deliveries: [
    "id", "merchant_id", "payment_id", "event_type", "payload", "endpoint_url", "response_status",
    "response_body", "attempt_count", "is_successful", "next_retry_at", "created_at",
  ],
  support_tickets: [
    "id", "merchant_id", "customer_id", "payment_id", "subject", "status", "created_at", "updated_at",
  ],
  ticket_messages: [
    "id", "ticket_id", "sender_type", "sender_id", "message", "attachments", "created_at",
  ],
  audit_logs: [
    "id", "merchant_id", "entity_type", "entity_id", "action", "actor_type", "actor_id", "details",
    "ip_address", "created_at",
  ],
  security_events: [
    "id", "merchant_id", "customer_id", "payment_session_id", "event_type", "source", "sender",
    "device_info", "raw_message", "normalized_message", "extracted_amount", "extracted_reference",
    "fraud_reason", "metadata", "created_at",
  ],
};

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} sql
 * @param {unknown[]} params
 */
function get(db, sql, params) {
  return db.prepare(sql).get(...params);
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} sql
 * @param {unknown[]} params
 */
function all(db, sql, params) {
  return db.prepare(sql).all(...params);
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} sql
 * @param {unknown[]} params
 */
function count(db, sql, params) {
  const row = db.prepare(sql).get(...params);
  return Number(row?.n ?? 0);
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} table
 * @param {Record<string, unknown>} row
 */
function insertRow(db, table, row) {
  const columns = TABLES[table];
  const keys = columns.filter((key) => row[key] !== undefined);
  const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`;
  db.prepare(sql).run(...keys.map((key) => row[key]));
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} table
 * @param {string} id
 * @param {Record<string, unknown>} fields
 */
function updateRow(db, table, id, fields) {
  const allowed = new Set(TABLES[table]);
  const keys = Object.keys(fields).filter((key) => fields[key] !== undefined);
  for (const key of keys) {
    if (!allowed.has(key)) throw new Error(`Unknown column ${table}.${key}`);
  }
  if (!keys.length) return;
  const sql = `UPDATE ${table} SET ${keys.map((key) => `${key} = ?`).join(", ")} WHERE id = ?`;
  db.prepare(sql).run(...keys.map((key) => fields[key]), id);
}

const OPEN_ORDER = `status NOT IN ('FAILED', 'EXPIRED', 'CANCELLED')`;

/**
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function createRepositories(db) {
  return {
    merchants: {
      /** @param {string} id */
      getById(id) {
        return get(db, "SELECT * FROM merchants WHERE id = ?", [id]);
      },
      /** @param {string} slug */
      getBySlug(slug) {
        return get(db, "SELECT * FROM merchants WHERE slug = ?", [slug]);
      },
      /** @param {Record<string, unknown>} row */
      insert(row) {
        insertRow(db, "merchants", row);
      },
      /** @param {string} id @param {Record<string, unknown>} fields */
      update(id, fields) {
        updateRow(db, "merchants", id, fields);
      },
    },
    accounts: {
      /** @param {string} id */
      getById(id) {
        return get(db, "SELECT * FROM payment_receiving_accounts WHERE id = ?", [id]);
      },
      /** @param {string} merchantId */
      getActiveByMerchant(merchantId) {
        return get(
          db,
          "SELECT * FROM payment_receiving_accounts WHERE merchant_id = ? AND is_active = 1",
          [merchantId],
        );
      },
      /** @param {string} upiId */
      listActiveByUpi(upiId) {
        return all(
          db,
          "SELECT * FROM payment_receiving_accounts WHERE upi_id = ? AND is_active = 1",
          [upiId],
        );
      },
      /** @param {Record<string, unknown>} row */
      insert(row) {
        insertRow(db, "payment_receiving_accounts", row);
      },
      /** @param {string} id @param {Record<string, unknown>} fields */
      update(id, fields) {
        updateRow(db, "payment_receiving_accounts", id, fields);
      },
      /** @param {string} id @param {string} sessionId */
      markBusy(id, sessionId) {
        db.prepare(
          "UPDATE payment_receiving_accounts SET is_slot_busy = 1, current_active_session_id = ? WHERE id = ?",
        ).run(sessionId, id);
      },
      /** @param {string} id */
      clearBusy(id) {
        db.prepare(
          "UPDATE payment_receiving_accounts SET is_slot_busy = 0, current_active_session_id = NULL WHERE id = ?",
        ).run(id);
      },
    },
    customers: {
      /** @param {string} id */
      getById(id) {
        return get(db, "SELECT * FROM customers WHERE id = ?", [id]);
      },
      /** @param {string} mobile */
      getByMobile(mobile) {
        return get(db, "SELECT * FROM customers WHERE mobile_number = ?", [mobile]);
      },
      /** @param {string} email */
      getByEmail(email) {
        return get(db, "SELECT * FROM customers WHERE email = ?", [email]);
      },
      /** @param {number} [limit] */
      list(limit = 100) {
        return all(db, "SELECT * FROM customers ORDER BY created_at DESC LIMIT ?", [limit]);
      },
      /** @param {Record<string, unknown>} row */
      insert(row) {
        insertRow(db, "customers", row);
      },
      /** @param {string} id @param {Record<string, unknown>} fields */
      update(id, fields) {
        updateRow(db, "customers", id, fields);
      },
    },
    customerSessions: {
      /** @param {Record<string, unknown>} row */
      insert(row) {
        insertRow(db, "customer_sessions", row);
      },
      /** @param {string} digest */
      getByDigest(digest) {
        return get(db, "SELECT * FROM customer_sessions WHERE token_digest = ?", [digest]);
      },
      getActiveByDigest(digest) {
        return get(
          db,
          "SELECT * FROM customer_sessions WHERE token_digest = ? AND is_active = 1",
          [digest],
        );
      },
      /** @param {string} id @param {string} updatedAt */
      revoke(id, updatedAt) {
        db.prepare("UPDATE customer_sessions SET is_active = 0, updated_at = ? WHERE id = ?").run(updatedAt, id);
      },
      /** @param {string} customerId @param {string} updatedAt */
      revokeAllForCustomer(customerId, updatedAt) {
        db.prepare(
          "UPDATE customer_sessions SET is_active = 0, updated_at = ? WHERE customer_id = ? AND is_active = 1",
        ).run(updatedAt, customerId);
      },
    },
    devices: {
      /** @param {Record<string, unknown>} row */
      insert(row) {
        insertRow(db, "devices", row);
      },
      /** @param {string} id */
      getById(id) {
        return get(db, "SELECT * FROM devices WHERE id = ?", [id]);
      },
      /** @param {string} id @param {Record<string, unknown>} fields */
      update(id, fields) {
        updateRow(db, "devices", id, fields);
      },
    },
    sessions: {
      /** @param {Record<string, unknown>} row */
      insert(row) {
        insertRow(db, "payment_sessions", row);
      },
      /** @param {string} id */
      getById(id) {
        return get(db, "SELECT * FROM payment_sessions WHERE id = ?", [id]);
      },
      /** @param {string} id @param {Record<string, unknown>} fields */
      update(id, fields) {
        updateRow(db, "payment_sessions", id, fields);
      },
      /** @param {string} merchantId @param {string} key */
      findReusableByIdempotency(merchantId, key) {
        return get(
          db,
          `SELECT * FROM payment_sessions WHERE merchant_id = ? AND idempotency_key = ? AND ${OPEN_ORDER} ORDER BY created_at DESC LIMIT 1`,
          [merchantId, key],
        );
      },
      /** @param {string} merchantId @param {string} orderId */
      findOpenByOrder(merchantId, orderId) {
        return get(
          db,
          `SELECT * FROM payment_sessions WHERE merchant_id = ? AND order_id = ? AND ${OPEN_ORDER} ORDER BY created_at DESC LIMIT 1`,
          [merchantId, orderId],
        );
      },
      /** @param {string} accountId */
      findSlotHolder(accountId) {
        return get(
          db,
          "SELECT * FROM payment_sessions WHERE receiving_account_id = ? AND status IN ('ACTIVE', 'PROCESSING') LIMIT 1",
          [accountId],
        );
      },
      /** @param {string} accountId @param {number} amountPaise */
      listDifferentAmountHolders(accountId, amountPaise) {
        return all(
          db,
          "SELECT * FROM payment_sessions WHERE receiving_account_id = ? AND status IN ('ACTIVE', 'PROCESSING') AND amount_paise != ?",
          [accountId, amountPaise],
        );
      },
      /** @param {string} accountId @param {number} amountPaise */
      findEligibleByAmount(accountId, amountPaise) {
        return get(
          db,
          "SELECT * FROM payment_sessions WHERE receiving_account_id = ? AND status IN ('ACTIVE', 'PROCESSING') AND amount_paise = ? LIMIT 1",
          [accountId, amountPaise],
        );
      },
      /** @param {string} accountId */
      maxQueuePosition(accountId) {
        return count(
          db,
          "SELECT COALESCE(MAX(queue_position), 0) AS n FROM payment_sessions WHERE receiving_account_id = ? AND status = 'QUEUED'",
          [accountId],
        );
      },
      /** @param {string} accountId */
      oldestQueued(accountId) {
        return get(
          db,
          "SELECT * FROM payment_sessions WHERE receiving_account_id = ? AND status = 'QUEUED' ORDER BY queue_position ASC, created_at ASC LIMIT 1",
          [accountId],
        );
      },
      /** @param {string} accountId @param {number} position */
      countQueuedAhead(accountId, position) {
        return count(
          db,
          "SELECT COUNT(*) AS n FROM payment_sessions WHERE receiving_account_id = ? AND status = 'QUEUED' AND queue_position < ?",
          [accountId, position],
        );
      },
      /** @param {string} nowIso */
      listExpiredActive(nowIso) {
        return all(
          db,
          "SELECT id FROM payment_sessions WHERE status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at <= ?",
          [nowIso],
        );
      },
      /** @param {string} nowIso */
      listExpiredProcessing(nowIso) {
        return all(
          db,
          "SELECT id FROM payment_sessions WHERE status = 'PROCESSING' AND processing_expires_at IS NOT NULL AND processing_expires_at <= ?",
          [nowIso],
        );
      },
      /**
       * @param {string} accountId
       * @param {number} amountPaise
       * @param {string} sinceIso
       */
      findRecentTerminal(accountId, amountPaise, sinceIso) {
        return get(
          db,
          `SELECT * FROM payment_sessions
           WHERE receiving_account_id = ? AND amount_paise = ? AND status IN ('FAILED', 'EXPIRED') AND updated_at >= ?
           ORDER BY updated_at DESC LIMIT 1`,
          [accountId, amountPaise, sinceIso],
        );
      },
      /** @param {string} merchantId @param {number} [limit] */
      listByMerchant(merchantId, limit = 50) {
        return all(
          db,
          "SELECT * FROM payment_sessions WHERE merchant_id = ? ORDER BY created_at DESC LIMIT ?",
          [merchantId, limit],
        );
      },
      /** @param {string} merchantId */
      listQueue(merchantId) {
        return all(
          db,
          "SELECT * FROM payment_sessions WHERE merchant_id = ? AND status = 'QUEUED' ORDER BY queue_position ASC, created_at ASC",
          [merchantId],
        );
      },
      /** @param {string} merchantId @param {string} status */
      findByStatus(merchantId, status) {
        return get(
          db,
          "SELECT * FROM payment_sessions WHERE merchant_id = ? AND status = ? ORDER BY updated_at DESC LIMIT 1",
          [merchantId, status],
        );
      },
      /** @param {string} merchantId */
      listCounterPending(merchantId) {
        return all(
          db,
          `SELECT * FROM payment_sessions
           WHERE merchant_id = ? AND method IN ('CASH_COUNTER', 'CARD_COUNTER') AND status IN ('ACTIVE', 'PROCESSING')
           ORDER BY created_at ASC`,
          [merchantId],
        );
      },
      /**
       * @param {string} merchantId
       * @param {string} tag
       * @param {string} sinceIso
       */
      countSuccessByTagSince(merchantId, tag, sinceIso) {
        return count(
          db,
          "SELECT COUNT(*) AS n FROM payment_sessions WHERE merchant_id = ? AND status = 'SUCCESS' AND verification_tag = ? AND completed_at >= ?",
          [merchantId, tag, sinceIso],
        );
      },
    },
    observations: {
      /** @param {Record<string, unknown>} row */
      insert(row) {
        insertRow(db, "payment_observations", row);
      },
      /** @param {string} id @param {Record<string, unknown>} fields */
      update(id, fields) {
        updateRow(db, "payment_observations", id, fields);
      },
      /** @param {string} id */
      getById(id) {
        return get(db, "SELECT * FROM payment_observations WHERE id = ?", [id]);
      },
      /** @param {string} fingerprint @param {string} source */
      findByFingerprintAndSource(fingerprint, source) {
        return get(
          db,
          "SELECT * FROM payment_observations WHERE fingerprint_hash = ? AND source = ? LIMIT 1",
          [fingerprint, source],
        );
      },
      /** @param {string} fingerprint */
      findAttributedByFingerprint(fingerprint) {
        return get(
          db,
          "SELECT * FROM payment_observations WHERE fingerprint_hash = ? AND attributed_payment_id IS NOT NULL LIMIT 1",
          [fingerprint],
        );
      },
      /** @param {string} reference @param {string | null} excludeId */
      findSuccessByReference(reference, excludeId) {
        return get(
          db,
          `SELECT o.* FROM payment_observations o
           JOIN payment_sessions s ON s.id = o.attributed_payment_id
           WHERE o.bank_reference_number = ? AND s.status = 'SUCCESS' AND (? IS NULL OR o.id != ?)
           LIMIT 1`,
          [reference, excludeId, excludeId],
        );
      },
      /** @param {string} paymentId */
      latestUtr(paymentId) {
        const row = get(
          db,
          `SELECT bank_reference_number FROM payment_observations
           WHERE attributed_payment_id = ? AND bank_reference_number IS NOT NULL AND bank_reference_number != ''
           ORDER BY created_at DESC LIMIT 1`,
          [paymentId],
        );
        return row?.bank_reference_number || "";
      },
    },
    androidDevices: {
      /** @param {Record<string, unknown>} row */
      insert(row) {
        insertRow(db, "android_devices", row);
      },
      /** @param {string} id */
      getById(id) {
        return get(db, "SELECT * FROM android_devices WHERE id = ?", [id]);
      },
      /** @param {string} id @param {Record<string, unknown>} fields */
      update(id, fields) {
        updateRow(db, "android_devices", id, fields);
      },
      /** @param {string} merchantId */
      listByMerchant(merchantId) {
        return all(
          db,
          "SELECT * FROM android_devices WHERE merchant_id = ? ORDER BY created_at DESC",
          [merchantId],
        );
      },
    },
    webhooks: {
      /** @param {Record<string, unknown>} row */
      insert(row) {
        insertRow(db, "webhook_deliveries", row);
      },
      /** @param {string} id */
      getById(id) {
        return get(db, "SELECT * FROM webhook_deliveries WHERE id = ?", [id]);
      },
      /** @param {string} id @param {Record<string, unknown>} fields */
      update(id, fields) {
        updateRow(db, "webhook_deliveries", id, fields);
      },
      /** @param {string} paymentId @param {string} eventType */
      findByPaymentEvent(paymentId, eventType) {
        return get(
          db,
          "SELECT * FROM webhook_deliveries WHERE payment_id = ? AND event_type = ? ORDER BY created_at ASC LIMIT 1",
          [paymentId, eventType],
        );
      },
      /** @param {string} nowIso */
      listDue(nowIso) {
        return all(
          db,
          `SELECT * FROM webhook_deliveries
           WHERE is_successful = 0 AND next_retry_at IS NOT NULL AND next_retry_at <= ? AND attempt_count < 5
           ORDER BY next_retry_at ASC LIMIT 20`,
          [nowIso],
        );
      },
      /**
       * Claim one delivery attempt. A second caller with the same id gets false
       * while the first attempt is in flight or already finished.
       */
      claim(id, nextAttempt, claimUntil, expectedAttempt, nowIso) {
        const result = db.prepare(
          `UPDATE webhook_deliveries
           SET attempt_count = ?, next_retry_at = ?
           WHERE id = ? AND is_successful = 0 AND attempt_count = ?
             AND (next_retry_at IS NULL OR next_retry_at <= ?)`,
        ).run(nextAttempt, claimUntil, id, expectedAttempt, nowIso);
        return result.changes === 1;
      },
      /** @param {string} paymentId */
      listByPayment(paymentId) {
        return all(
          db,
          "SELECT * FROM webhook_deliveries WHERE payment_id = ? ORDER BY created_at ASC",
          [paymentId],
        );
      },
    },
    tickets: {
      /** @param {Record<string, unknown>} row */
      insert(row) {
        insertRow(db, "support_tickets", row);
      },
      /** @param {string} id */
      getById(id) {
        return get(db, "SELECT * FROM support_tickets WHERE id = ?", [id]);
      },
      /** @param {string} id @param {Record<string, unknown>} fields */
      update(id, fields) {
        updateRow(db, "support_tickets", id, fields);
      },
      /** @param {string} merchantId */
      listOpen(merchantId) {
        return all(
          db,
          "SELECT * FROM support_tickets WHERE merchant_id = ? AND status = 'OPEN' ORDER BY created_at DESC",
          [merchantId],
        );
      },
    },
    messages: {
      /** @param {Record<string, unknown>} row */
      insert(row) {
        insertRow(db, "ticket_messages", row);
      },
      /** @param {string} ticketId */
      listByTicket(ticketId) {
        return all(
          db,
          "SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC",
          [ticketId],
        );
      },
    },
    audit: {
      /** @param {Record<string, unknown>} row */
      insert(row) {
        insertRow(db, "audit_logs", row);
      },
      /**
       * @param {string} action
       * @param {string} entityId
       * @param {string} sinceIso
       */
      countSince(action, entityId, sinceIso) {
        return count(
          db,
          "SELECT COUNT(*) AS n FROM audit_logs WHERE action = ? AND entity_id = ? AND created_at >= ?",
          [action, entityId, sinceIso],
        );
      },
      /** @param {string} entityType @param {string} entityId */
      listByEntity(entityType, entityId) {
        return all(
          db,
          "SELECT * FROM audit_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC",
          [entityType, entityId],
        );
      },
    },
    security: {
      /** @param {Record<string, unknown>} row */
      insert(row) {
        insertRow(db, "security_events", row);
      },
      /** @param {string} sessionId */
      listBySession(sessionId) {
        return all(
          db,
          "SELECT * FROM security_events WHERE payment_session_id = ? ORDER BY created_at ASC",
          [sessionId],
        );
      },
      /** @param {string} eventType */
      listByType(eventType) {
        return all(
          db,
          "SELECT * FROM security_events WHERE event_type = ? ORDER BY created_at ASC",
          [eventType],
        );
      },
    },
  };
}
