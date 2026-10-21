import { randomUUID } from "node:crypto";
import {
  BullpayError,
  COUNTER_METHODS,
  DEMO_MERCHANT_ID,
  METHODS,
  PLACEHOLDER_UPI,
  TERMINAL_STATUSES,
  buildUpiUri,
  paiseToRupees,
  rupeesToPaise,
} from "@bullpay/common";
import { withImmediateTransaction } from "@bullpay/db";
import { writeAudit } from "./audit.js";
import { activateSession, assertTransition, endSession, mustSession, releaseAndPromote } from "./slots.js";
import { clock, iso } from "./time.js";
import { dispatchWebhook, enqueueWebhook } from "./webhooks.js";

/**
 * @param {any} ctx
 * @param {any} session
 * @param {boolean} detailed
 */
export function presentPayment(ctx, session, detailed) {
  const body = {
    paymentId: session.id,
    orderId: session.order_id,
    amount: paiseToRupees(session.amount_paise),
    amountPaise: session.amount_paise,
    currency: session.currency,
    status: session.status,
    checkoutUrl: `${ctx.checkoutBase}/checkout/${session.id}`,
  };
  if (!detailed) return body;
  return {
    ...body,
    utr: ctx.repos.observations.latestUtr(session.id) || "",
    method: session.method,
    verificationTag: session.verification_tag,
    completedAt: session.completed_at,
    metadata: JSON.parse(session.metadata || "{}"),
  };
}

/**
 * @param {any} ctx
 * @param {string} id
 */
export function getCheckoutState(ctx, id) {
  const session = mustSession(ctx, id);
  const merchant = ctx.repos.merchants.getById(session.merchant_id);
  const branding = JSON.parse(merchant?.branding || "{}");
  const account = session.receiving_account_id
    ? ctx.repos.accounts.getById(session.receiving_account_id)
    : ctx.repos.accounts.getActiveByMerchant(session.merchant_id);
  let peopleAhead = 0;
  if (session.status === "QUEUED" && session.receiving_account_id) {
    const holder = ctx.repos.sessions.findSlotHolder(session.receiving_account_id);
    peopleAhead = ctx.repos.sessions.countQueuedAhead(session.receiving_account_id, session.queue_position) + (holder ? 1 : 0);
  }
  const snapshotPlaceholder = session.vpa_snapshot === PLACEHOLDER_UPI;
  const accountPlaceholder = account?.upi_id === PLACEHOLDER_UPI;
  return {
    paymentId: session.id,
    orderId: session.order_id,
    status: session.status,
    amount: paiseToRupees(session.amount_paise),
    amountPaise: session.amount_paise,
    currency: session.currency,
    payeeName: session.payee_snapshot || account?.payee_name || merchant?.business_name || "",
    branding,
    queuePosition: session.queue_position,
    peopleAhead,
    expiresAt: session.expires_at,
    processingExpiresAt: session.processing_expires_at,
    method: session.method,
    verificationTag: session.verification_tag,
    customerBound: Boolean(session.customer_id),
    setupRequired: Boolean(snapshotPlaceholder || (!session.vpa_snapshot && accountPlaceholder)),
    utr: ctx.repos.observations.latestUtr(session.id) || "",
    metadata: JSON.parse(session.metadata || "{}"),
    shortCode: session.id.replace(/-/g, "").slice(-6).toUpperCase(),
    returnUrl: session.return_url,
  };
}

/**
 * @param {any} ctx
 * @param {Record<string, any>} input
 */
export async function createPayment(ctx, input) {
  const merchantId = input.merchantId || DEMO_MERCHANT_ID;
  const merchant = ctx.repos.merchants.getById(merchantId);
  if (!merchant) throw new BullpayError("Unknown merchant", { status: 404, code: "MERCHANT" });
  const amountPaise = rupeesToPaise(input.amount);
  if (input.currency && input.currency !== "INR") {
    throw new BullpayError("Only INR is supported", { status: 400, code: "CURRENCY" });
  }
  if (!input.orderId || typeof input.orderId !== "string") {
    throw new BullpayError("orderId is required", { status: 400, code: "ORDER" });
  }
  const method = input.method || "UPI";
  if (!METHODS.includes(method)) throw new BullpayError("Unsupported method", { status: 400, code: "METHOD" });
  const metadata = input.metadata ?? {};
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new BullpayError("metadata must be an object", { status: 400, code: "METADATA" });
  }
  let customerId = null;
  if (input.customer?.mobile) {
    const existing = ctx.repos.customers.getByMobile(String(input.customer.mobile));
    if (existing && existing.status !== "BANNED" && existing.is_phone_verified) customerId = existing.id;
  }

  const session = withImmediateTransaction(ctx.db, () => {
    if (input.idempotencyKey) {
      const byKey = ctx.repos.sessions.findReusableByIdempotency(merchantId, input.idempotencyKey);
      if (byKey) return byKey;
    }
    const open = ctx.repos.sessions.findOpenByOrder(merchantId, input.orderId);
    if (open) return open;
    const id = randomUUID();
    const now = iso(ctx);
    try {
      ctx.repos.sessions.insert({
        id,
        merchant_id: merchantId,
        customer_id: customerId,
        order_id: input.orderId,
        amount_paise: amountPaise,
        currency: "INR",
        method,
        status: "INITIATED",
        queue_position: 0,
        return_url: input.returnUrl || null,
        idempotency_key: input.idempotencyKey || null,
        verification_level: 0,
        verification_sources: "[]",
        verification_tag: "UNVERIFIED",
        metadata: JSON.stringify(metadata),
        created_at: now,
        updated_at: now,
      });
    } catch (error) {
      if (!/UNIQUE/i.test(error instanceof Error ? error.message : "")) throw error;
      const again = ctx.repos.sessions.findOpenByOrder(merchantId, input.orderId);
      if (again) return again;
      throw error;
    }
    const account = ctx.repos.accounts.getActiveByMerchant(merchantId);
    if (!account) throw new BullpayError("No active receiving account", { status: 409, code: "NO_ACCOUNT" });
    const holder = ctx.repos.sessions.findSlotHolder(account.id);
    if (!holder) {
      activateSession(ctx, id, account.id);
    } else {
      const position = ctx.repos.sessions.maxQueuePosition(account.id) + 1;
      assertTransition("INITIATED", "QUEUED");
      ctx.repos.sessions.update(id, {
        status: "QUEUED",
        receiving_account_id: account.id,
        queue_position: position,
        updated_at: iso(ctx),
      });
    }
    return ctx.repos.sessions.getById(id);
  });
  return presentPayment(ctx, session, false);
}

/**
 * @param {any} ctx
 * @param {string} id
 */
export function getPayment(ctx, id) {
  return presentPayment(ctx, mustSession(ctx, id), true);
}

/**
 * @param {any} ctx
 * @param {string} id
 */
export function upiUriForSession(ctx, id) {
  const session = mustSession(ctx, id);
  if (session.status !== "ACTIVE" || !session.vpa_snapshot) {
    throw new BullpayError("QR is available while the checkout is active", { status: 409, code: "QR" });
  }
  return buildUpiUri({
    vpa: session.vpa_snapshot,
    payeeName: session.payee_snapshot || "",
    amount: paiseToRupees(session.amount_paise),
    orderId: session.order_id,
  });
}

/**
 * @param {any} ctx
 * @param {string} id
 * @param {string} token
 * @param {(ctx: any, token: string) => any} requireCustomer
 */
export function bindCustomer(ctx, id, token, requireCustomer) {
  const customer = requireCustomer(ctx, token);
  const session = mustSession(ctx, id);
  if (TERMINAL_STATUSES.includes(session.status)) {
    throw new BullpayError("Checkout is already finished", { status: 409, code: "FINISHED" });
  }
  ctx.repos.sessions.update(id, { customer_id: customer.id, updated_at: iso(ctx) });
  return getCheckoutState(ctx, id);
}

/**
 * @param {any} ctx
 * @param {string} id
 */
export function markPaymentDone(ctx, id) {
  withImmediateTransaction(ctx.db, () => {
    const session = mustSession(ctx, id);
    assertTransition(session.status, "PROCESSING");
    const now = clock(ctx);
    ctx.repos.sessions.update(id, {
      status: "PROCESSING",
      processing_started_at: now.toISOString(),
      processing_expires_at: new Date(now.getTime() + ctx.processingWindowMs).toISOString(),
      updated_at: now.toISOString(),
    });
  });
  return getCheckoutState(ctx, id);
}

/**
 * @param {any} ctx
 * @param {string} id
 */
export async function cancelPayment(ctx, id) {
  const session = mustSession(ctx, id);
  if (session.status !== "ACTIVE" && session.status !== "QUEUED") {
    throw new BullpayError("Only an active or queued checkout can be cancelled", {
      status: 409,
      code: "INVALID_TRANSITION",
    });
  }
  const { delivery } = endSession(ctx, id, "CANCELLED");
  if (delivery) await dispatchWebhook(ctx, delivery);
  return getCheckoutState(ctx, id);
}

/**
 * @param {any} ctx
 * @param {string} id
 * @param {string} method
 */
export function selectMethod(ctx, id, method) {
  if (!METHODS.includes(method)) throw new BullpayError("Unsupported method", { status: 400, code: "METHOD" });
  withImmediateTransaction(ctx.db, () => {
    const session = mustSession(ctx, id);
    if (TERMINAL_STATUSES.includes(session.status)) {
      throw new BullpayError("Method cannot be changed after the checkout has finished", { status: 409, code: "FINISHED" });
    }
    ctx.repos.sessions.update(id, { method, updated_at: iso(ctx) });
  });
  return getCheckoutState(ctx, id);
}

/**
 * @param {any} ctx
 * @param {string} id
 * @param {string} token
 * @param {(ctx: any, token: string) => any} requireCustomer
 */
export async function confirmCod(ctx, id, token, requireCustomer) {
  const customer = requireCustomer(ctx, token);
  const { delivery } = withImmediateTransaction(ctx.db, () => {
    const session = mustSession(ctx, id);
    if (session.status !== "ACTIVE") {
      throw new BullpayError("Cash on delivery can only be confirmed while the checkout is active", {
        status: 409,
        code: "INVALID_TRANSITION",
      });
    }
    if (session.customer_id && session.customer_id !== customer.id) {
      throw new BullpayError("This checkout is bound to another customer", { status: 403, code: "CUSTOMER" });
    }
    assertTransition(session.status, "SUCCESS");
    const now = iso(ctx);
    ctx.repos.sessions.update(id, {
      status: "SUCCESS",
      method: "COD",
      customer_id: customer.id,
      completed_at: now,
      updated_at: now,
    });
    const updated = ctx.repos.sessions.getById(id);
    const deliveryRow = enqueueWebhook(ctx, updated, "SUCCESS");
    releaseAndPromote(ctx, session.receiving_account_id, session.id);
    return { delivery: deliveryRow };
  });
  if (delivery) await dispatchWebhook(ctx, delivery);
  return getCheckoutState(ctx, id);
}

/**
 * @param {any} ctx
 * @param {{ paymentId: string, method: string }} input
 */
export async function counterConfirm(ctx, input) {
  if (!COUNTER_METHODS.includes(input.method)) {
    throw new BullpayError("Method must be CASH_COUNTER or CARD_COUNTER", { status: 400, code: "METHOD" });
  }
  const { delivery, session } = withImmediateTransaction(ctx.db, () => {
    const current = mustSession(ctx, input.paymentId);
    if (current.status !== "ACTIVE" && current.status !== "PROCESSING") {
      throw new BullpayError("The cashier can only confirm an active or processing checkout", {
        status: 409,
        code: "INVALID_TRANSITION",
      });
    }
    assertTransition(current.status, "SUCCESS");
    const now = iso(ctx);
    ctx.repos.sessions.update(current.id, {
      status: "SUCCESS",
      method: input.method,
      completed_at: now,
      updated_at: now,
    });
    const updated = ctx.repos.sessions.getById(current.id);
    const deliveryRow = enqueueWebhook(ctx, updated, "SUCCESS");
    releaseAndPromote(ctx, current.receiving_account_id, current.id);
    writeAudit(ctx, {
      merchantId: current.merchant_id,
      entityType: "payment_session",
      entityId: current.id,
      action: "COUNTER_CONFIRMED",
      actorType: "ADMIN",
      details: { method: input.method },
    });
    return { delivery: deliveryRow, session: updated };
  });
  if (delivery) await dispatchWebhook(ctx, delivery);
  return presentPayment(ctx, session, true);
}

/**
 * @param {any} ctx
 * @param {string} paymentId
 */
export async function counterDecline(ctx, paymentId) {
  const session = mustSession(ctx, paymentId);
  if (session.status !== "ACTIVE" && session.status !== "PROCESSING") {
    throw new BullpayError("The cashier can only decline an active or processing checkout", {
      status: 409,
      code: "INVALID_TRANSITION",
    });
  }
  const { delivery, session: updated } = endSession(ctx, paymentId, "FAILED");
  if (delivery) await dispatchWebhook(ctx, delivery);
  return presentPayment(ctx, updated, true);
}

/**
 * @param {any} ctx
 */
export async function sweep(ctx) {
  const now = iso(ctx);
  const expired = ctx.repos.sessions.listExpiredActive(now);
  const failed = ctx.repos.sessions.listExpiredProcessing(now);
  /** @type {any[]} */
  const deliveries = [];
  for (const row of expired) {
    try {
      const result = endSession(ctx, row.id, "EXPIRED");
      if (result.delivery) deliveries.push(result.delivery);
    } catch (error) {
      if (!(error instanceof BullpayError) || error.code !== "INVALID_TRANSITION") throw error;
    }
  }
  for (const row of failed) {
    try {
      const result = endSession(ctx, row.id, "FAILED");
      if (result.delivery) deliveries.push(result.delivery);
    } catch (error) {
      if (!(error instanceof BullpayError) || error.code !== "INVALID_TRANSITION") throw error;
    }
  }
  for (const delivery of deliveries) await dispatchWebhook(ctx, delivery);
  return { expired: expired.length, failed: failed.length };
}
