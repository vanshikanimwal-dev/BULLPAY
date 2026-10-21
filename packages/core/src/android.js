import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANDROID_CLOCK_SKEW_MS,
  BullpayError,
  DEMO_MERCHANT_ID,
  canonicalAndroidPayload,
  encryptString,
  decryptString,
  ensureDir,
  hmacSha256Hex,
  protectPath,
  secretsEqual,
  sha256Hex,
} from "@bullpay/common";
import { clock, iso } from "./time.js";
import { ingestCredit } from "./attribution.js";

/**
 * @param {any} ctx
 * @param {string} deviceId
 */
function secretFile(ctx, deviceId) {
  return join(ctx.dataDir, "android-secrets", deviceId);
}

/**
 * @param {any} ctx
 * @param {string} deviceId
 */
function readDeviceSecret(ctx, deviceId) {
  const file = secretFile(ctx, deviceId);
  if (!existsSync(file)) throw new BullpayError("Unknown device", { status: 401, code: "DEVICE" });
  return decryptString(readFileSync(file, "utf8").trim(), ctx.masterKey);
}

/**
 * @param {any} ctx
 * @param {Record<string, any>} body
 */
function authenticateDevice(ctx, body) {
  const device = ctx.repos.androidDevices.getById(body.deviceId || "");
  if (!device) throw new BullpayError("Unknown device", { status: 401, code: "DEVICE" });
  if (!device.is_active) throw new BullpayError("Device is inactive", { status: 403, code: "DEVICE" });
  const timestamp = Number(body.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(clock(ctx).getTime() - timestamp) > ANDROID_CLOCK_SKEW_MS) {
    throw new BullpayError("Timestamp is outside the allowed window", { status: 401, code: "TIMESTAMP" });
  }
  const expected = hmacSha256Hex(readDeviceSecret(ctx, device.id), canonicalAndroidPayload(body));
  if (!secretsEqual(expected, body.signature || "")) {
    throw new BullpayError("Bad signature", { status: 401, code: "SIGNATURE" });
  }
  return device;
}

/**
 * @param {any} ctx
 * @param {{ merchantId?: string, deviceName?: string, deviceModel?: string }} input
 */
export function enrollAndroidDevice(ctx, input) {
  const id = randomUUID();
  const secret = randomBytes(32).toString("hex");
  const pairingCode = randomBytes(4).toString("hex");
  ctx.repos.androidDevices.insert({
    id,
    merchant_id: input.merchantId || DEMO_MERCHANT_ID,
    device_name: input.deviceName || "Android device",
    device_model: input.deviceModel || null,
    signing_key_hash: sha256Hex(secret),
    is_active: 1,
    created_at: iso(ctx),
  });
  const directory = join(ctx.dataDir, "android-secrets");
  ensureDir(directory, 0o700);
  const file = secretFile(ctx, id);
  writeFileSync(file, encryptString(secret, ctx.masterKey), { encoding: "utf8", mode: 0o600 });
  protectPath(file, 0o600);
  ctx.pairing.set(pairingCode, { deviceId: id, expires: clock(ctx).getTime() + 10 * 60 * 1000 });
  return { deviceId: id, pairingCode, signingSecret: secret };
}

/**
 * @param {any} ctx
 * @param {Buffer} rawBody
 */
export async function ingestAndroidSms(ctx, rawBody) {
  /** @type {Record<string, any>} */
  let body;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new BullpayError("Invalid JSON", { status: 400, code: "BAD_JSON" });
  }
  const device = authenticateDevice(ctx, body);
  ctx.repos.androidDevices.update(device.id, { last_observation_at: iso(ctx) });
  return ingestCredit(ctx, {
    source: "ANDROID_OBSERVER",
    receivingAccountId: body.receivingAccountId,
    upiId: body.upiId,
    amountPaise: body.amountPaise,
    observedAt: body.observedAt || new Date(Number(body.timestamp)).toISOString(),
    sender: body.sender,
    senderVpa: body.senderVpa,
    bankReferenceNumber: body.bankReferenceNumber,
    rawText: body.rawText,
  });
}

/**
 * @param {any} ctx
 * @param {Record<string, any>} body
 */
export function androidHeartbeat(ctx, body) {
  const device = authenticateDevice(ctx, body);
  ctx.repos.androidDevices.update(device.id, { last_heartbeat_at: iso(ctx) });
  return { ok: true, deviceId: device.id };
}
