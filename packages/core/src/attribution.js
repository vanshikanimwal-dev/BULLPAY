import { randomUUID } from "node:crypto";
import {
  BullpayError,
  OBSERVATION_GRACE_MS,
  OBSERVER_SOURCES,
  SMS_SOURCES,
  isPersonalSender,
  normalizeAlert,
  observationFingerprint,
  verificationTagForLevel,
} from "@bullpay/common";
import { withImmediateTransaction } from "@bullpay/db";
import { writeAudit, writeSecurity } from "./audit.js";
import { assertTransition, releaseAndPromote } from "./slots.js";
import { clock, iso } from "./time.js";
import { dispatchWebhook, enqueueWebhook } from "./webhooks.js";

/**
 * @param {unknown} value
 */
function assertPaise(value) {
  const numeric = typeof value === "string" && /^[0-9]+$/.test(value) ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isInteger(numeric) || numeric <= 0) {
    throw new BullpayError("amountPaise must be a positive integer", { status: 400, code: "AMOUNT" });
  }
  return numeric;
}

/**
 * @param {any} ctx
 * @param {Record<string, any>} input
 */
function resolveAccount(ctx, input) {
  if (input.receivingAccountId) {
    const account = ctx.repos.accounts.getById(input.receivingAccountId);
    if (!account) throw new BullpayError("Receiving account not found", { status: 404, code: "ACCOUNT" });
    return account;
  }
  if (input.upiId) {
    const rows = ctx.repos.accounts.listActiveByUpi(input.upiId);
    if (rows.length !== 1) throw new BullpayError("Receiving account not found", { status: 404, code: "ACCOUNT" });
    return rows[0];
  }
  throw new BullpayError("receivingAccountId or upiId is required", { status: 400, code: "ACCOUNT" });
}

/**
 * @param {any} ctx
 * @param {{ observationId: string, match: any, source: string, now: string }} args
 */
function acceptObservation(ctx, args) {
  ctx.repos.observations.update(args.observationId, {
    attribution_status: "ATTRIBUTED",
    attributed_payment_id: args.match.id,
  });
  const wasSuccess = args.match.status === "SUCCESS";
  ctx.repos.sessions.update(args.match.id, {
    verification_sources: JSON.stringify([args.source]),
    verification_level: 1,
    verification_tag: verificationTagForLevel(1),
    attributed_observation_id: args.observationId,
    updated_at: args.now,
  });
  if (wasSuccess) {
    return { attributed: true, paymentId: args.match.id, observationId: args.observationId, delivery: null };
  }
  assertTransition(args.match.status, "SUCCESS");
  ctx.repos.sessions.update(args.match.id, {
    status: "SUCCESS",
    completed_at: args.now,
    updated_at: args.now,
  });
  const updated = ctx.repos.sessions.getById(args.match.id);
  const delivery = enqueueWebhook(ctx, updated, "SUCCESS");
  releaseAndPromote(ctx, args.match.receiving_account_id, args.match.id);
  writeAudit(ctx, {
    merchantId: args.match.merchant_id,
    entityType: "payment_session",
    entityId: args.match.id,
    action: "PAYMENT_ATTRIBUTED",
    details: { observationId: args.observationId, source: args.source },
  });
  return { attributed: true, paymentId: args.match.id, observationId: args.observationId, delivery };
}

/**
 * @param {any} ctx
 * @param {Record<string, any>} input
 */
export async function ingestCredit(ctx, input) {
  const source = String(input.source || "").toUpperCase();
  if (!OBSERVER_SOURCES.includes(source)) {
    throw new BullpayError("Unknown observation source", { status: 400, code: "SOURCE" });
  }
  const account = resolveAccount(ctx, input);
  const normalized = normalizeAlert(input.rawText);
  const amountPaise = input.amountPaise == null ? normalized.amountPaise : assertPaise(input.amountPaise);
  if (!amountPaise) throw new BullpayError("amountPaise is required", { status: 400, code: "AMOUNT" });
  const bankReference = String(input.bankReferenceNumber || normalized.bankReferenceNumber || "");
  const observedAt = input.observedAt || iso(ctx);
  const sender = input.sender || "";
  const senderVpa = input.senderVpa || (String(sender).includes("@") ? sender : null);
  const fingerprint = observationFingerprint({
    receivingAccountId: account.id,
    amountPaise,
    bankReference,
    observedAt,
  });

  const outcome = withImmediateTransaction(ctx.db, () => {
    const same = ctx.repos.observations.findByFingerprintAndSource(fingerprint, source);
    if (same) {
      writeAudit(ctx, {
        merchantId: account.merchant_id,
        entityType: "payment_observation",
        entityId: same.id,
        action: "DUPLICATE_OBSERVATION_DROPPED",
        details: { fingerprint, source },
      });
      return { duplicate: true, observationId: same.id };
    }

    const prior = ctx.repos.observations.findAttributedByFingerprint(fingerprint);
    if (prior && prior.source !== source && prior.attributed_payment_id) {
      const session = ctx.repos.sessions.getById(prior.attributed_payment_id);
      const sources = JSON.parse(session?.verification_sources || "[]");
      if (prior.source && !sources.includes(prior.source)) sources.push(prior.source);
      if (!sources.includes(source)) sources.push(source);
      const level = Math.min(3, sources.length);
      const wasSuccess = session?.status === "SUCCESS";
      if (session) {
        ctx.repos.sessions.update(session.id, {
          verification_sources: JSON.stringify(sources),
          verification_level: level,
          verification_tag: verificationTagForLevel(level),
          updated_at: iso(ctx),
        });
      }
      const observationId = randomUUID();
      const now = iso(ctx);
      ctx.repos.observations.insert({
        id: observationId,
        receiving_account_id: account.id,
        source,
        amount_paise: amountPaise,
        observed_at: new Date(observedAt).toISOString(),
        ingested_at: now,
        sender_vpa: senderVpa,
        bank_reference_number: bankReference || null,
        fingerprint_hash: fingerprint,
        raw_payload: JSON.stringify({ source, sender, rawText: normalized.normalized }),
        attribution_status: "ATTRIBUTED",
        attributed_payment_id: prior.attributed_payment_id,
        created_at: now,
      });
      return {
        attached: true,
        observationId,
        paymentId: prior.attributed_payment_id,
        verificationTag: verificationTagForLevel(level),
        delivery: wasSuccess ? null : null,
      };
    }

    const observationId = randomUUID();
    const now = iso(ctx);
    ctx.repos.observations.insert({
      id: observationId,
      receiving_account_id: account.id,
      source,
      amount_paise: amountPaise,
      observed_at: new Date(observedAt).toISOString(),
      ingested_at: now,
      sender_vpa: senderVpa,
      bank_reference_number: bankReference || null,
      fingerprint_hash: fingerprint,
      raw_payload: JSON.stringify({ source, sender, rawText: normalized.normalized }),
      attribution_status: "UNATTRIBUTED",
      attributed_payment_id: null,
      created_at: now,
    });

    if (bankReference) {
      const reused = ctx.repos.observations.findSuccessByReference(bankReference, observationId);
      if (reused) {
        writeAudit(ctx, {
          merchantId: account.merchant_id,
          entityType: "payment_observation",
          entityId: observationId,
          action: "REUSED_UTR_REJECTED",
          details: { bankReference, existingPaymentId: reused.attributed_payment_id },
        });
        return { rejected: "REUSED_UTR_REJECTED", observationId };
      }
    }

    if (SMS_SOURCES.includes(source) && isPersonalSender(sender)) {
      const open = ctx.repos.sessions.findEligibleByAmount(account.id, amountPaise);
      writeSecurity(ctx, {
        merchantId: account.merchant_id,
        paymentSessionId: open?.id ?? null,
        eventType: "PERSONAL_SMS_REJECTED",
        source,
        sender,
        rawMessage: input.rawText || "",
        normalizedMessage: normalized.normalized,
        extractedAmount: amountPaise,
        extractedReference: bankReference,
        fraudReason: "Personal handset sender",
      });
      return { rejected: "PERSONAL_SMS_REJECTED", observationId, paymentId: open?.id ?? null };
    }

    const match = ctx.repos.sessions.findEligibleByAmount(account.id, amountPaise);
    const observedMs = new Date(observedAt).getTime();
    const slotMs = match?.slot_acquired_at ? new Date(match.slot_acquired_at).getTime() : null;
    const acceptable = Boolean(match && slotMs != null && observedMs >= slotMs - OBSERVATION_GRACE_MS);
    if (acceptable) return acceptObservation(ctx, { observationId, match, source, now });

    if (!match) {
      const mismatches = ctx.repos.sessions.listDifferentAmountHolders(account.id, amountPaise);
      if (mismatches.length) {
        writeSecurity(ctx, {
          merchantId: account.merchant_id,
          paymentSessionId: mismatches[0].id,
          eventType: "AMOUNT_MISMATCH",
          source,
          sender,
          rawMessage: input.rawText || "",
          normalizedMessage: normalized.normalized,
          extractedAmount: amountPaise,
          fraudReason: "Observation amount does not match the open checkout",
        });
      }
    }

    const since = new Date(clock(ctx).getTime() - 24 * 60 * 60 * 1000).toISOString();
    const recent = ctx.repos.sessions.findRecentTerminal(account.id, amountPaise, since);
    const beforeWindow = !match || slotMs == null || observedMs < slotMs - OBSERVATION_GRACE_MS;
    if (recent && beforeWindow) {
      ctx.repos.observations.update(observationId, { attribution_status: "LATE_UNMATCHED" });
      const ticketId = randomUUID();
      ctx.repos.tickets.insert({
        id: ticketId,
        merchant_id: recent.merchant_id,
        customer_id: recent.customer_id,
        payment_id: recent.id,
        subject: `Late payment for order ${recent.order_id}`,
        status: "OPEN",
        created_at: now,
        updated_at: now,
      });
      writeAudit(ctx, {
        merchantId: recent.merchant_id,
        entityType: "payment_session",
        entityId: recent.id,
        action: "LATE_PAYMENT",
        details: { observationId, ticketId, orderId: recent.order_id },
      });
      return { rejected: "LATE_UNMATCHED", observationId, ticketId, paymentId: recent.id };
    }
    return { attributed: false, observationId };
  });

  if (outcome.delivery) await dispatchWebhook(ctx, outcome.delivery);
  return outcome;
}
