import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { decryptString, DEMO_ACCOUNT_ID, DEMO_MERCHANT_ID, PLACEHOLDER_UPI } from "@bullpay/common";
import { createRepositories, migrate, openDatabase, seedDemo } from "@bullpay/db";
import { createCore } from "../src/index.js";

const masterKey = "ab".repeat(32);

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "bullpay-core-"));
  const db = openDatabase(":memory:");
  migrate(db);
  seedDemo(db, { masterKey, webhookSecret: "whsec-test" });
  const repos = createRepositories(db);
  let clock = new Date("2026-01-01T00:00:00.000Z");
  const sent = [];
  const core = createCore({
    db,
    repos,
    dataDir: dir,
    secrets: {
      ENCRYPTION_MASTER_KEY: masterKey,
      WEBHOOK_SECRET: "whsec-test",
      ADMIN_API_TOKEN: "admin",
      OBSERVER_API_TOKEN: "obs",
      INTERNAL_SERVICE_TOKEN: "int",
    },
    config: {
      activeWindowMs: 300000,
      processingWindowMs: 30000,
      publicCheckoutBase: "http://127.0.0.1:7000",
      mode: "localhost",
      nodeEnv: "test",
      devOtpLog: false,
    },
    now: () => new Date(clock.getTime()),
    transport: async (request) => {
      sent.push(request);
      return { status: 200, body: "ok" };
    },
  });
  return {
    db,
    repos,
    core,
    sent,
    dir,
    now() {
      return new Date(clock.getTime());
    },
    advance(ms) {
      clock = new Date(clock.getTime() + ms);
    },
    close() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function verifiedCustomer(fixture, mobile = "9876543210") {
  await fixture.core.registerCustomer({
    name: "Asha",
    email: `${mobile}@example.com`,
    mobile,
  });
  const row = fixture.repos.customers.getByMobile(mobile);
  const code = decryptString(row.otp_code, masterKey);
  return fixture.core.verifyOtp({ mobile, code });
}

test("a free slot returns an active checkout", async () => {
  const fixture = setup();
  try {
    const payment = await fixture.core.createPayment({
      orderId: "order-1",
      amount: "499.00",
      metadata: { note: "x" },
    });
    assert.equal(payment.status, "ACTIVE");
    assert.equal(payment.amount, "499.00");
    assert.equal(payment.amountPaise, 49900);
    assert.equal(payment.checkoutUrl, `http://127.0.0.1:7000/checkout/${payment.paymentId}`);
  } finally {
    fixture.close();
  }
});

test("a second payment waits, then takes the slot when the first expires", async () => {
  const fixture = setup();
  try {
    const first = await fixture.core.createPayment({ orderId: "first", amount: "1.00" });
    const second = await fixture.core.createPayment({ orderId: "second", amount: "1.00" });
    assert.equal(first.status, "ACTIVE");
    assert.equal(second.status, "QUEUED");
    fixture.advance(300001);
    await fixture.core.sweep();
    assert.equal(fixture.core.getPayment(first.paymentId).status, "EXPIRED");
    const promoted = fixture.core.getPayment(second.paymentId);
    assert.equal(promoted.status, "ACTIVE");
    const actions = fixture.db.prepare("SELECT action FROM audit_logs").all().map((row) => row.action);
    assert.ok(actions.includes("SLOT_RELEASED"));
    assert.ok(actions.includes("QUEUE_PROMOTED"));
    assert.equal(fixture.repos.sessions.getById(first.paymentId).vpa_snapshot, PLACEHOLDER_UPI);
    fixture.core.updateReceivingAccount(DEMO_MERCHANT_ID, { upiId: "shop@upi", payeeName: "Shop" });
    assert.equal(fixture.repos.sessions.getById(second.paymentId).vpa_snapshot, PLACEHOLDER_UPI);
    assert.equal(fixture.repos.accounts.getById(DEMO_ACCOUNT_ID).upi_id, "shop@upi");
  } finally {
    fixture.close();
  }
});

test("a matching observation settles one webhook and a repeat delivery does not send again", async () => {
  const fixture = setup();
  try {
    const payment = await fixture.core.createPayment({
      orderId: "paid-1",
      amount: "499.00",
      metadata: { note: "x" },
    });
    await fixture.core.ingestCredit({
      source: "GMAIL",
      receivingAccountId: DEMO_ACCOUNT_ID,
      amountPaise: 49900,
      bankReferenceNumber: "UTRNEW1",
      rawText: "INR 499.00 credited",
    });
    const settled = fixture.core.getPayment(payment.paymentId);
    assert.equal(settled.status, "SUCCESS");
    assert.equal(settled.verificationTag, "SINGLE_CHANNEL");
    assert.equal(settled.utr, "UTRNEW1");
    const rows = fixture.repos.webhooks.listByPayment(payment.paymentId);
    assert.equal(rows.length, 1);
    assert.equal(fixture.sent.length, 1);
    const body = JSON.parse(fixture.sent[0].body);
    assert.equal(body.amount, "499.00");
    assert.equal(body.amountPaise, 49900);
    assert.deepEqual(body.metadata, { note: "x" });
    await fixture.core.dispatchWebhook(rows[0]);
    assert.equal(fixture.sent.length, 1);
    assert.equal(fixture.repos.webhooks.listByPayment(payment.paymentId).length, 1);
  } finally {
    fixture.close();
  }
});

test("a UTR already used on another success does not settle the new session", async () => {
  const fixture = setup();
  try {
    await fixture.core.createPayment({ orderId: "old", amount: "1.00" });
    await fixture.core.ingestCredit({
      source: "GMAIL",
      receivingAccountId: DEMO_ACCOUNT_ID,
      amountPaise: 100,
      bankReferenceNumber: "SAMEUTR",
      observedAt: "2026-01-01T00:00:30.000Z",
    });
    fixture.advance(6 * 60 * 1000);
    const second = await fixture.core.createPayment({ orderId: "new", amount: "1.00" });
    await fixture.core.ingestCredit({
      source: "GMAIL",
      receivingAccountId: DEMO_ACCOUNT_ID,
      amountPaise: 100,
      bankReferenceNumber: "SAMEUTR",
      observedAt: fixture.now().toISOString(),
    });
    assert.equal(fixture.core.getPayment(second.paymentId).status, "ACTIVE");
    const actions = fixture.db.prepare("SELECT action FROM audit_logs").all().map((row) => row.action);
    assert.ok(actions.includes("REUSED_UTR_REJECTED"));
  } finally {
    fixture.close();
  }
});

test("a personal SMS sender does not settle the session", async () => {
  const fixture = setup();
  try {
    const payment = await fixture.core.createPayment({ orderId: "sms", amount: "2.00" });
    await fixture.core.ingestCredit({
      source: "SMS",
      receivingAccountId: DEMO_ACCOUNT_ID,
      amountPaise: 200,
      bankReferenceNumber: "PERSONAL1",
      sender: "9876543210",
      rawText: "Rs 2.00",
    });
    assert.equal(fixture.core.getPayment(payment.paymentId).status, "ACTIVE");
    assert.equal(fixture.repos.security.listByType("PERSONAL_SMS_REJECTED").length, 1);
  } finally {
    fixture.close();
  }
});

test("a different amount does not settle the session", async () => {
  const fixture = setup();
  try {
    const payment = await fixture.core.createPayment({ orderId: "amount", amount: "3.00" });
    await fixture.core.ingestCredit({
      source: "GMAIL",
      receivingAccountId: DEMO_ACCOUNT_ID,
      amountPaise: 100,
      bankReferenceNumber: "OTHERAMT",
    });
    assert.equal(fixture.core.getPayment(payment.paymentId).status, "ACTIVE");
    assert.equal(fixture.repos.security.listByType("AMOUNT_MISMATCH").length, 1);
  } finally {
    fixture.close();
  }
});

test("an observation after expiry opens a ticket and leaves the session expired", async () => {
  const fixture = setup();
  try {
    const payment = await fixture.core.createPayment({ orderId: "late-order", amount: "4.00" });
    fixture.advance(300001);
    await fixture.core.sweep();
    assert.equal(fixture.core.getPayment(payment.paymentId).status, "EXPIRED");
    await fixture.core.ingestCredit({
      source: "GMAIL",
      receivingAccountId: DEMO_ACCOUNT_ID,
      amountPaise: 400,
      bankReferenceNumber: "LATE1",
    });
    assert.equal(fixture.core.getPayment(payment.paymentId).status, "EXPIRED");
    const tickets = fixture.repos.tickets.listOpen(DEMO_MERCHANT_ID);
    assert.equal(tickets.length, 1);
    assert.match(tickets[0].subject, /late-order/);
  } finally {
    fixture.close();
  }
});

test("confirm-cod stores success with method COD", async () => {
  const fixture = setup();
  try {
    const payment = await fixture.core.createPayment({ orderId: "cod-1", amount: "5.00" });
    const verified = await verifiedCustomer(fixture);
    const state = await fixture.core.confirmCod(payment.paymentId, verified.token);
    assert.equal(state.status, "SUCCESS");
    assert.equal(state.method, "COD");
    const payload = JSON.parse(fixture.repos.webhooks.listByPayment(payment.paymentId)[0].payload);
    assert.equal(payload.event, "SUCCESS");
    assert.equal(payload.method, "COD");
  } finally {
    fixture.close();
  }
});

test("a banned customer cannot bind to a checkout", async () => {
  const fixture = setup();
  try {
    const verified = await verifiedCustomer(fixture, "9123456780");
    fixture.core.banCustomer(verified.customer.id, "fraud");
    const payment = await fixture.core.createPayment({ orderId: "ban-1", amount: "1.00" });
    await assert.rejects(
      async () => fixture.core.bindCustomer(payment.paymentId, verified.token),
      /** @param {any} error */ (error) => error.status === 403,
    );
    await assert.rejects(
      async () => fixture.core.verifyOtp({ mobile: "9123456780", code: "000000" }),
      /** @param {any} error */ (error) => error.status === 403,
    );
  } finally {
    fixture.close();
  }
});
