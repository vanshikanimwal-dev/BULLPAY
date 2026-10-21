import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptString,
  encryptString,
  secretsEqual,
  signBody,
  verifySignature,
} from "../src/index.js";

const key = "ab".repeat(32);

test("AES-GCM round trip and already encrypted values stay unchanged", () => {
  const stored = encryptString("otp-123456", key);
  assert.equal(stored.startsWith("enc:v1:"), true);
  assert.equal(decryptString(stored, key), "otp-123456");
  assert.equal(encryptString(stored, key), stored);
});

test("secret compare does not depend on the original length", () => {
  assert.equal(secretsEqual("short", "short"), true);
  assert.equal(secretsEqual("short", "a-much-longer-secret"), false);
});

test("HMAC verification rejects a body changed after signing", () => {
  const body = Buffer.from('{"event":"SUCCESS","amount":"499.00"}');
  const signature = signBody(body, "whsec");
  assert.equal(verifySignature(body, signature, "whsec"), true);
  const changed = Buffer.from('{"event":"SUCCESS","amount":"499.01"}');
  assert.equal(verifySignature(changed, signature, "whsec"), false);
  assert.equal(verifySignature(body, signature, "other-secret"), false);
});
