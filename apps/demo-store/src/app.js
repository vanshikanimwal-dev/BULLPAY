import { createRouter, readBody, sendHtml, sendJson } from "@bullpay/common";
import { resultPage, storePage } from "./pages.js";
import { applyWebhook } from "./webhook.js";

/**
 * @param {{ config: any, secret: string, orders?: Map<string, any>, seen?: Set<string> }} options
 */
export function createDemoApp(options) {
  const orders = options.orders || new Map();
  const seen = options.seen || new Set();
  const router = createRouter({ env: { PUBLIC_HOSTNAME: options.config.publicHostname || "" } });
  router.get("/health", async (_req, res) => {
    sendJson(res, 200, { ok: true, service: "demo-store" });
  });
  router.get("/", async (_req, res) => {
    sendHtml(res, 200, storePage({
      checkoutOrigin: options.config.origins.checkout,
      paymentApiOrigin: options.config.origins.paymentApi,
    }));
  });
  for (const kind of ["success", "failed", "suspicious", "expired", "cancelled"]) {
    router.get(`/order-${kind}`, async (_req, res, { url }) => {
      sendHtml(res, 200, resultPage({
        kind,
        orderId: url.searchParams.get("order_id") || "",
        amount: url.searchParams.get("amount") || "",
      }));
    });
  }
  router.post("/api/webhook", async (req, res) => {
    const rawBody = await readBody(req);
    const result = applyWebhook({
      rawBody,
      signature: header(req, "x-gateway-signature"),
      deliveryId: header(req, "x-gateway-delivery-id"),
      secret: options.secret,
      orders,
      seen,
    });
    sendJson(res, result.status, { ok: result.status === 200, duplicate: result.duplicate });
  });
  router.get("/api/orders/:orderId", async (_req, res, { params }) => {
    const order = orders.get(params.orderId);
    if (!order) {
      sendJson(res, 404, { error: "Order not found" });
      return;
    }
    sendJson(res, 200, order);
  });
  return (req, res) => router.handle(req, res);
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {string} name
 */
function header(req, name) {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
