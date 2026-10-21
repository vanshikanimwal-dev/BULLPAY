import { DEMO_MERCHANT_ID } from "@bullpay/common";

/**
 * @param {{ checkoutOrigin: string, paymentApiOrigin: string }} options
 */
export function storePage(options) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bullpay sample order</title>
  <style>
    body { margin: 0; font: 16px/1.5 "Segoe UI", system-ui, sans-serif; background: #f8fafc; color: #0f172a; }
    main { max-width: 720px; margin: 40px auto; background: #fff; padding: 28px; border-radius: 20px; }
    .banner { background: #fff7ed; color: #9a3412; padding: 12px 14px; border-radius: 12px; }
    input, button { font: inherit; padding: 12px; border-radius: 12px; }
    button { background: #0f766e; color: white; border: 0; cursor: pointer; }
    a { color: #0f766e; }
  </style>
</head>
<body>
  <main>
    <div class="banner" id="banner" hidden>The receiving UPI id is still a placeholder. replace this in the admin before a real payment.</div>
    <h1>Bullpay sample order</h1>
    <p>Price starting at ₹1.00. This page only opens checkout. It does not decide that the order is paid.</p>
    <label>Custom amount <input id="amount" value="1.00"></label>
    <p><button data-bullpay-pay data-amount="1.00" data-currency="INR">Buy</button></p>
    <p>
      <a href="/order-success">Success preview</a> ·
      <a href="/order-failed">Failed</a> ·
      <a href="/order-suspicious">Suspicious</a> ·
      <a href="/order-expired">Expired</a> ·
      <a href="/order-cancelled">Cancelled</a>
    </p>
  </main>
  <script src="${options.checkoutOrigin}/bullpay.js" data-bullpay-key="${DEMO_MERCHANT_ID}" data-bullpay-api="${options.paymentApiOrigin}" data-currency="INR"></script>
  <script>
    const amount = document.querySelector("#amount");
    const button = document.querySelector("[data-bullpay-pay]");
    amount.addEventListener("input", () => button.setAttribute("data-amount", amount.value));
    const routes = { SUCCESS: "/order-success", FAILED: "/order-failed", SUSPICIOUS: "/order-suspicious", EXPIRED: "/order-expired", CANCELLED: "/order-cancelled" };
    window.addEventListener("bullpay:payment:result", (event) => {
      const detail = event.detail || {};
      const path = routes[detail.status] || "/order-failed";
      location.href = path + "?order_id=" + encodeURIComponent(detail.order_id || "") + "&amount=" + encodeURIComponent(detail.amount_received || "");
    });
    fetch(${JSON.stringify(options.paymentApiOrigin)} + "/api/v1/public/bootstrap").then((response) => response.json()).then((body) => {
      if (body.setupRequired) document.querySelector("#banner").hidden = false;
    }).catch(() => { document.querySelector("#banner").hidden = false; });
  </script>
</body>
</html>`;
}

/**
 * @param {{ kind: string, orderId: string, amount: string }} options
 */
export function resultPage(options) {
  const fulfill = {
    success: "Do not fulfill from this page. Fulfillment follows the webhook, and this page is only a receipt preview.",
    failed: "The shop should not fulfill this order. A failed checkout means the verification window ended.",
    suspicious: "The shop should not fulfill this order. The payment is held for review.",
    expired: "The shop should not fulfill this order. The checkout expired.",
    cancelled: "The shop should not fulfill this order. The checkout was cancelled.",
  };
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Order ${options.kind}</title></head>
<body style="font:16px/1.5 Segoe UI,sans-serif;max-width:680px;margin:40px auto">
  <h1>${options.kind}</h1>
  <p>Order ${options.orderId || "(none)"} · amount ${options.amount || "(none)"}</p>
  <p>${fulfill[options.kind] || fulfill.failed}</p>
  <p><a href="/">Back to the sample order</a></p>
</body></html>`;
}
