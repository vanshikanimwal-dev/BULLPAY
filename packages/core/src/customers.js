import { randomBytes, randomInt, randomUUID } from "node:crypto";
import {
  BullpayError,
  CUSTOMER_SESSION_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_SENDS,
  OTP_TTL_MS,
  OTP_WINDOW_MS,
  decryptString,
  encryptString,
  secretsEqual,
  tokenDigest,
} from "@bullpay/common";
import { writeAudit, writeSecurity } from "./audit.js";
import { clock, iso } from "./time.js";

/**
 * @param {string} mobile
 */
function assertMobile(mobile) {
  if (!/^[0-9]{10}$/.test(String(mobile || ""))) {
    throw new BullpayError("Mobile must be 10 digits", { status: 400, code: "MOBILE" });
  }
}

/**
 * @param {any} row
 */
export function presentCustomer(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    mobile: row.mobile_number,
    status: row.status,
    isPhoneVerified: Boolean(row.is_phone_verified),
    banReason: row.ban_reason,
    createdAt: row.created_at,
  };
}

/**
 * @param {any} ctx
 * @param {string} token
 */
export function findCustomerSession(ctx, token) {
  if (!token) return null;
  const digest = tokenDigest(token, ctx.masterKey);
  const session = ctx.repos.customerSessions.getActiveByDigest(digest);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= clock(ctx).getTime()) return null;
  return session;
}

/**
 * @param {any} ctx
 * @param {string} token
 */
export function requireCustomer(ctx, token) {
  if (!token) throw new BullpayError("Sign in required", { status: 401, code: "AUTH" });
  const session = ctx.repos.customerSessions.getByDigest(tokenDigest(token, ctx.masterKey));
  if (!session) throw new BullpayError("Sign in required", { status: 401, code: "AUTH" });
  const customer = ctx.repos.customers.getById(session.customer_id);
  if (!customer) throw new BullpayError("Sign in required", { status: 401, code: "AUTH" });
  if (customer.status === "BANNED") {
    throw new BullpayError("Customer is banned", { status: 403, code: "BANNED" });
  }
  if (!session.is_active || new Date(session.expires_at).getTime() <= clock(ctx).getTime()) {
    throw new BullpayError("Sign in required", { status: 401, code: "AUTH" });
  }
  return customer;
}

/**
 * @param {any} ctx
 * @param {string} mobile
 */
export function checkUser(ctx, mobile) {
  assertMobile(mobile);
  return { exists: Boolean(ctx.repos.customers.getByMobile(mobile)) };
}

/**
 * @param {any} ctx
 * @param {any} customer
 */
async function issueOtp(ctx, customer) {
  const since = new Date(clock(ctx).getTime() - OTP_WINDOW_MS).toISOString();
  const sends = ctx.repos.audit.countSince("OTP_SEND", customer.id, since);
  if (sends >= OTP_MAX_SENDS) {
    throw new BullpayError("Too many OTP requests. Try again later.", { status: 429, code: "OTP_RATE" });
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expires = new Date(clock(ctx).getTime() + OTP_TTL_MS).toISOString();
  ctx.repos.customers.update(customer.id, {
    otp_code: encryptString(code, ctx.masterKey),
    otp_expires_at: expires,
    otp_attempts: 0,
    updated_at: iso(ctx),
  });
  writeAudit(ctx, {
    entityType: "customer",
    entityId: customer.id,
    action: "OTP_SEND",
    actorType: "CUSTOMER",
    actorId: customer.id,
  });
  if (ctx.nodeEnv !== "production" && ctx.devOtpLog) {
    console.log(`BULLPAY_DEV_OTP ${customer.mobile_number} ${code}`);
  }
  await ctx.whatsapp.sendOtp(customer.mobile_number, code);
}

/**
 * @param {any} ctx
 * @param {{ name?: string, email?: string, mobile?: string }} input
 */
export async function registerCustomer(ctx, input) {
  assertMobile(input.mobile);
  if (!input.name || !String(input.name).trim()) throw new BullpayError("Name is required", { status: 400 });
  if (!input.email || !String(input.email).includes("@")) throw new BullpayError("Email is required", { status: 400 });
  if (ctx.repos.customers.getByMobile(input.mobile)) {
    throw new BullpayError("Mobile is already registered", { status: 409, code: "MOBILE_TAKEN" });
  }
  if (ctx.repos.customers.getByEmail(String(input.email).trim())) {
    throw new BullpayError("Email is already registered", { status: 409, code: "EMAIL_TAKEN" });
  }
  const now = iso(ctx);
  const id = randomUUID();
  ctx.repos.customers.insert({
    id,
    name: String(input.name).trim(),
    email: String(input.email).trim(),
    mobile_number: input.mobile,
    otp_attempts: 0,
    is_phone_verified: 0,
    status: "ACTIVE",
    created_at: now,
    updated_at: now,
  });
  await issueOtp(ctx, ctx.repos.customers.getById(id));
  return { id };
}

/**
 * @param {any} ctx
 * @param {string} mobile
 */
export async function sendOtp(ctx, mobile) {
  assertMobile(mobile);
  const customer = ctx.repos.customers.getByMobile(mobile);
  if (!customer) throw new BullpayError("Customer not found", { status: 404, code: "NOT_FOUND" });
  if (customer.status === "BANNED") throw new BullpayError("Customer is banned", { status: 403, code: "BANNED" });
  await issueOtp(ctx, customer);
  return { sent: true };
}

/**
 * @param {any} ctx
 * @param {{ mobile?: string, code?: string, ip?: string, userAgent?: string }} input
 */
export function verifyOtp(ctx, input) {
  assertMobile(input.mobile);
  const customer = ctx.repos.customers.getByMobile(input.mobile);
  if (!customer) throw new BullpayError("Customer not found", { status: 404, code: "NOT_FOUND" });
  if (customer.status === "BANNED") throw new BullpayError("Customer is banned", { status: 403, code: "BANNED" });
  const since = new Date(clock(ctx).getTime() - OTP_WINDOW_MS).toISOString();
  const verifies = ctx.repos.audit.countSince("OTP_VERIFY", customer.id, since);
  if (verifies >= OTP_MAX_ATTEMPTS) {
    throw new BullpayError("Too many verification attempts. Try again later.", { status: 429, code: "OTP_RATE" });
  }
  writeAudit(ctx, {
    entityType: "customer",
    entityId: customer.id,
    action: "OTP_VERIFY",
    actorType: "CUSTOMER",
    actorId: customer.id,
  });
  if (!customer.otp_code || !customer.otp_expires_at) {
    throw new BullpayError("Request a new code", { status: 400, code: "OTP_REQUIRED" });
  }
  if (new Date(customer.otp_expires_at).getTime() <= clock(ctx).getTime()) {
    throw new BullpayError("Code expired", { status: 401, code: "OTP_EXPIRED" });
  }
  const expected = decryptString(customer.otp_code, ctx.masterKey);
  if (!secretsEqual(expected, String(input.code ?? ""))) {
    const attempts = Number(customer.otp_attempts) + 1;
    /** @type {Record<string, unknown>} */
    const patch = { otp_attempts: attempts, updated_at: iso(ctx) };
    if (attempts >= OTP_MAX_ATTEMPTS) {
      patch.otp_code = null;
      patch.otp_expires_at = null;
      writeSecurity(ctx, {
        customerId: customer.id,
        eventType: "OTP_LOCKED",
        source: "OTP",
        fraudReason: "Five wrong OTP attempts",
      });
    }
    ctx.repos.customers.update(customer.id, patch);
    throw new BullpayError(
      attempts >= OTP_MAX_ATTEMPTS ? "Too many attempts. Request a new code." : "Wrong code",
      { status: 401, code: "OTP_MISMATCH" },
    );
  }
  const now = iso(ctx);
  ctx.repos.customers.update(customer.id, {
    is_phone_verified: 1,
    otp_code: null,
    otp_expires_at: null,
    otp_attempts: 0,
    last_login_at: now,
    updated_at: now,
  });
  const token = randomBytes(32).toString("hex");
  const expires = new Date(clock(ctx).getTime() + CUSTOMER_SESSION_TTL_MS).toISOString();
  ctx.repos.customerSessions.insert({
    id: randomUUID(),
    customer_id: customer.id,
    token_digest: tokenDigest(token, ctx.masterKey),
    expires_at: expires,
    is_active: 1,
    ip_address: input.ip || null,
    user_agent: input.userAgent || null,
    created_at: now,
    updated_at: now,
  });
  return { token, customer: presentCustomer(ctx.repos.customers.getById(customer.id)) };
}

/**
 * @param {any} ctx
 * @param {string} token
 */
export function logoutCustomer(ctx, token) {
  const session = findCustomerSession(ctx, token);
  if (!session) return { revoked: false };
  ctx.repos.customerSessions.revoke(session.id, iso(ctx));
  return { revoked: true };
}

/**
 * @param {any} ctx
 * @param {string} token
 */
export function customerMe(ctx, token) {
  return presentCustomer(requireCustomer(ctx, token));
}

/**
 * @param {any} ctx
 * @param {string} id
 * @param {string} reason
 */
export function banCustomer(ctx, id, reason) {
  const customer = ctx.repos.customers.getById(id);
  if (!customer) throw new BullpayError("Customer not found", { status: 404, code: "NOT_FOUND" });
  const now = iso(ctx);
  const banReason = reason || "Banned";
  ctx.repos.customers.update(id, {
    status: "BANNED",
    ban_reason: banReason,
    banned_at: now,
    updated_at: now,
  });
  ctx.repos.customerSessions.revokeAllForCustomer(id, now);
  writeAudit(ctx, {
    entityType: "customer",
    entityId: id,
    action: "CUSTOMER_BANNED",
    actorType: "ADMIN",
    details: { reason: banReason },
  });
  writeSecurity(ctx, {
    customerId: id,
    eventType: "CUSTOMER_BANNED",
    fraudReason: banReason,
    source: "ADMIN",
  });
  return presentCustomer(ctx.repos.customers.getById(id));
}

/**
 * @param {any} ctx
 * @param {string} id
 */
export function unbanCustomer(ctx, id) {
  const customer = ctx.repos.customers.getById(id);
  if (!customer) throw new BullpayError("Customer not found", { status: 404, code: "NOT_FOUND" });
  const now = iso(ctx);
  ctx.repos.customers.update(id, {
    status: "ACTIVE",
    ban_reason: null,
    unbanned_at: now,
    updated_at: now,
  });
  writeAudit(ctx, {
    entityType: "customer",
    entityId: id,
    action: "CUSTOMER_UNBANNED",
    actorType: "ADMIN",
  });
  return presentCustomer(ctx.repos.customers.getById(id));
}
