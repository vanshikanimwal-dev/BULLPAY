import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { decryptString, DEMO_ACCOUNT_ID } from "@bullpay/common";
import { createCore } from "@bullpay/core";
import { createRepositories, migrate, openDatabase, seedDemo } from "@bullpay/db";
import { createApp } from "../src/app.js";

const masterKey = "ef".repeat(32);

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "bullpay-api-"));
  const db = openDatabase(":memory:");
  migrate(db);
  seedDemo(db, { masterKey, webhookSecret: "whsec-test" });
  const repos = createRepositories(db);
  let clock = new Date("2026-01-01T00:00:00.000Z");
  const secrets = {
    ENCRYPTION_MASTER_KEY: masterKey,
    WEBHOOK_SECRET: "whsec-test",
    ADMIN_API_TOKEN: "admin-test-token",
    OBSERVER_API_TOKEN: "observer-test-token",
    INTERNAL_SERVICE_TOKEN: "internal-test-token",
  };
  const config = {
    activeWindowMs: 300000,
    processingWindowMs: 30000,
    publicCheckoutBase: "http://127.0.0.1:7000",
    mode: "localhost",
    nodeEnv: "test",
    devOtpLog: false,
    publicHostname: "",
    origins: {
      gmailObserver: "http://127.0.0.1:6003",
      smsObserver: "http://127.0.0.1:6002",
    },
  };
  const core = createCore({
    db,
    repos,
    dataDir: dir,
    secrets,
    config,
    now: () => new Date(clock.getTime()),
    transport: async () => ({ status: 200, body: "ok" }),
  });
  return {
    db,
    repos,
    core,
    secrets,
    config,
    advance(ms) {
      clock = new Date(clock.getTime() + ms);
    },
    close() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * @param {ReturnType<typeof setup>} fixture
 */
async function listen(fixture) {
  const server = createServer(createApp(fixture));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    base: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
      fixture.close();
    },
  };
}

test("HTTP create payment is active and the state hides the UPI id", async () => {
  const fixture = setup();
  const server = await listen(fixture);
  try {
    const created = await fetch(`${server.base}/api/v1/payments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "http-1", amount: "499.00", currency: "INR" }),
    });
    const payment = await created.json();
    assert.equal(created.status, 200);
    assert.equal(payment.status, "ACTIVE");
    assert.equal(payment.amountPaise, 49900);
    assert.match(payment.checkoutUrl, /^http:\/\/127\.0\.0\.1:7000\/checkout\//);
    const stateResponse = await fetch(`${server.base}/api/v1/checkout/${payment.paymentId}/state`);
    const state = await stateResponse.json();
    assert.equal(JSON.stringify(state).includes("replace-me@upi"), false);
    assert.equal(state.setupRequired, true);
    assert.equal(state.payeeName, "Bullpay Demo Store");
    const qr = await fetch(`${server.base}/api/v1/checkout/${payment.paymentId}/qr.svg`);
    const svg = await qr.text();
    assert.equal(qr.status, 200);
    assert.match(svg, /<svg/);
    assert.match(svg, /upi:\/\/pay/);
    const queuedResponse = await fetch(`${server.base}/api/v1/payments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "http-2", amount: "1.00" }),
    });
    const queued = await queuedResponse.json();
    assert.equal(queued.status, "QUEUED");
    fixture.advance(300001);
    const sweep = await fetch(`${server.base}/api/v1/internal/sweep`, {
      method: "POST",
      headers: { authorization: "Bearer internal-test-token" },
    });
    assert.equal(sweep.status, 200);
    const promoted = await fetch(`${server.base}/api/v1/payments/${queued.paymentId}`);
    assert.equal((await promoted.json()).status, "ACTIVE");
  } finally {
    await server.close();
  }
});

test("HTTP attribution, cash on delivery, and a banned bind", async () => {
  const fixture = setup();
  const server = await listen(fixture);
  try {
    const created = await fetch(`${server.base}/api/v1/payments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "attr-1", amount: "10.00" }),
    });
    const payment = await created.json();
    const denied = await fetch(`${server.base}/api/v1/observers/credit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(denied.status, 401);
    const credit = await fetch(`${server.base}/api/v1/observers/credit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer observer-test-token",
      },
      body: JSON.stringify({
        source: "GMAIL",
        receivingAccountId: DEMO_ACCOUNT_ID,
        amountPaise: 1000,
        bankReferenceNumber: "HTTPUTR1",
      }),
    });
    assert.equal(credit.status, 200);
    const settled = await fetch(`${server.base}/api/v1/payments/${payment.paymentId}`);
    const settledBody = await settled.json();
    assert.equal(settledBody.status, "SUCCESS");
    assert.equal(settledBody.verificationTag, "SINGLE_CHANNEL");
    assert.equal(settledBody.utr, "HTTPUTR1");

    const cod = await fetch(`${server.base}/api/v1/payments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "cod-http", amount: "6.00" }),
    });
    const codPayment = await cod.json();
    await fetch(`${server.base}/api/v1/customer/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Asha", email: "asha-http@example.com", mobile: "9988776655" }),
    });
    const code = decryptString(fixture.repos.customers.getByMobile("9988776655").otp_code, masterKey);
    const verified = await fetch(`${server.base}/api/v1/customer/verify-otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mobile: "9988776655", code }),
    });
    const session = await verified.json();
    const confirmed = await fetch(`${server.base}/api/v1/checkout/${codPayment.paymentId}/confirm-cod`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.token}` },
    });
    const confirmedBody = await confirmed.json();
    assert.equal(confirmed.status, 200);
    assert.equal(confirmedBody.status, "SUCCESS");
    assert.equal(confirmedBody.method, "COD");

    const bannedPayment = await fetch(`${server.base}/api/v1/payments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "ban-http", amount: "1.00" }),
    });
    const bannedBody = await bannedPayment.json();
    const ban = await fetch(`${server.base}/api/v1/admin/customers/${session.customer.id}/ban`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer admin-test-token",
      },
      body: JSON.stringify({ reason: "fraud" }),
    });
    assert.equal(ban.status, 200);
    const bind = await fetch(`${server.base}/api/v1/checkout/${bannedBody.paymentId}/bind-customer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: session.token }),
    });
    assert.equal(bind.status, 403);
  } finally {
    await server.close();
  }
});
