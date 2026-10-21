import { createRouter, sendHtml, sendJson } from "@bullpay/common";
import { browserScriptSource } from "@bullpay/merchant-sdk";
import { checkoutPage } from "./page.js";

/**
 * @param {{ config: any }} options
 */
export function createCheckoutApp(options) {
  const router = createRouter({ env: { PUBLIC_HOSTNAME: options.config.publicHostname || "" } });
  const script = browserScriptSource();
  router.get("/health", async (_req, res) => {
    sendJson(res, 200, { ok: true, service: "checkout-portal" });
  });
  router.get("/bullpay.js", async (_req, res) => {
    res.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
      "content-length": Buffer.byteLength(script),
    });
    res.end(script);
  });
  router.get("/checkout/:id", async (_req, res, { params }) => {
    const html = checkoutPage({
      apiOrigin: options.config.origins.paymentApi,
      paymentId: params.id,
    });
    sendHtml(res, 200, html, {
      "content-security-policy": `frame-ancestors ${options.config.frameAncestors}`,
    });
  });
  return (req, res) => router.handle(req, res);
}
