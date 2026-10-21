# Merchant integration

The shop page loads the checkout script and sends four fields: the merchant id, the order id, the amount, and the currency.

```html
<script src="http://127.0.0.1:7000/bullpay.js" data-bullpay-key="00000000-0000-4000-8000-000000000001" data-currency="INR"></script>
<button
  data-bullpay-pay
  data-order-id="order-1001"
  data-amount="499.00"
  data-currency="INR"
>Pay</button>
```

You can also call the script directly:

```html
<script>
  Bullpay.pay({
    order_id: "order-1001",
    amount: "499.00",
    currency: "INR",
    customer: { name: "Asha", email: "asha@shop.example", mobile: "9876543210" },
    metadata: { cart: "A" },
    handler: function (detail) {
      // Detail is for the shop user interface. It is not proof of payment.
      console.log(detail.status, detail.order_id);
    },
    onClose: function () {}
  });
</script>
```

`handler` receives `{ status, order_id, amount_received, payment_mode, utr, timestamp, metadata }`. The same object is dispatched on `window` as `bullpay:payment:success`, `bullpay:payment:failed`, `bullpay:payment:suspicious`, `bullpay:payment:expired`, `bullpay:payment:cancelled`, and `bullpay:payment:result` for every outcome.

The script does not decide that an order is paid. Fulfill an order only after the signed webhook verifies and you have reconciled SUCCESS against the bank statement.

## Webhook

BULLPAY POSTs the raw JSON body to the merchant webhook URL.

Headers:

- `Content-Type: application/json`
- `X-Gateway-Event`
- `X-Gateway-Signature` — `sha256=` plus the HMAC-SHA256 hex of the exact raw body
- `X-Gateway-Delivery-Id`
- `X-Gateway-Timestamp` — Unix time in milliseconds

Body fields: `event`, `paymentId`, `orderId`, `amount`, `amountPaise`, `currency`, `method`, `utr`, `completedAt`, `metadata`.

`amount` is a rupee string. `amountPaise` is an integer. `metadata` is the object you sent, unchanged. `utr` is an empty string when there is no bank reference.

A repeated `X-Gateway-Delivery-Id` must be treated as already handled.

COD, cash at the till, and card at the counter can be `SUCCESS` with that method. The demo store records them and sets `paid` only when `event` is `SUCCESS` and `method` is `UPI`.

## Verify the raw body in Node.js

Sign the bytes you received. Do not parse the JSON and stringify it again before checking the signature.

```js
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { createServer } from "node:http";

function secretsEqual(left, right) {
  const a = createHash("sha256").update(String(left)).digest();
  const b = createHash("sha256").update(String(right)).digest();
  return timingSafeEqual(a, b);
}

createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks);
  const signature = req.headers["x-gateway-signature"];
  const expected = "sha256=" + createHmac("sha256", process.env.WEBHOOK_SECRET).update(rawBody).digest("hex");
  if (!secretsEqual(expected, signature || "")) {
    res.writeHead(401);
    res.end();
    return;
  }
  const event = JSON.parse(rawBody.toString("utf8"));
  const paid = event.event === "SUCCESS" && event.method === "UPI";
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ orderId: event.orderId, paid }));
}).listen(5000, "127.0.0.1");
```
