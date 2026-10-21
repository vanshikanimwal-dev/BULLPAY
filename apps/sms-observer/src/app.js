import { bearerToken, createRouter, readJson, secretsEqual, sendHtml, sendJson } from "@bullpay/common";

/**
 * @param {{ config: any, observerToken: string, forward: (body: Record<string, unknown>) => Promise<unknown> }} options
 */
export function createSmsApp(options) {
  const router = createRouter();
  router.get("/health", async (_req, res) => {
    sendJson(res, 200, { ok: true, service: "sms-observer" });
  });
  router.get("/api/status", async (_req, res) => {
    sendJson(res, 200, {
      browserObserverEnabled: options.config.enableBrowserObserver,
      developmentTestPost: options.config.mode === "localhost" && options.config.nodeEnv !== "production",
    });
  });
  router.get("/", async (_req, res) => {
    const enabled = options.config.enableBrowserObserver;
    sendHtml(res, 200, `<!DOCTYPE html><html><head><meta charset="utf-8"><title>SMS observer</title></head>
<body style="font:16px/1.5 Segoe UI,sans-serif;max-width:680px;margin:40px auto">
<h1>SMS observer</h1>
<p>A real Google Messages browser session is optional and off unless ENABLE_BROWSER_OBSERVER=true.</p>
<p>Browser observer: ${enabled ? "on" : "off"}.</p>
<p>In local development, a manual test post from this machine can forward a credit as GOOGLE_MESSAGES. Production rejects that test post.</p>
</body></html>`);
  });
  router.post("/api/test-credit", async (req, res) => {
    if (options.config.mode !== "localhost" || options.config.nodeEnv === "production") {
      sendJson(res, 403, { error: "Test post is only available in local development" });
      return;
    }
    const remote = req.socket.remoteAddress || "";
    if (remote !== "127.0.0.1" && remote !== "::ffff:127.0.0.1" && remote !== "::1") {
      sendJson(res, 403, { error: "Localhost only" });
      return;
    }
    if (!secretsEqual(bearerToken(req), options.observerToken)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }
    const body = await readJson(req);
    const result = await options.forward({ ...body, source: "GOOGLE_MESSAGES" });
    sendJson(res, 200, result);
  });
  return (req, res) => router.handle(req, res);
}
