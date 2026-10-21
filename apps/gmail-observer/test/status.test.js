import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createGmailApp } from "../src/app.js";
import { createGmailClient } from "../src/gmail.js";

test("the status page says not configured when Gmail credentials are missing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bullpay-gmail-"));
  const gmail = createGmailClient({
    config: {
      dataDir: dir,
      gmailClientId: "",
      gmailClientSecret: "",
      gmailRedirectUri: "",
      gmailPollIntervalMs: 5000,
    },
    masterKey: "ab".repeat(32),
    postCredit: async () => ({}),
  });
  const server = createServer(createGmailApp({ gmail }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.match(await page.text(), /not configured/);
    const status = await fetch(`http://127.0.0.1:${port}/api/status`);
    assert.deepEqual(await status.json(), { configured: false, connected: false });
  } finally {
    await new Promise((resolve) => server.close(() => resolve(undefined)));
    rmSync(dir, { recursive: true, force: true });
  }
});
