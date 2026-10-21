import { randomUUID } from "node:crypto";
import { decryptString, MAX_WEBHOOK_ATTEMPTS, paiseToRupees, signBody, WEBHOOK_BACKOFF_MS, WEBHOOK_EVENTS } from "@bullpay/common";
import { clock, iso } from "./time.js";

/**
 * @param {any} ctx
 * @param {any} session
 * @param {string} event
 */
export function buildWebhookBody(ctx, session, event) {
  return {
    event,
    paymentId: session.id,
    orderId: session.order_id,
    amount: paiseToRupees(session.amount_paise),
    amountPaise: session.amount_paise,
    currency: session.currency || "INR",
    method: session.method,
    utr: ctx.repos.observations.latestUtr(session.id) || "",
    completedAt: session.completed_at,
    metadata: JSON.parse(session.metadata || "{}"),
  };
}

/**
 * Insert one delivery row per payment event. A repeat returns the existing row
 * and does not create a second send.
 * @param {any} ctx
 * @param {any} session
 * @param {string} event
 */
export function enqueueWebhook(ctx, session, event) {
  if (!WEBHOOK_EVENTS.includes(event)) return null;
  const existing = ctx.repos.webhooks.findByPaymentEvent(session.id, event);
  if (existing) return existing;
  const merchant = ctx.repos.merchants.getById(session.merchant_id);
  if (!merchant?.webhook_url) return null;
  const id = randomUUID();
  ctx.repos.webhooks.insert({
    id,
    merchant_id: session.merchant_id,
    payment_id: session.id,
    event_type: event,
    payload: JSON.stringify(buildWebhookBody(ctx, session, event)),
    endpoint_url: merchant.webhook_url,
    response_status: null,
    response_body: null,
    attempt_count: 0,
    is_successful: 0,
    next_retry_at: iso(ctx),
    created_at: iso(ctx),
  });
  return ctx.repos.webhooks.getById(id);
}

/**
 * @param {any} ctx
 * @param {{ id: string } | null | undefined} delivery
 */
export async function dispatchWebhook(ctx, delivery) {
  if (!delivery?.id) return null;
  const current = ctx.repos.webhooks.getById(delivery.id);
  if (!current || current.is_successful) return current;
  if (current.attempt_count >= MAX_WEBHOOK_ATTEMPTS) return current;
  const claimUntil = new Date(clock(ctx).getTime() + 60_000).toISOString();
  const claimed = ctx.repos.webhooks.claim(
    current.id,
    current.attempt_count + 1,
    claimUntil,
    current.attempt_count,
    iso(ctx),
  );
  if (!claimed) return ctx.repos.webhooks.getById(current.id);
  const merchant = ctx.repos.merchants.getById(current.merchant_id);
  const secret = decryptString(merchant.webhook_secret, ctx.masterKey);
  const signature = signBody(current.payload, secret);
  let status = 0;
  let responseBody = "";
  try {
    const result = await ctx.transport({
      url: current.endpoint_url,
      body: current.payload,
      headers: {
        "content-type": "application/json",
        "x-gateway-event": current.event_type,
        "x-gateway-signature": signature,
        "x-gateway-delivery-id": current.id,
        "x-gateway-timestamp": String(clock(ctx).getTime()),
      },
    });
    status = Number(result?.status ?? 0);
    responseBody = String(result?.body ?? "").slice(0, 2000);
  } catch (error) {
    status = 0;
    responseBody = String(error instanceof Error ? error.message : "transport error").slice(0, 2000);
  }
  const success = status >= 200 && status < 300;
  const attempt = current.attempt_count + 1;
  /** @type {Record<string, unknown>} */
  const fields = {
    response_status: status,
    response_body: responseBody,
    is_successful: success ? 1 : 0,
    next_retry_at: null,
  };
  if (!success && attempt < MAX_WEBHOOK_ATTEMPTS) {
    const delay = WEBHOOK_BACKOFF_MS[Math.min(attempt - 1, WEBHOOK_BACKOFF_MS.length - 1)];
    fields.next_retry_at = new Date(clock(ctx).getTime() + delay).toISOString();
  }
  ctx.repos.webhooks.update(current.id, fields);
  return ctx.repos.webhooks.getById(current.id);
}

/**
 * @param {any} ctx
 */
export async function processDueWebhooks(ctx) {
  const due = ctx.repos.webhooks.listDue(iso(ctx));
  const sent = [];
  for (const row of due) sent.push(await dispatchWebhook(ctx, row));
  return sent;
}
