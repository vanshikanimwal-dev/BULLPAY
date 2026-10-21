import { sha256Hex } from "./crypto.js";
import { FINGERPRINT_BUCKET_MS } from "./constants.js";
import { rupeesToPaise } from "./money.js";

/**
 * @param {string | undefined | null} rawText
 */
export function normalizeAlert(rawText) {
  const normalized = String(rawText ?? "").replace(/\s+/g, " ").trim();
  let amountPaise = null;
  const amountMatch = normalized.match(/(?:₹|rs\.?|inr)\s*:?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
  if (amountMatch) {
    const numeric = amountMatch[1];
    try {
      amountPaise = rupeesToPaise(numeric.includes(".") ? numeric : `${numeric}.00`);
    } catch {
      amountPaise = null;
    }
  }
  const refMatch = normalized.match(
    /\b(?:utr|rrn|ref(?:erence)?(?:\s*no\.?)?)\s*[:\-]?\s*([A-Za-z0-9]{6,})/i,
  );
  return {
    normalized,
    amountPaise,
    bankReferenceNumber: refMatch ? refMatch[1] : "",
  };
}

/**
 * A personal handset sender is digits only, after spaces and plus signs are removed,
 * and at least 10 digits long.
 * @param {unknown} sender
 */
export function isPersonalSender(sender) {
  if (sender == null || sender === "") return false;
  const stripped = String(sender).replace(/[\s+]/g, "");
  return /^[0-9]{10,}$/.test(stripped);
}

/**
 * @param {{ receivingAccountId: string, amountPaise: number, bankReference?: string, observedAt: string | number | Date }} input
 */
export function observationFingerprint(input) {
  const ms = new Date(input.observedAt).getTime();
  const bucket = Math.floor(ms / FINGERPRINT_BUCKET_MS);
  const material = `${input.receivingAccountId}|${input.amountPaise}|${input.bankReference || ""}|${bucket}`;
  return sha256Hex(material);
}
