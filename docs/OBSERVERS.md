# Observers

An alert is not proof of payment. BULLPAY accepts it only when it matches one open session on the same receiving account, for the same amount, inside that session’s time window. The merchant still reconciles SUCCESS against the bank statement. A missing or delayed SMS can leave a real payment unmatched.

## Gmail

Set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REDIRECT_URI`. When any of them is missing, the process on port 6003 still listens and the status page says not configured.

When they are set, open `http://127.0.0.1:6003/oauth/start`. The refresh token is stored encrypted. The observer polls every `GMAIL_POLL_INTERVAL_MS` milliseconds (default 5000) and posts credit-looking messages to the payment API.

## Android

Enroll a device from the admin. BULLPAY shows a pairing code and a signing secret once. The database stores only the SHA-256 hash of that secret. The secret itself is encrypted on disk so later SMS posts can be checked.

`POST /api/v1/observers/sms` does not use the observer bearer token. The JSON body includes `deviceId`, `timestamp` in milliseconds, and `signature`. The signature is HMAC-SHA256 hex of the canonical JSON body with the `signature` field removed and the remaining keys sorted. Rejected requests include an unknown or inactive device, a timestamp more than 60 seconds from the server clock, and a signature that does not match.

A sender that is only digits and at least 10 digits long, after spaces and plus signs are removed, is treated as a personal handset. That observation does not settle a checkout.

## Google Messages

A real Google Messages browser session is optional and off unless `ENABLE_BROWSER_OBSERVER=true`. In local development the SMS observer accepts a manual test post from localhost with `OBSERVER_API_TOKEN` and forwards it as `GOOGLE_MESSAGES`. Production rejects that test post.
