import assert from "node:assert/strict";
import test from "node:test";
import { signBody } from "@bullpay/common";
import { applyWebhook } from "../src/webhook.js";

test("COD success is recorded and is not marked paid", () => {
  const orders = new Map();
  const seen = new Set();
  const rawBody = Buffer.from(JSON.stringify({
    event: "SUCCESS",
    orderId: "cod-1",
    method: "COD",
    amount: "5.00",
    amountPaise: 500,
  }));
  const signature = signBody(rawBody, "secret");
  const first = applyWebhook({ rawBody, signature, deliveryId: "delivery-1", secret: "secret", orders, seen });
  assert.equal(first.status, 200);
  assert.equal(orders.get("cod-1").paid, false);
  assert.equal(orders.get("cod-1").method, "COD");
  const repeat = applyWebhook({ rawBody, signature, deliveryId: "delivery-1", secret: "secret", orders, seen });
  assert.equal(repeat.duplicate, true);
  assert.equal(orders.size, 1);
});

test("a changed body fails HMAC and UPI success is the only paid state", () => {
  const orders = new Map();
  const seen = new Set();
  const rawBody = Buffer.from(JSON.stringify({ event: "SUCCESS", orderId: "upi-1", method: "UPI" }));
  const signature = signBody(rawBody, "secret");
  const changed = Buffer.from(JSON.stringify({ event: "SUCCESS", orderId: "upi-1", method: "COD" }));
  assert.equal(applyWebhook({
    rawBody: changed,
    signature,
    deliveryId: "delivery-2",
    secret: "secret",
    orders,
    seen,
  }).status, 401);
  applyWebhook({ rawBody, signature, deliveryId: "delivery-2", secret: "secret", orders, seen });
  assert.equal(orders.get("upi-1").paid, true);
});
