import assert from "node:assert/strict";
import test from "node:test";
import { assertProductionHostname, isPersonalSender, loadConfig, observationFingerprint } from "../src/index.js";

test("production refuses a missing or loopback hostname", () => {
  assert.throws(() => assertProductionHostname(""));
  assert.throws(() => assertProductionHostname("localhost"));
  assert.throws(() => assertProductionHostname("127.0.0.1"));
  assert.doesNotThrow(() => assertProductionHostname("pay.example.com"));
});

test("production checkout URL does not fall back to localhost", () => {
  const config = loadConfig({
    NODE_ENV: "production",
    BULLPAY_MODE: "production",
    PUBLIC_HOSTNAME: "pay.example.com",
    CHECKOUT_ORIGIN: "http://127.0.0.1:7000",
  });
  assert.equal(config.publicCheckoutBase, "https://pay.example.com");
  assert.equal(config.publicCheckoutBase.includes("localhost"), false);
  assert.equal(config.publicCheckoutBase.includes("127.0.0.1"), false);
});

test("personal senders are digit strings of at least 10 digits", () => {
  assert.equal(isPersonalSender("+91 98765 43210"), true);
  assert.equal(isPersonalSender("9876543210"), true);
  assert.equal(isPersonalSender("VM-HDFCBK"), false);
  assert.equal(isPersonalSender("12345"), false);
});

test("observation fingerprints use a five minute bucket", () => {
  const base = {
    receivingAccountId: "acct",
    amountPaise: 100,
    bankReference: "UTR1",
  };
  const a = observationFingerprint({ ...base, observedAt: "2026-01-01T00:00:10.000Z" });
  const b = observationFingerprint({ ...base, observedAt: "2026-01-01T00:04:59.000Z" });
  const c = observationFingerprint({ ...base, observedAt: "2026-01-01T00:05:00.000Z" });
  assert.equal(a, b);
  assert.notEqual(a, c);
});
