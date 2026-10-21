const CLIENT = String.raw`
const API = window.__BULLPAY_API__;
const PAYMENT_ID = window.__BULLPAY_PAYMENT_ID__;
const app = document.querySelector("#app");
let state = null;
let notified = false;
let token = "";
let mobile = "";
let resendAt = 0;
let events;
let timer;

function money(paise) {
  return state && state.amount ? state.amount : "";
}

function brandColor() {
  return (state && state.branding && state.branding.primaryColor) || "#0f766e";
}

function appName() {
  return (state && state.branding && state.branding.appName) || "Bullpay";
}

function profiles() {
  try { return JSON.parse(localStorage.getItem("bullpay.profiles") || "[]"); }
  catch (error) { return []; }
}

function saveProfile(profile) {
  const next = profiles().filter((item) => item.mobileMasked !== profile.mobileMasked);
  next.unshift(profile);
  localStorage.setItem("bullpay.profiles", JSON.stringify(next.slice(0, 2)));
}

function dropProfile(rawToken) {
  localStorage.setItem("bullpay.profiles", JSON.stringify(profiles().filter((item) => item.token !== rawToken)));
}

function mask(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return "******" + digits.slice(-4);
}

function postParent(type, detail) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ source: "bullpay", type, detail }, "*");
  }
}

function outcomeDetail(status) {
  return {
    status,
    order_id: state.orderId,
    amount_received: state.amount,
    payment_mode: state.method,
    utr: state.utr || "",
    timestamp: new Date().toISOString(),
    metadata: state.metadata || {},
  };
}

function notifyOutcome(status) {
  const detail = outcomeDetail(status);
  postParent("bullpay:payment:" + String(status).toLowerCase(), detail);
  postParent("bullpay:status", { status });
}

function shell(inner) {
  const logo = state && state.branding && state.branding.logoUrl
    ? '<img class="logo" alt="" src="' + state.branding.logoUrl + '">'
    : "";
  const banner = state && state.setupRequired
    ? '<div class="banner">The receiving UPI id is still a placeholder. replace this in the admin before a real payment.</div>'
    : "";
  app.innerHTML = '<div class="card" style="--brand:' + brandColor() + '">' +
    banner +
    '<header class="head">' + logo + '<div><strong>' + appName() + '</strong><div class="muted">Pay ' + (state ? state.payeeName : "") + '</div></div></header>' +
    inner + '</div>';
  app.style.setProperty("--brand", brandColor());
}

function splash() {
  app.innerHTML = '<div class="splash"><div class="mark"></div><h1>' + appName() + '</h1></div>';
}

async function refresh() {
  const response = await fetch(API + "/api/v1/checkout/" + PAYMENT_ID + "/state");
  state = await response.json();
  postParent("bullpay:status", { status: state.status });
  render();
}

function listen() {
  if (events) events.close();
  events = new EventSource(API + "/api/v1/checkout/" + PAYMENT_ID + "/stream");
  events.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (!state) return;
    state.expiresAt = data.expiresAt;
    state.processingExpiresAt = data.processingExpiresAt;
    if (data.status !== state.status || data.queuePosition !== state.queuePosition) refresh();
  };
}

function countdown(iso, node) {
  clearInterval(timer);
  const tick = () => {
    if (!iso || !node) return;
    const left = Math.max(0, Date.parse(iso) - Date.now());
    const minutes = String(Math.floor(left / 60000)).padStart(2, "0");
    const seconds = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
    node.textContent = minutes + ":" + seconds;
  };
  tick();
  timer = setInterval(tick, 250);
}

function resultView() {
  const titles = {
    SUCCESS: "Payment received",
    FAILED: "Verification window ended",
    EXPIRED: "Checkout expired",
    CANCELLED: "Checkout cancelled",
    SUSPICIOUS: "Payment held",
  };
  const notes = {
    FAILED: "The verification window ended and the merchant must check the bank before treating it as lost.",
    SUSPICIOUS: "The payment is held for the merchant to review.",
    EXPIRED: "This checkout expired before a matching credit was seen.",
    CANCELLED: "This checkout was cancelled.",
    SUCCESS: state.utr ? "UTR " + state.utr : "The shop confirms fulfillment from the signed webhook.",
  };
  shell(
    '<h2>' + (titles[state.status] || state.status) + '</h2>' +
    '<p class="amount">' + state.amount + ' ' + state.currency + '</p>' +
    '<p>Order ' + state.orderId + '</p>' +
    '<p>' + (notes[state.status] || "") + '</p>' +
    '<button class="primary" id="close">Close</button>'
  );
  if (!notified) { notified = true; notifyOutcome(state.status); }
  document.querySelector("#close").onclick = () => postParent("bullpay:close", outcomeDetail(state.status));
}

function signInView() {
  const saved = profiles().map((profile) =>
    '<button class="profile" data-token="' + profile.token + '">' + profile.name + ' · ' + profile.mobileMasked + '</button>'
  ).join("");
  shell(
    '<h2>Sign in</h2>' +
    '<p class="muted">The code is sent on WhatsApp once a WhatsApp socket is paired from the admin.</p>' +
    saved +
    '<label>Mobile<input id="mobile" inputmode="numeric" maxlength="10" placeholder="10 digit mobile"></label>' +
    '<div id="extra" hidden><label>Name<input id="name"></label><label>Email<input id="email" type="email"></label></div>' +
    '<button class="primary" id="continue">Continue</button>' +
    '<div id="otp" hidden><div class="otp" id="boxes"></div><p class="error" id="error"></p><button class="text" id="resend" disabled>Resend</button></div>'
  );
  const boxes = document.querySelector("#boxes");
  for (let i = 0; i < 6; i += 1) {
    const input = document.createElement("input");
    input.maxLength = 1;
    input.inputMode = "numeric";
    input.addEventListener("input", () => { if (input.value && input.nextElementSibling) input.nextElementSibling.focus(); });
    boxes.appendChild(input);
  }
  document.querySelectorAll(".profile").forEach((button) => {
    button.onclick = async () => {
      token = button.getAttribute("data-token");
      const me = await fetch(API + "/api/v1/customer/me", { headers: { authorization: "Bearer " + token } });
      if (!me.ok) { dropProfile(token); token = ""; signInView(); return; }
      await fetch(API + "/api/v1/checkout/" + PAYMENT_ID + "/bind-customer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      refresh();
    };
  });
  document.querySelector("#continue").onclick = async () => {
    mobile = document.querySelector("#mobile").value.trim();
    const error = document.querySelector("#error");
    if (!/^[0-9]{10}$/.test(mobile)) { document.querySelector("#otp").hidden = false; error.textContent = "Enter a 10 digit mobile."; return; }
    const exists = await (await fetch(API + "/api/v1/customer/check-user", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mobile }) })).json();
    if (!exists.exists && document.querySelector("#extra").hidden) { document.querySelector("#extra").hidden = false; return; }
    const path = exists.exists ? "/api/v1/customer/send-otp" : "/api/v1/customer/register";
    const body = exists.exists ? { mobile } : { mobile, name: document.querySelector("#name").value, email: document.querySelector("#email").value };
    const sent = await fetch(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await sent.json();
    if (!sent.ok) { document.querySelector("#otp").hidden = false; error.textContent = payload.error || "Could not send the code."; return; }
    document.querySelector("#otp").hidden = false;
    resendAt = Date.now() + 30000;
    boxes.querySelector("input").focus();
  };
  boxes.addEventListener("input", async () => {
    const code = Array.from(boxes.querySelectorAll("input")).map((input) => input.value).join("");
    if (code.length !== 6) return;
    const verified = await fetch(API + "/api/v1/customer/verify-otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mobile, code }) });
    const payload = await verified.json();
    if (!verified.ok) { document.querySelector("#error").textContent = payload.error || "Wrong code"; return; }
    token = payload.token;
    saveProfile({ name: payload.customer.name, mobileMasked: mask(mobile), token });
    await fetch(API + "/api/v1/checkout/" + PAYMENT_ID + "/bind-customer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    refresh();
  });
  setInterval(() => {
    const button = document.querySelector("#resend");
    if (!button) return;
    const left = Math.ceil((resendAt - Date.now()) / 1000);
    button.disabled = left > 0;
    button.textContent = left > 0 ? "Resend in " + left + "s" : "Resend";
  }, 250);
  const resend = document.querySelector("#resend");
  resend.onclick = async () => {
    if (Date.now() < resendAt) return;
    await fetch(API + "/api/v1/customer/send-otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mobile }) });
    resendAt = Date.now() + 30000;
  };
}

function queueView() {
  const ahead = state.peopleAhead || 0;
  shell(
    '<div class="queue"><div class="position">' + (ahead + 1) + '</div><h2>you are in line</h2>' +
    '<p>Estimated wait ' + (ahead * 30) + ' seconds</p></div>'
  );
}

async function payView() {
  shell(
    '<div class="pay"><section class="summary"><h2>' + appName() + '</h2><p>Order ' + state.orderId + '</p><p class="amount">' + state.amount + '</p><p>UPI</p>' +
    '<div class="methods"><button data-method="COD">Cash on delivery</button><button data-method="CASH_COUNTER">Cash at till</button><button data-method="CARD_COUNTER">Card at counter</button></div></section>' +
    '<section class="qr"><div id="qr"></div><p>Scan with any UPI app</p><div class="clock" id="clock">05:00</div>' +
    '<div class="apps" id="apps"></div><button class="primary" id="paid">I have paid</button><button class="text" id="cancel">Cancel</button></section></div>'
  );
  const qr = await fetch(API + "/api/v1/checkout/" + PAYMENT_ID + "/qr.svg");
  const svg = await qr.text();
  const holder = document.querySelector("#qr");
  holder.innerHTML = svg;
  const uri = holder.querySelector("svg") && holder.querySelector("svg").getAttribute("data-uri");
  ["GPay", "PhonePe", "Paytm", "CRED", "BHIM"].forEach((name) => {
    const link = document.createElement("a");
    link.href = uri || "#";
    link.textContent = name;
    document.querySelector("#apps").appendChild(link);
  });
  countdown(state.expiresAt, document.querySelector("#clock"));
  document.querySelector("#paid").onclick = async () => {
    await fetch(API + "/api/v1/checkout/" + PAYMENT_ID + "/payment-done", { method: "POST" });
    refresh();
  };
  document.querySelector("#cancel").onclick = async () => {
    await fetch(API + "/api/v1/checkout/" + PAYMENT_ID + "/cancel", { method: "POST" });
    refresh();
  };
  document.querySelectorAll("[data-method]").forEach((button) => {
    button.onclick = async () => {
      await fetch(API + "/api/v1/checkout/" + PAYMENT_ID + "/select-method", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: button.getAttribute("data-method") }),
      });
      refresh();
    };
  });
}

function processingView() {
  shell('<div class="center"><h2>Checking your payment</h2><div class="clock" id="clock">00:30</div><p class="muted">Keep this screen open.</p></div>');
  countdown(state.processingExpiresAt, document.querySelector("#clock"));
}

function codView() {
  shell('<h2>Cash on delivery</h2><p>Payment is collected on delivery. This does not move money now.</p><button class="primary" id="confirm">Confirm cash on delivery</button><button class="text" id="back">Back to UPI</button>');
  document.querySelector("#confirm").onclick = async () => {
    const response = await fetch(API + "/api/v1/checkout/" + PAYMENT_ID + "/confirm-cod", { method: "POST", headers: { authorization: "Bearer " + token } });
    if (!response.ok) { const body = await response.json(); alert(body.error || "Could not confirm"); return; }
    refresh();
  };
  document.querySelector("#back").onclick = async () => {
    await fetch(API + "/api/v1/checkout/" + PAYMENT_ID + "/select-method", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method: "UPI" }) });
    refresh();
  };
}

function counterView() {
  shell('<div class="center"><p class="muted">' + (state.method === "CARD_COUNTER" ? "Card at counter" : "Cash at till") + '</p><div class="position">' + state.shortCode + '</div><p>Show this screen to the cashier.</p></div>');
}

function render() {
  if (!state || state.error) { splash(); return; }
  if (["SUCCESS", "FAILED", "EXPIRED", "CANCELLED", "SUSPICIOUS"].includes(state.status)) { resultView(); return; }
  if (!state.customerBound) { signInView(); return; }
  if (state.status === "QUEUED") { queueView(); return; }
  if (state.status === "PROCESSING") { processingView(); return; }
  if (state.method === "COD") { codView(); return; }
  if (state.method === "CASH_COUNTER" || state.method === "CARD_COUNTER") { counterView(); return; }
  payView();
}

splash();
refresh().then(listen);
`;

/**
 * @param {{ apiOrigin: string, paymentId: string }} options
 */
export function checkoutPage(options) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bullpay checkout</title>
  <style>
    :root { color-scheme: light; --brand: #0f766e; --slate: #0f172a; --muted: #475569; --line: #e2e8f0; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 16px/1.5 "Segoe UI", system-ui, sans-serif; background: #f1f5f9; color: var(--slate); }
    .splash, .center { min-height: 100vh; display: grid; place-items: center; text-align: center; }
    .mark { width: 64px; height: 64px; border-radius: 18px; background: var(--brand); margin: 0 auto 12px; }
    .card { max-width: 960px; margin: 24px auto; background: #fff; border-radius: 20px; padding: 24px; box-shadow: 0 10px 40px rgba(15,23,42,.06); }
    .banner { background: #fff7ed; color: #9a3412; border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; }
    .head { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
    .logo { width: 42px; height: 42px; object-fit: contain; }
    .muted { color: var(--muted); }
    h2 { margin: 0 0 8px; }
    label { display: block; margin: 12px 0; font-weight: 600; }
    input { width: 100%; margin-top: 6px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; font: inherit; }
    .primary, .text, .profile, .methods button, .apps a { font: inherit; cursor: pointer; }
    .primary { background: var(--brand); color: #fff; border: 0; border-radius: 12px; padding: 14px 18px; width: 100%; margin-top: 12px; }
    .text { background: transparent; border: 0; color: var(--muted); width: 100%; padding: 10px; }
    .profile { display: block; width: 100%; text-align: left; margin-bottom: 8px; padding: 12px; border-radius: 12px; border: 1px solid var(--line); background: #f8fafc; }
    .otp { display: flex; gap: 8px; }
    .otp input { text-align: center; font-size: 24px; }
    .error { color: #b91c1c; min-height: 1.2em; }
    .amount { font-size: 32px; font-weight: 700; margin: 8px 0; }
    .position { font-size: 72px; font-weight: 700; color: var(--brand); }
    .clock { font-variant-numeric: tabular-nums; font-size: 28px; font-weight: 700; }
    .pay { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .apps { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
    .apps a, .methods button { border: 1px solid var(--line); background: #fff; color: var(--slate); border-radius: 999px; padding: 8px 12px; text-decoration: none; }
    #qr svg { width: 220px; height: 220px; }
    @media (max-width: 760px) {
      .card { margin: 0; min-height: 100vh; border-radius: 0; }
      .pay { grid-template-columns: 1fr; }
      .qr { display: flex; flex-direction: column; }
      .pay .primary, .pay .text { position: sticky; bottom: 0; }
    }
  </style>
</head>
<body>
  <main id="app"></main>
  <script>window.__BULLPAY_API__ = ${JSON.stringify(options.apiOrigin)}; window.__BULLPAY_PAYMENT_ID__ = ${JSON.stringify(options.paymentId)};</script>
  <script>${CLIENT}</script>
</body>
</html>`;
}
