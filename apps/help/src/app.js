import { createRouter, sendHtml, sendJson } from "@bullpay/common";

const layout = (title, body) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font:16px/1.5 Segoe UI,sans-serif;max-width:720px;margin:32px auto;color:#0f172a">
<nav><a href="/">Script</a> · <a href="/webhook">Webhook</a> · <a href="/failed">Failed payment</a></nav>
${body}
</body></html>`;

/**
 * @param {{ config?: any }} [_options]
 */
export function createHelpApp(_options = {}) {
  const router = createRouter();
  router.get("/health", async (_req, res) => {
    sendJson(res, 200, { ok: true, service: "help" });
  });
  router.get("/", async (_req, res) => {
    sendHtml(res, 200, layout("Add the script", `
      <h1>Add the script</h1>
      <p>Put this on the shop page. There is no live chat.</p>
      <pre>&lt;script src="http://127.0.0.1:7000/bullpay.js" data-bullpay-key="MERCHANT_ID" data-currency="INR"&gt;&lt;/script&gt;</pre>
      <p>A button with <code>data-bullpay-pay</code> must carry the order id, amount, and currency.</p>`));
  });
  router.get("/webhook", async (_req, res) => {
    sendHtml(res, 200, layout("Verify the webhook", `
      <h1>Verify the webhook</h1>
      <p>Read the raw body bytes. Compute HMAC-SHA256 with the merchant webhook secret and compare it to <code>X-Gateway-Signature</code>.</p>
      <p>Fulfill only after the signature matches, the event is SUCCESS, and the bank statement agrees.</p>`));
  });
  router.get("/failed", async (_req, res) => {
    sendHtml(res, 200, layout("Read a FAILED payment", `
      <h1>Read a FAILED payment</h1>
      <p>FAILED means the verification window ended. It does not prove the customer paid, and it does not prove they did not.</p>
      <p>Check the bank statement before treating the payment as lost. A missing or delayed SMS can leave a real payment unmatched.</p>`));
  });
  return (req, res) => router.handle(req, res);
}
