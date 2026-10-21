import { readFileSync } from "node:fs";
import { verifySignature } from "@bullpay/common";

export function browserScriptSource() {
  return readFileSync(new URL("../browser/bullpay.js", import.meta.url), "utf8");
}

/**
 * Verify a BULLPAY webhook using the exact raw body bytes.
 * @param {{ rawBody: Buffer | string, signatureHeader: string | undefined, secret: string }} input
 */
export function verifyAndParseWebhook(input) {
  const rawBody = Buffer.isBuffer(input.rawBody) ? input.rawBody : Buffer.from(String(input.rawBody));
  if (!verifySignature(rawBody, input.signatureHeader, input.secret)) {
    return { ok: false };
  }
  return { ok: true, event: JSON.parse(rawBody.toString("utf8")) };
}
