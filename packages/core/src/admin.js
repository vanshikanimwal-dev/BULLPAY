import { randomUUID } from "node:crypto";
import { BullpayError, DEMO_MERCHANT_ID, encryptString } from "@bullpay/common";
import { presentCustomer } from "./customers.js";
import { presentPayment } from "./payments.js";
import { iso } from "./time.js";

/**
 * @param {any} ctx
 * @param {any} session
 */
function summary(ctx, session) {
  if (!session) return null;
  return presentPayment(ctx, session, true);
}

/**
 * @param {any} ctx
 * @param {string} [merchantId]
 */
export function getOperations(ctx, merchantId = DEMO_MERCHANT_ID) {
  const start = new Date(ctx.now());
  start.setUTCHours(0, 0, 0, 0);
  const since = start.toISOString();
  return {
    active: summary(ctx, ctx.repos.sessions.findByStatus(merchantId, "ACTIVE")),
    processing: summary(ctx, ctx.repos.sessions.findByStatus(merchantId, "PROCESSING")),
    queue: ctx.repos.sessions.listQueue(merchantId).map((session) => summary(ctx, session)),
    singleChannelToday: ctx.repos.sessions.countSuccessByTagSince(merchantId, "SINGLE_CHANNEL", since),
    dualChannelToday: ctx.repos.sessions.countSuccessByTagSince(merchantId, "DUAL_CHANNEL", since),
  };
}

/**
 * @param {any} ctx
 * @param {string} [merchantId]
 */
export function getReceivingAccount(ctx, merchantId = DEMO_MERCHANT_ID) {
  const account = ctx.repos.accounts.getActiveByMerchant(merchantId);
  if (!account) return null;
  return {
    id: account.id,
    upiId: account.upi_id,
    payeeName: account.payee_name,
    isActive: Boolean(account.is_active),
    isSlotBusy: Boolean(account.is_slot_busy),
  };
}

/**
 * @param {any} ctx
 * @param {string} merchantId
 * @param {{ upiId?: string, payeeName?: string }} input
 */
export function updateReceivingAccount(ctx, merchantId, input) {
  if (!input.upiId || !input.payeeName) {
    throw new BullpayError("upiId and payeeName are required", { status: 400 });
  }
  const account = ctx.repos.accounts.getActiveByMerchant(merchantId);
  if (!account) throw new BullpayError("No receiving account", { status: 404 });
  ctx.repos.accounts.update(account.id, {
    upi_id: String(input.upiId).trim(),
    payee_name: String(input.payeeName).trim(),
    is_active: 1,
  });
  return getReceivingAccount(ctx, merchantId);
}

/**
 * @param {any} ctx
 * @param {string} merchantId
 */
export function getBranding(ctx, merchantId) {
  const merchant = ctx.repos.merchants.getById(merchantId);
  if (!merchant) throw new BullpayError("Unknown merchant", { status: 404 });
  return JSON.parse(merchant.branding || "{}");
}

/**
 * @param {any} ctx
 * @param {string} merchantId
 * @param {Record<string, unknown>} input
 */
export function updateBranding(ctx, merchantId, input) {
  const current = getBranding(ctx, merchantId);
  const branding = {
    appName: input.appName ?? current.appName,
    primaryColor: input.primaryColor ?? current.primaryColor,
    logoUrl: input.logoUrl === undefined ? current.logoUrl : input.logoUrl,
    faviconUrl: input.faviconUrl === undefined ? current.faviconUrl : input.faviconUrl,
  };
  ctx.repos.merchants.update(merchantId, { branding: JSON.stringify(branding), updated_at: iso(ctx) });
  return branding;
}

/**
 * @param {any} ctx
 * @param {string} merchantId
 */
export function listPayments(ctx, merchantId) {
  return ctx.repos.sessions.listByMerchant(merchantId, 50).map((session) => presentPayment(ctx, session, true));
}

/**
 * @param {any} ctx
 * @param {string} merchantId
 */
export function listCounter(ctx, merchantId) {
  return ctx.repos.sessions.listCounterPending(merchantId).map((session) => presentPayment(ctx, session, true));
}

/**
 * @param {any} ctx
 * @param {string} merchantId
 */
export function listTickets(ctx, merchantId) {
  return ctx.repos.tickets.listOpen(merchantId).map((ticket) => ({
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    paymentId: ticket.payment_id,
    customerId: ticket.customer_id,
    createdAt: ticket.created_at,
    messages: ctx.repos.messages.listByTicket(ticket.id).map((message) => ({
      id: message.id,
      senderType: message.sender_type,
      senderId: message.sender_id,
      message: message.message,
      createdAt: message.created_at,
    })),
  }));
}

/**
 * @param {any} ctx
 * @param {string} ticketId
 * @param {string} message
 */
export function replyTicket(ctx, ticketId, message) {
  const ticket = ctx.repos.tickets.getById(ticketId);
  if (!ticket) throw new BullpayError("Ticket not found", { status: 404 });
  if (!message || !String(message).trim()) throw new BullpayError("Message is required", { status: 400 });
  ctx.repos.messages.insert({
    id: randomUUID(),
    ticket_id: ticketId,
    sender_type: "ADMIN",
    sender_id: "admin",
    message: String(message).trim(),
    attachments: "[]",
    created_at: iso(ctx),
  });
  ctx.repos.tickets.update(ticketId, { updated_at: iso(ctx) });
  return { id: ticketId };
}

/**
 * @param {any} ctx
 */
export function listCustomers(ctx) {
  return ctx.repos.customers.list(100).map(presentCustomer);
}

/**
 * @param {any} ctx
 * @param {string} merchantId
 */
export function listAndroidDevices(ctx, merchantId) {
  return ctx.repos.androidDevices.listByMerchant(merchantId).map((device) => ({
    id: device.id,
    deviceName: device.device_name,
    deviceModel: device.device_model,
    isActive: Boolean(device.is_active),
    lastHeartbeatAt: device.last_heartbeat_at,
    lastObservationAt: device.last_observation_at,
  }));
}

/**
 * @param {any} ctx
 * @param {string} merchantId
 */
export function getSettings(ctx, merchantId) {
  const merchant = ctx.repos.merchants.getById(merchantId);
  if (!merchant) throw new BullpayError("Unknown merchant", { status: 404 });
  return {
    webhookUrl: merchant.webhook_url,
    supportEmail: merchant.contact_email,
    supportPhone: merchant.contact_phone,
    webhookSecretSet: Boolean(merchant.webhook_secret),
  };
}

/**
 * @param {any} ctx
 * @param {string} merchantId
 * @param {Record<string, string | undefined>} input
 */
export function updateSettings(ctx, merchantId, input) {
  /** @type {Record<string, unknown>} */
  const fields = { updated_at: iso(ctx) };
  if (input.webhookUrl != null) fields.webhook_url = input.webhookUrl;
  if (input.supportEmail != null) fields.contact_email = input.supportEmail;
  if (input.supportPhone != null) fields.contact_phone = input.supportPhone;
  if (input.webhookSecret) fields.webhook_secret = encryptString(String(input.webhookSecret), ctx.masterKey);
  ctx.repos.merchants.update(merchantId, fields);
  return getSettings(ctx, merchantId);
}

/**
 * @param {any} ctx
 * @param {string} merchantId
 */
export function internalStatus(ctx, merchantId = DEMO_MERCHANT_ID) {
  const account = ctx.repos.accounts.getActiveByMerchant(merchantId);
  return {
    ok: true,
    queue: ctx.repos.sessions.listQueue(merchantId).length,
    slotBusy: Boolean(account?.is_slot_busy),
  };
}
