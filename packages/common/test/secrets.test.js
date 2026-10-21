import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadOrCreateSecret, loadRuntimeSecrets } from "../src/index.js";

test("a missing secret is created once and reused", () => {
  const dir = mkdtempSync(join(tmpdir(), "bullpay-secrets-"));
  try {
    const first = loadOrCreateSecret({ name: "WEBHOOK_SECRET", dataDir: dir, env: {} });
    const second = loadOrCreateSecret({ name: "WEBHOOK_SECRET", dataDir: dir, env: {} });
    assert.equal(first, second);
    assert.equal(first.length, 64);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an invalid encryption master key is rejected", () => {
  const dir = mkdtempSync(join(tmpdir(), "bullpay-secrets-"));
  try {
    assert.throws(() =>
      loadRuntimeSecrets(dir, {
        ENCRYPTION_MASTER_KEY: "too-short",
        WEBHOOK_SECRET: "w",
        ADMIN_API_TOKEN: "a",
        OBSERVER_API_TOKEN: "o",
        INTERNAL_SERVICE_TOKEN: "i",
      }),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
