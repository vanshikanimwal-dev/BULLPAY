import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createHelpApp } from "../src/app.js";

test("help pages explain the script, the webhook, and a failed payment", async () => {
  const server = createServer(createHelpApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const home = await fetch(`http://127.0.0.1:${port}/`);
    assert.match(await home.text(), /data-bullpay-key/);
    const webhook = await fetch(`http://127.0.0.1:${port}/webhook`);
    assert.match(await webhook.text(), /raw body/);
    const failed = await fetch(`http://127.0.0.1:${port}/failed`);
    const text = await failed.text();
    assert.match(text, /FAILED/);
    assert.equal(text.toLowerCase().includes("live chat"), false);
  } finally {
    await new Promise((resolve) => server.close(() => resolve(undefined)));
  }
});
