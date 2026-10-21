import { createRouter, sendHtml, sendJson } from "@bullpay/common";
import { adminPage } from "./page.js";

/**
 * @param {{ config: any }} options
 */
export function createAdminApp(options) {
  const router = createRouter({ env: { PUBLIC_HOSTNAME: options.config.publicHostname || "" } });
  router.get("/health", async (_req, res) => {
    sendJson(res, 200, { ok: true, service: "merchant-admin" });
  });
  router.get("/", async (_req, res) => {
    sendHtml(res, 200, adminPage({ apiOrigin: options.config.origins.paymentApi }));
  });
  return (req, res) => router.handle(req, res);
}
