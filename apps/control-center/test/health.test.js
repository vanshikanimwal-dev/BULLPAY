import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createSupervisorApp } from "../src/supervisor.js";

test("the supervisor health check and process list report up or down", async () => {
  const children = new Map([
    ["payment-api", { name: "payment-api", port: 6100, up: true }],
    ["help", { name: "help", port: 3000, up: false }],
  ]);
  const server = createServer(createSupervisorApp({ children }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal((await health.json()).ok, true);
    const page = await fetch(`http://127.0.0.1:${port}/`);
    const html = await page.text();
    assert.match(html, /payment-api/);
    assert.match(html, /6100/);
    assert.match(html, /up/);
    assert.match(html, /down/);
  } finally {
    await new Promise((resolve) => server.close(() => resolve(undefined)));
  }
});
