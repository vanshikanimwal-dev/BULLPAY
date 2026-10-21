import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const ENCRYPTED_PREFIX = "enc:v1:";

/**
 * @param {string} value
 */
export function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * @param {string} masterKeyHex
 */
function masterKeyBuffer(masterKeyHex) {
  if (!/^[0-9a-fA-F]{64}$/.test(masterKeyHex || "")) {
    throw new Error("ENCRYPTION_MASTER_KEY must be 64 hex characters");
  }
  return Buffer.from(masterKeyHex, "hex");
}

/**
 * Encrypt a string with AES-256-GCM. An already encrypted value is unchanged.
 * Stored form: enc:v1:<iv hex>:<auth tag hex>:<ciphertext hex>
 * @param {string} plaintext
 * @param {string} masterKeyHex
 */
export function encryptString(plaintext, masterKeyHex) {
  if (typeof plaintext !== "string") {
    throw new Error("Plaintext must be a string");
  }
  if (isEncrypted(plaintext)) return plaintext;
  const key = masterKeyBuffer(masterKeyHex);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTED_PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/**
 * @param {string} stored
 * @param {string} masterKeyHex
 */
export function decryptString(stored, masterKeyHex) {
  if (!isEncrypted(stored)) {
    throw new Error("Value is not encrypted");
  }
  const body = stored.slice(ENCRYPTED_PREFIX.length);
  const [ivHex, tagHex, cipherHex] = body.split(":");
  if (!ivHex || !tagHex || !cipherHex) {
    throw new Error("Encrypted value is malformed");
  }
  const key = masterKeyBuffer(masterKeyHex);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, "hex")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/**
 * @param {string | Buffer} value
 */
export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * @param {string | Buffer} secret
 * @param {string | Buffer} data
 */
export function hmacSha256Hex(secret, data) {
  return createHmac("sha256", secret).update(data).digest("hex");
}

/**
 * HMAC digest for customer and device tokens. The raw token is not stored.
 * @param {string} token
 * @param {string} key
 */
export function tokenDigest(token, key) {
  return hmacSha256Hex(key, String(token));
}

/**
 * Length-independent secret compare: SHA-256 both sides, then timingSafeEqual.
 * @param {unknown} left
 * @param {unknown} right
 */
export function secretsEqual(left, right) {
  const a = createHash("sha256").update(String(left)).digest();
  const b = createHash("sha256").update(String(right)).digest();
  return timingSafeEqual(a, b);
}

/**
 * @param {string | Buffer} rawBody
 * @param {string} secret
 */
export function signBody(rawBody, secret) {
  const bytes = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
  return `sha256=${hmacSha256Hex(secret, bytes)}`;
}

/**
 * @param {string | Buffer} rawBody
 * @param {string | undefined} signatureHeader
 * @param {string} secret
 */
export function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = signBody(rawBody, secret);
  return secretsEqual(expected, signatureHeader);
}

/**
 * Stable JSON without a signature field, used as the Android HMAC input.
 * @param {Record<string, unknown>} fields
 */
export function canonicalAndroidPayload(fields) {
  const copy = { ...fields };
  delete copy.signature;
  /** @type {Record<string, unknown>} */
  const ordered = {};
  for (const key of Object.keys(copy).sort()) {
    ordered[key] = copy[key];
  }
  return JSON.stringify(ordered);
}
