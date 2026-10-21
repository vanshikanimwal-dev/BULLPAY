# Configuration

Every environment variable read by BULLPAY is listed here. Empty secret variables are created once as 64-character hex under `data/.secrets/<NAME>` and reused. Copy `.env.example` to `.env` for local overrides.

| Variable | Purpose |
| --- | --- |
| `BULLPAY_MODE` | `localhost` or `production`. `npm run dev` sets `localhost`. `npm start` sets `production`. |
| `NODE_ENV` | `development` for local OTP logging and dev restarts. `npm start` sets `production`. |
| `PUBLIC_HOSTNAME` | Customer-facing hostname for `npm start`, such as `pay.example.com`. Required in production. `localhost` and loopback addresses are rejected. |
| `PORT` | Listen port for the current process. The supervisor sets it per child. |
| `DATA_DIR` | Directory for the sqlite file and secrets. Default `data`. |
| `DATABASE_PATH` | sqlite file path. Default `data/bullpay.sqlite`. |
| `ENCRYPTION_MASTER_KEY` | 64 hex characters. AES-256-GCM key for webhook secrets, OTP codes, and device secrets. |
| `WEBHOOK_SECRET` | Demo merchant webhook HMAC secret. Stored encrypted in sqlite. |
| `ADMIN_API_TOKEN` | Bearer token for admin routes. The browser page stores it in `sessionStorage` after you paste it. |
| `OBSERVER_API_TOKEN` | Bearer token for Gmail, Google Messages, and the manual SMS test post. |
| `INTERNAL_SERVICE_TOKEN` | Bearer token for `/api/v1/internal/status` and `/api/v1/internal/sweep`. |
| `PAYMENT_API_PORT` | Payment API port. Default `6100`. Bound to `127.0.0.1`. |
| `CHECKOUT_PORT` | Checkout portal port. Default `7000`. |
| `DEMO_STORE_PORT` | Demo store port. Default `5000`. |
| `ADMIN_PORT` | Merchant admin port. Default `6001`. |
| `SMS_OBSERVER_PORT` | SMS observer port. Default `6002`. |
| `GMAIL_OBSERVER_PORT` | Gmail observer port. Default `6003`. |
| `HELP_PORT` | Help port. Default `3000`. |
| `SUPERVISOR_PORT` | Supervisor port. Default `8090`. |
| `PAYMENT_API_ORIGIN` | Base URL the checkout and observers use for the API. Default `http://127.0.0.1:6100`. |
| `CHECKOUT_ORIGIN` | Base URL of the checkout portal in localhost mode. Default `http://127.0.0.1:7000`. In production, a loopback value is ignored and the public checkout URL is `https://PUBLIC_HOSTNAME`. |
| `DEMO_STORE_ORIGIN` | Demo store origin. Default `http://127.0.0.1:5000`. Used as the checkout frame ancestor in localhost mode. |
| `ADMIN_ORIGIN` | Admin origin. Default `http://127.0.0.1:6001`. |
| `SMS_OBSERVER_ORIGIN` | SMS observer origin. Default `http://127.0.0.1:6002`. |
| `GMAIL_OBSERVER_ORIGIN` | Gmail observer origin. Default `http://127.0.0.1:6003`. |
| `HELP_ORIGIN` | Help origin. Default `http://127.0.0.1:3000`. |
| `SUPERVISOR_ORIGIN` | Supervisor origin. Default `http://127.0.0.1:8090`. |
| `CHECKOUT_FRAME_ANCESTORS` | `Content-Security-Policy` `frame-ancestors` value. When empty, localhost mode uses the demo store origin and production uses `https://PUBLIC_HOSTNAME`. |
| `PAYMENT_ACTIVE_WINDOW_MS` | How long an ACTIVE checkout may wait for a matching credit. Default `300000`. |
| `PAYMENT_PROCESSING_WINDOW_MS` | How long PROCESSING may wait after “I have paid”. Default `30000`. |
| `BULLPAY_DEV_OTP_LOG` | When `true` and `NODE_ENV` is not `production`, the API prints OTP codes to stdout. Production ignores this flag. |
| `GMAIL_CLIENT_ID` | Google OAuth client id. The observer still listens when this is empty and reports not configured. |
| `GMAIL_CLIENT_SECRET` | Google OAuth client secret. |
| `GMAIL_REDIRECT_URI` | OAuth redirect URL, normally `http://127.0.0.1:6003/oauth/callback`. |
| `GMAIL_POLL_INTERVAL_MS` | Gmail poll interval. Default `5000`. |
| `ENABLE_BROWSER_OBSERVER` | Documents and reports whether a Google Messages browser session is enabled. It stays off unless this is `true`. |
| `SUPPORT_EMAIL` | Support email copied onto the demo merchant on first boot. |
| `SUPPORT_PHONE` | Support phone copied onto the demo merchant on first boot. |

Money is integer paise inside the database, webhooks, and session rows. A request may send a rupee string such as `"499.00"` once, at the API boundary.

On Unix the data directory is mode `0700` and the sqlite file is mode `0600`. On Windows, `chmod` may fail; BULLPAY catches that and continues.
