# BULLPAY

BULLPAY is experimental software. It is not a bank. It is not an NPCI-approved or RBI-licensed payment aggregator. It is not affiliated with any bank or UPI app. A browser event is only for the shop’s user interface. The merchant fulfills an order only after verifying the signed webhook, and still reconciles SUCCESS against the bank statement. A missing or delayed SMS can leave a real payment unmatched. Use a test UPI ID while learning the software.

BULLPAY is a self-hosted checkout for one Indian merchant. The customer pays with a normal UPI app. The rupees land in the merchant’s own UPI ID. BULLPAY does not hold a balance, does not move money, and does not call a bank or NPCI API. It marks a checkout paid only when a bank credit alert matches that one open session.

The browser script does not decide that an order is paid.

## Run on Windows

PowerShell is the shell used for these steps. Node.js 24 or newer is required.

```powershell
node -v
npm install
npm run dev
```

The first boot creates `data/bullpay.sqlite`, generates any missing secrets under `data/.secrets`, and seeds the demo merchant. The receiving UPI id starts as `replace-me@upi`. The demo store and the checkout show a banner until you replace it in the admin before a real payment.

Stop everything with Ctrl+C. That stops the supervisor and its child processes.

## Local URLs

| Service | URL |
| --- | --- |
| Demo store | http://127.0.0.1:5000 |
| Payment API | http://127.0.0.1:6100 |
| Checkout portal | http://127.0.0.1:7000 |
| Merchant admin | http://127.0.0.1:6001 |
| SMS observer | http://127.0.0.1:6002 |
| Gmail observer | http://127.0.0.1:6003 |
| Help | http://127.0.0.1:3000 |
| Supervisor | http://127.0.0.1:8090 |

Paste `ADMIN_API_TOKEN` into the admin page. The value is printed nowhere. If you did not set it, read the generated file `data/.secrets/ADMIN_API_TOKEN`.

## Embed snippet

```html
<script src="http://127.0.0.1:7000/bullpay.js" data-bullpay-key="00000000-0000-4000-8000-000000000001" data-currency="INR"></script>
<button data-bullpay-pay data-order-id="order-1001" data-amount="499.00" data-currency="INR">Pay</button>
```

`bullpay:payment:success` and the other browser events are for the shop’s user interface. Fulfillment follows the signed webhook. See `docs/MERCHANT_INTEGRATION.md`.

## Production

`npm start` refuses to boot unless `PUBLIC_HOSTNAME` is a real hostname. It does not fall back to localhost.

## More

- `docs/CONFIGURATION.md` lists every environment variable.
- `docs/OBSERVERS.md` covers Gmail and Android alerts.
- `docs/OPERATIONS.md` covers the sqlite file, stopping the supervisor, and backups.
