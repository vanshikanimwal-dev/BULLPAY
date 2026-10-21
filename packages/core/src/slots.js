import { BullpayError, canTransition } from "@bullpay/common";
import { withImmediateTransaction } from "@bullpay/db";
import { writeAudit } from "./audit.js";
import { iso, clock } from "./time.js";
import { enqueueWebhook } from "./webhooks.js";

/**
 * @param {string} from
 * @param {string} to
 */
export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new BullpayError(`Cannot move ${from} to ${to}`, { status: 409, code: "INVALID_TRANSITION" });
  }
}

/**
 * @param {any} ctx
 * @param {string} id
 */
export function mustSession(ctx, id) {
  const session = ctx.repos.sessions.getById(id);
  if (!session) throw new BullpayError("Payment not found", { status: 404, code: "NOT_FOUND" });
  return session;
}

/**
 * Move a session onto the free slot and copy the UPI snapshot.
 * Caller must already be inside a transaction.
 * @param {any} ctx
 * @param {string} sessionId
 * @param {string} accountId
 */
export function activateSession(ctx, sessionId, accountId) {
  const account = ctx.repos.accounts.getById(accountId);
  const session = ctx.repos.sessions.getById(sessionId);
  if (!account || !session) throw new BullpayError("Session or account missing", { status: 404 });
  assertTransition(session.status, "ACTIVE");
  const now = clock(ctx);
  const expires = new Date(now.getTime() + ctx.activeWindowMs);
  ctx.repos.sessions.update(sessionId, {
    status: "ACTIVE",
    receiving_account_id: accountId,
    slot_acquired_at: now.toISOString(),
    expires_at: expires.toISOString(),
    vpa_snapshot: account.upi_id,
    payee_snapshot: account.payee_name,
    queue_position: 0,
    updated_at: now.toISOString(),
  });
  ctx.repos.accounts.markBusy(accountId, sessionId);
  writeAudit(ctx, {
    merchantId: session.merchant_id,
    entityType: "payment_session",
    entityId: sessionId,
    action: "SLOT_ACQUIRED",
    details: { accountId },
  });
}

/**
 * @param {any} ctx
 * @param {string | null} accountId
 * @param {string} endedSessionId
 */
export function releaseAndPromote(ctx, accountId, endedSessionId) {
  if (!accountId) return;
  const ended = ctx.repos.sessions.getById(endedSessionId);
  ctx.repos.accounts.clearBusy(accountId);
  writeAudit(ctx, {
    merchantId: ended?.merchant_id ?? null,
    entityType: "payment_receiving_account",
    entityId: accountId,
    action: "SLOT_RELEASED",
    details: { sessionId: endedSessionId },
  });
  const next = ctx.repos.sessions.oldestQueued(accountId);
  if (!next) return;
  activateSession(ctx, next.id, accountId);
  writeAudit(ctx, {
    merchantId: next.merchant_id,
    entityType: "payment_session",
    entityId: next.id,
    action: "QUEUE_PROMOTED",
    details: { accountId, previousSessionId: endedSessionId },
  });
}

/**
 * End a session and, when it held the slot, promote the queue in the same transaction.
 * @param {any} ctx
 * @param {string} sessionId
 * @param {string} toStatus
 */
export function endSession(ctx, sessionId, toStatus) {
  return withImmediateTransaction(ctx.db, () => {
    const session = ctx.repos.sessions.getById(sessionId);
    if (!session) return { session: null, delivery: null };
    if (session.status === toStatus) return { session, delivery: null };
    assertTransition(session.status, toStatus);
    const now = iso(ctx);
    /** @type {Record<string, unknown>} */
    const patch = { status: toStatus, updated_at: now };
    if (toStatus === "SUCCESS") patch.completed_at = now;
    const heldSlot = session.status === "ACTIVE" || session.status === "PROCESSING";
    ctx.repos.sessions.update(session.id, patch);
    const updated = ctx.repos.sessions.getById(session.id);
    const delivery = enqueueWebhook(ctx, updated, toStatus);
    if (heldSlot) releaseAndPromote(ctx, session.receiving_account_id, session.id);
    return { session: ctx.repos.sessions.getById(session.id), delivery };
  });
}
