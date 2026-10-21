import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { decryptString, DEMO_ACCOUNT_ID, DEMO_MERCHANT_ID, PLACEHOLDER_UPI } from "@bullpay/common";
import { createRepositories, migrate, openDatabase, seedDemo } from "../src/index.js";

const masterKey = "cd".repeat(32);

function memoryDb() {
  const db = openDatabase(":memory:");
  migrate(db);
  seedDemo(db, { masterKey, webhookSecret: "whsec-demo" });
  return db;
}

test("pragmas and the demo seed are applied", () => {
  const db = memoryDb();
  assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  assert.equal(db.prepare("PRAGMA busy_timeout").get().timeout, 5000);
  const merchant = db.prepare("SELECT * FROM merchants WHERE id = ?").get(DEMO_MERCHANT_ID);
  assert.equal(merchant.business_name, "Bullpay Demo Store");
  assert.equal(merchant.slug, "demo-store");
  assert.equal(merchant.webhook_url, "http://127.0.0.1:5000/api/webhook");
  assert.equal(decryptString(merchant.webhook_secret, masterKey), "whsec-demo");
  const branding = JSON.parse(merchant.branding);
  assert.equal(branding.appName, "Bullpay");
  assert.equal(branding.primaryColor, "#0f766e");
  assert.equal(branding.logoUrl, null);
  const account = db.prepare("SELECT * FROM payment_receiving_accounts WHERE id = ?").get(DEMO_ACCOUNT_ID);
  assert.equal(account.upi_id, PLACEHOLDER_UPI);
  assert.equal(account.payee_name, "Bullpay Demo Store");
  assert.equal(account.is_active, 1);
  assert.equal(account.is_slot_busy, 0);
  assert.equal(seedDemo(db, { masterKey, webhookSecret: "whsec-demo" }).created, false);
  db.close();
});

test("one open order and one busy slot are enforced", () => {
  const db = memoryDb();
  const repos = createRepositories(db);
  const now = new Date().toISOString();
  repos.sessions.insert({
    id: "sess-a",
    merchant_id: DEMO_MERCHANT_ID,
    receiving_account_id: DEMO_ACCOUNT_ID,
    order_id: "order-1",
    amount_paise: 100,
    status: "ACTIVE",
    created_at: now,
    updated_at: now,
  });
  assert.throws(() =>
    repos.sessions.insert({
      id: "sess-b",
      merchant_id: DEMO_MERCHANT_ID,
      receiving_account_id: DEMO_ACCOUNT_ID,
      order_id: "order-1",
      amount_paise: 100,
      status: "SUCCESS",
      created_at: now,
      updated_at: now,
    }),
  );
  repos.sessions.insert({
    id: "sess-c",
    merchant_id: DEMO_MERCHANT_ID,
    order_id: "order-1",
    amount_paise: 100,
    status: "FAILED",
    created_at: now,
    updated_at: now,
  });
  assert.throws(() =>
    repos.sessions.insert({
      id: "sess-d",
      merchant_id: DEMO_MERCHANT_ID,
      receiving_account_id: DEMO_ACCOUNT_ID,
      order_id: "order-2",
      amount_paise: 200,
      status: "PROCESSING",
      created_at: now,
      updated_at: now,
    }),
  );
  repos.sessions.insert({
    id: "sess-e",
    merchant_id: DEMO_MERCHANT_ID,
    receiving_account_id: DEMO_ACCOUNT_ID,
    order_id: "order-2",
    amount_paise: 200,
    status: "QUEUED",
    queue_position: 1,
    created_at: now,
    updated_at: now,
  });
  assert.equal(repos.sessions.findSlotHolder(DEMO_ACCOUNT_ID).id, "sess-a");
  assert.equal(repos.sessions.oldestQueued(DEMO_ACCOUNT_ID).id, "sess-e");
  db.close();
});

test("a temp sqlite file can be removed after the test", () => {
  const dir = mkdtempSync(join(tmpdir(), "bullpay-db-"));
  const file = join(dir, "t.sqlite");
  try {
    const db = openDatabase(file);
    migrate(db);
    seedDemo(db, { masterKey, webhookSecret: "whsec-demo" });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM merchants").get().n, 1);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
