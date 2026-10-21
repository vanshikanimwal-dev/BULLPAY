import { randomUUID } from "node:crypto";
import { iso } from "./time.js";

/**
 * @param {any} ctx
 * @param {{ merchantId?: string | null, entityType: string, entityId?: string | null, action: string, actorType?: string, actorId?: string | null, details?: Record<string, unknown>, ip?: string | null }} row
 */
export function writeAudit(ctx, row) {
  ctx.repos.audit.insert({
    id: randomUUID(),
    merchant_id: row.merchantId ?? null,
    entity_type: row.entityType,
    entity_id: row.entityId ?? null,
    action: row.action,
    actor_type: row.actorType || "SYSTEM",
    actor_id: row.actorId ?? null,
    details: JSON.stringify(row.details || {}),
    ip_address: row.ip ?? null,
    created_at: iso(ctx),
  });
}

/**
 * @param {any} ctx
 * @param {Record<string, unknown>} row
 */
export function writeSecurity(ctx, row) {
  ctx.repos.security.insert({
    id: randomUUID(),
    merchant_id: row.merchantId ?? null,
    customer_id: row.customerId ?? null,
    payment_session_id: row.paymentSessionId ?? null,
    event_type: row.eventType,
    source: row.source ?? null,
    sender: row.sender ?? null,
    device_info: row.deviceInfo ?? null,
    raw_message: row.rawMessage ?? null,
    normalized_message: row.normalizedMessage ?? null,
    extracted_amount: row.extractedAmount ?? null,
    extracted_reference: row.extractedReference ?? null,
    fraud_reason: row.fraudReason ?? null,
    metadata: JSON.stringify(row.metadata || {}),
    created_at: iso(ctx),
  });
}
