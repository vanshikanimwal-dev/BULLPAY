import QRCode from "qrcode";
import {
  BullpayError,
  DEMO_MERCHANT_ID,
  bearerToken,
  createRouter,
  readBody,
  readJson,
  secretsEqual,
  sendJson,
} from "@bullpay/common";

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {Record<string, string>} secrets
 * @param {string} expected
 */
function requireBearer(req, secrets, expected) {
  if (!secretsEqual(bearerToken(req), secrets[expected])) {
    throw new BullpayError("Unauthorized", { status: 401, code: "AUTH" });
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 */
function merchantId(req) {
  const header = req.headers["x-merchant-id"];
  return (Array.isArray(header) ? header[0] : header) || DEMO_MERCHANT_ID;
}

/**
 * @param {string} origin
 */
async function readObserverStatus(origin) {
  try {
    const response = await fetch(`${origin}/api/status`, { signal: AbortSignal.timeout(800) });
    if (!response.ok) return { reachable: false };
    return { reachable: true, ...(await response.json()) };
  } catch {
    return { reachable: false };
  }
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {import('node:http').IncomingMessage} req
 * @param {any} core
 * @param {string} id
 */
function writeEventStream(res, req, core, id) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const send = () => {
    try {
      const state = core.getCheckoutState(id);
      res.write(`data: ${JSON.stringify({
        status: state.status,
        queuePosition: state.queuePosition,
        expiresAt: state.expiresAt,
        processingExpiresAt: state.processingExpiresAt,
      })}\n\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "missing";
      res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
    }
  };
  send();
  const poll = setInterval(send, 1000);
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);
  poll.unref();
  heartbeat.unref();
  req.on("close", () => {
    clearInterval(poll);
    clearInterval(heartbeat);
  });
}

/**
 * @param {{ core: any, secrets: Record<string, string>, config: any }} options
 */
export function createApp(options) {
  const { core, secrets, config } = options;
  const router = createRouter({ env: { PUBLIC_HOSTNAME: config.publicHostname || "" } });

  router.get("/health", async (_req, res) => {
    sendJson(res, 200, { ok: true, service: "payment-api" });
  });

  router.get("/api/v1/public/bootstrap", async (_req, res) => {
    const account = core.getReceivingAccount(DEMO_MERCHANT_ID);
    sendJson(res, 200, {
      businessName: "Bullpay Demo Store",
      branding: core.getBranding(DEMO_MERCHANT_ID),
      setupRequired: account?.upiId === "replace-me@upi",
    });
  });

  router.post("/api/v1/payments", async (req, res) => {
    const body = await readJson(req);
    const payment = await core.createPayment({
      merchantId: merchantId(req),
      idempotencyKey: req.headers["idempotency-key"],
      orderId: body.orderId,
      amount: body.amount,
      currency: body.currency,
      returnUrl: body.returnUrl,
      metadata: body.metadata,
      method: body.method,
      customer: body.customer,
    });
    sendJson(res, 200, payment);
  });

  router.get("/api/v1/payments/:id", async (_req, res, { params }) => {
    sendJson(res, 200, core.getPayment(params.id));
  });

  router.post("/api/v1/checkout/:id/bind-customer", async (req, res, { params }) => {
    const body = await readJson(req);
    sendJson(res, 200, core.bindCustomer(params.id, body.token || bearerToken(req)));
  });

  router.post("/api/v1/checkout/:id/payment-done", async (_req, res, { params }) => {
    sendJson(res, 200, core.markPaymentDone(params.id));
  });

  router.post("/api/v1/checkout/:id/cancel", async (_req, res, { params }) => {
    sendJson(res, 200, await core.cancelPayment(params.id));
  });

  router.post("/api/v1/checkout/:id/select-method", async (req, res, { params }) => {
    const body = await readJson(req);
    sendJson(res, 200, core.selectMethod(params.id, body.method));
  });

  router.post("/api/v1/checkout/:id/confirm-cod", async (req, res, { params }) => {
    sendJson(res, 200, await core.confirmCod(params.id, bearerToken(req)));
  });

  router.get("/api/v1/checkout/:id/state", async (_req, res, { params }) => {
    sendJson(res, 200, core.getCheckoutState(params.id));
  });

  router.get("/api/v1/checkout/:id/qr.svg", async (_req, res, { params }) => {
    const uri = core.upiUriForSession(params.id);
    const svg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    const escaped = uri.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const marked = svg.replace("<svg ", `<svg data-uri="${escaped}" `);
    res.writeHead(200, {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "no-store",
      "content-length": Buffer.byteLength(marked),
    });
    res.end(marked);
  });

  router.get("/api/v1/checkout/:id/stream", async (req, res, { params }) => {
    writeEventStream(res, req, core, params.id);
  });

  router.get("/api/v1/checkout/:id/events", async (req, res, { params }) => {
    writeEventStream(res, req, core, params.id);
  });

  router.post("/api/v1/customer/check-user", async (req, res) => {
    const body = await readJson(req);
    sendJson(res, 200, core.checkUser(body.mobile));
  });

  router.post("/api/v1/customer/register", async (req, res) => {
    const body = await readJson(req);
    sendJson(res, 200, await core.registerCustomer(body));
  });

  router.post("/api/v1/customer/send-otp", async (req, res) => {
    const body = await readJson(req);
    sendJson(res, 200, await core.sendOtp(body.mobile));
  });

  router.post("/api/v1/customer/verify-otp", async (req, res) => {
    const body = await readJson(req);
    sendJson(res, 200, core.verifyOtp({
      mobile: body.mobile,
      code: body.code,
      ip: req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
    }));
  });

  router.post("/api/v1/customer/logout", async (req, res) => {
    sendJson(res, 200, core.logoutCustomer(bearerToken(req)));
  });

  router.get("/api/v1/customer/me", async (req, res) => {
    sendJson(res, 200, core.customerMe(bearerToken(req)));
  });

  router.post("/api/v1/observers/credit", async (req, res) => {
    requireBearer(req, secrets, "OBSERVER_API_TOKEN");
    const body = await readJson(req);
    sendJson(res, 200, await core.ingestCredit(body));
  });

  router.post("/api/v1/observers/sms", async (req, res) => {
    const raw = await readBody(req);
    sendJson(res, 200, await core.ingestAndroidSms(raw));
  });

  router.post("/api/v1/observers/heartbeat", async (req, res) => {
    const body = await readJson(req);
    sendJson(res, 200, core.androidHeartbeat(body));
  });

  router.post("/api/v1/admin/counter-confirm", async (req, res) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    sendJson(res, 200, await core.counterConfirm(await readJson(req)));
  });

  router.post("/api/v1/admin/counter-decline", async (req, res) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    const body = await readJson(req);
    sendJson(res, 200, await core.counterDecline(body.paymentId));
  });

  router.get("/api/v1/admin/operations", async (req, res) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    sendJson(res, 200, core.getOperations(merchantId(req)));
  });

  router.get("/api/v1/admin/counter", async (req, res) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    sendJson(res, 200, { sessions: core.listCounter(merchantId(req)) });
  });

  router.get("/api/v1/admin/receiving-account", async (req, res) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    sendJson(res, 200, core.getReceivingAccount(merchantId(req)));
  });

  router.put("/api/v1/admin/receiving-account", async (req, res) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    sendJson(res, 200, core.updateReceivingAccount(merchantId(req), await readJson(req)));
  });

  router.get("/api/v1/admin/branding", async (req, res) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    sendJson(res, 200, core.getBranding(merchantId(req)));
  });

  router.put("/api/v1/admin/branding", async (req, res) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    sendJson(res, 200, core.updateBranding(merchantId(req), await readJson(req)));
  });

  router.get("/api/v1/admin/payments", async (req, res) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    sendJson(res, 200, { payments: core.listPayments(merchantId(req)) });
  });

  router.get("/api/v1/admin/tickets", async (req, res) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    sendJson(res, 200, { tickets: core.listTickets(merchantId(req)) });
  });

  router.post("/api/v1/admin/tickets/:id/reply", async (req, res, { params }) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    const body = await readJson(req);
    sendJson(res, 200, core.replyTicket(params.id, body.message));
  });

  router.get("/api/v1/admin/customers", async (req, res) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    sendJson(res, 200, { customers: core.listCustomers() });
  });

  router.post("/api/v1/admin/customers/:id/ban", async (req, res, { params }) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    const body = await readJson(req);
    sendJson(res, 200, core.banCustomer(params.id, body.reason));
  });

  router.post("/api/v1/admin/customers/:id/unban", async (req, res, { params }) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    sendJson(res, 200, core.unbanCustomer(params.id));
  });

  router.get("/api/v1/admin/observers", async (req, res) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    const [gmail, sms] = await Promise.all([
      readObserverStatus(config.origins.gmailObserver),
      readObserverStatus(config.origins.smsObserver),
    ]);
    sendJson(res, 200, {
      devices: core.listAndroidDevices(merchantId(req)),
      gmail,
      sms,
      gmailOauthUrl: `${config.origins.gmailObserver}/oauth/start`,
    });
  });

  router.post("/api/v1/admin/android-devices", async (req, res) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    const body = await readJson(req);
    sendJson(res, 200, core.enrollAndroidDevice({
      merchantId: merchantId(req),
      deviceName: body.deviceName,
      deviceModel: body.deviceModel,
    }));
  });

  router.get("/api/v1/admin/whatsapp", async (req, res) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    sendJson(res, 200, core.whatsappStatus());
  });

  router.post("/api/v1/admin/whatsapp/reconnect", async (req, res) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    sendJson(res, 200, core.whatsappReconnect());
  });

  router.post("/api/v1/admin/whatsapp/disconnect", async (req, res) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    sendJson(res, 200, core.whatsappDisconnect());
  });

  router.get("/api/v1/admin/settings", async (req, res) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    sendJson(res, 200, core.getSettings(merchantId(req)));
  });

  router.put("/api/v1/admin/settings", async (req, res) => {
    requireBearer(req, secrets, "ADMIN_API_TOKEN");
    sendJson(res, 200, core.updateSettings(merchantId(req), await readJson(req)));
  });

  router.get("/api/v1/internal/status", async (req, res) => {
    requireBearer(req, secrets, "INTERNAL_SERVICE_TOKEN");
    sendJson(res, 200, core.internalStatus(merchantId(req)));
  });

  router.post("/api/v1/internal/sweep", async (req, res) => {
    requireBearer(req, secrets, "INTERNAL_SERVICE_TOKEN");
    sendJson(res, 200, await core.sweep());
  });

  return (req, res) => router.handle(req, res);
}
