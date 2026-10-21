import { createRouter, sendHtml, sendJson } from "@bullpay/common";

/**
 * @param {{ gmail: ReturnType<import('./gmail.js').createGmailClient> }} options
 */
export function createGmailApp(options) {
  const router = createRouter();
  router.get("/health", async (_req, res) => {
    sendJson(res, 200, { ok: true, service: "gmail-observer" });
  });
  router.get("/api/status", async (_req, res) => {
    const status = options.gmail.status();
    sendJson(res, 200, status);
  });
  router.get("/", async (_req, res) => {
    const status = options.gmail.status();
    const sentence = status.configured
      ? (status.connected ? "Gmail is connected." : "Gmail is configured and waiting for OAuth.")
      : "Gmail is not configured.";
    sendHtml(res, 200, `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Gmail observer</title></head><body style="font:16px/1.5 Segoe UI,sans-serif;max-width:680px;margin:40px auto"><h1>Gmail observer</h1><p>${sentence}</p>${status.configured ? '<p><a href="/oauth/start">Connect Gmail</a></p>' : ""}</body></html>`);
  });
  router.get("/oauth/start", async (_req, res) => {
    if (!options.gmail.configured) {
      sendJson(res, 503, { error: "Gmail is not configured" });
      return;
    }
    res.writeHead(302, { location: options.gmail.startUrl() });
    res.end();
  });
  router.get("/oauth/callback", async (_req, res, { url }) => {
    if (!options.gmail.configured) {
      sendJson(res, 503, { error: "Gmail is not configured" });
      return;
    }
    const code = url.searchParams.get("code") || "";
    await options.gmail.exchangeCode(code);
    sendHtml(res, 200, "<!DOCTYPE html><html><body><p>Gmail is connected. You can close this page.</p></body></html>");
  });
  return (req, res) => router.handle(req, res);
}
