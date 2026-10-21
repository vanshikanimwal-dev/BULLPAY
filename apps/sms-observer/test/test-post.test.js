import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createSmsApp } from "../src/app.js";

/**
 * @param {any} config
 */
async function start(config) {
  const forwarded = [];
  const server = createServer(createSmsApp({
    config,
    observerToken: "observer-token",
    forward: async (body) => {
      forwarded.push(body);
      return { ok: true };
    },
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    forwarded,
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve(undefined))),
  };
}

test("production rejects the manual SMS test post", async () => {
  const server = await start({ mode: "production", nodeEnv: "production", enableBrowserObserver: false });
  try {
    const response = await fetch(`${server.base}/api/test-credit`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer observer-token" },
      body: JSON.stringify({ amountPaise: 100 }),
    });
    assert.equal(response.status, 403);
    assert.equal(server.forwarded.length, 0);
  } finally {
    await server.close();
  }
});

test("local development forwards a test credit as Google Messages", async () => {
  const server = await start({ mode: "localhost", nodeEnv: "development", enableBrowserObserver: false });
  try {
    const response = await fetch(`${server.base}/api/test-credit`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer observer-token" },
      body: JSON.stringify({ amountPaise: 100, rawText: "Rs 1.00" }),
    });
    assert.equal(response.status, 200);
    assert.equal(server.forwarded[0].source, "GOOGLE_MESSAGES");
    const page = await fetch(`${server.base}/`);
    assert.match(await page.text(), /ENABLE_BROWSER_OBSERVER=true/);
  } finally {
    await server.close();
  }
});
