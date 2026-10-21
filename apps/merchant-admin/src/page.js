/**
 * @param {{ apiOrigin: string }} options
 */
export function adminPage(options) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bullpay admin</title>
  <style>
    :root { color-scheme: light; --brand: #0f766e; }
    body { margin: 0; font: 15px/1.45 "Segoe UI", system-ui, sans-serif; background: #f1f5f9; color: #0f172a; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 16px 20px; background: #fff; }
    nav { display: flex; gap: 8px; flex-wrap: wrap; padding: 0 20px 12px; background: #fff; }
    nav button, button { font: inherit; }
    nav button { border: 0; background: #e2e8f0; border-radius: 999px; padding: 8px 12px; cursor: pointer; }
    main { padding: 20px; display: grid; gap: 16px; }
    section, .gate { background: #fff; border-radius: 16px; padding: 16px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
    input { width: 100%; padding: 10px; margin: 6px 0 12px; border: 1px solid #cbd5e1; border-radius: 10px; }
    .primary { background: var(--brand); color: #fff; border: 0; border-radius: 10px; padding: 10px 14px; cursor: pointer; }
    .dock { position: fixed; right: 16px; bottom: 16px; width: min(320px, calc(100% - 32px)); background: #0f172a; color: #fff; border-radius: 16px; padding: 14px; }
    .phone { width: 220px; height: 420px; border: 8px solid #0f172a; border-radius: 28px; padding: 16px; background: #fff; }
    .warn { color: #9a3412; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="gate" id="gate">
    <h1>Bullpay admin</h1>
    <p>Paste the admin token once. It stays in sessionStorage for this tab and is sent as a bearer token.</p>
    <input id="token" type="password" autocomplete="off">
    <button class="primary" id="unlock">Continue</button>
  </div>
  <div id="shell" class="hidden">
    <header><strong>Bullpay admin</strong><button id="lock">Lock</button></header>
    <nav>
      <button data-tab="operations">Operations</button>
      <button data-tab="account">Receiving account</button>
      <button data-tab="branding">Branding</button>
      <button data-tab="payments">Payments</button>
      <button data-tab="support">Support</button>
      <button data-tab="customers">Customers</button>
      <button data-tab="observers">Observers</button>
      <button data-tab="whatsapp">WhatsApp</button>
      <button data-tab="settings">Settings</button>
    </nav>
    <main id="view"></main>
    <aside class="dock" id="dock"></aside>
  </div>
  <script>
    const API = ${JSON.stringify(options.apiOrigin)};
    const gate = document.querySelector("#gate");
    const shell = document.querySelector("#shell");
    const view = document.querySelector("#view");
    let tab = "operations";
    function token() { return sessionStorage.getItem("bullpay.adminToken") || ""; }
    async function api(path, options) {
      const response = await fetch(API + path, Object.assign({ headers: { authorization: "Bearer " + token(), "content-type": "application/json" } }, options || {}));
      if (response.status === 401) { sessionStorage.removeItem("bullpay.adminToken"); showGate(); throw new Error("Unauthorized"); }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Request failed");
      return body;
    }
    function showGate() { gate.classList.remove("hidden"); shell.classList.add("hidden"); }
    function showShell() { gate.classList.add("hidden"); shell.classList.remove("hidden"); render(); }
    document.querySelector("#unlock").onclick = () => {
      sessionStorage.setItem("bullpay.adminToken", document.querySelector("#token").value.trim());
      showShell();
    };
    document.querySelector("#lock").onclick = () => { sessionStorage.removeItem("bullpay.adminToken"); showGate(); };
    document.querySelectorAll("[data-tab]").forEach((button) => button.onclick = () => { tab = button.getAttribute("data-tab"); render(); });
    async function render() {
      if (tab === "operations") {
        const data = await api("/api/v1/admin/operations");
        view.innerHTML = '<section><h2>Operations</h2><div class="cards"><div class="card"><h3>Active</h3><p>' + line(data.active) + '</p></div><div class="card"><h3>Processing</h3><p>' + line(data.processing) + '</p></div><div class="card"><h3>Single channel today</h3><p>' + data.singleChannelToday + '</p></div><div class="card"><h3>Dual channel today</h3><p>' + data.dualChannelToday + '</p></div></div><h3>Queue</h3>' + table(data.queue) + '</section>';
      } else if (tab === "account") {
        const account = await api("/api/v1/admin/receiving-account");
        view.innerHTML = '<section><h2>Receiving account</h2><p>Current UPI id <strong>' + account.upiId + '</strong> · ' + account.payeeName + '</p><p class="warn">Checkouts already opened keep the previous snapshot.</p><label>UPI id<input id="upi" value="' + account.upiId + '"></label><label>Payee name<input id="payee" value="' + account.payeeName + '"></label><button class="primary" id="save-account">Save and activate</button></section>';
        document.querySelector("#save-account").onclick = async () => { await api("/api/v1/admin/receiving-account", { method: "PUT", body: JSON.stringify({ upiId: document.querySelector("#upi").value, payeeName: document.querySelector("#payee").value }) }); render(); };
      } else if (tab === "branding") {
        const branding = await api("/api/v1/admin/branding");
        view.innerHTML = '<section><h2>Branding</h2><label>App name<input id="appName" value="' + (branding.appName || "") + '"></label><label>Logo URL<input id="logoUrl" value="' + (branding.logoUrl || "") + '"></label><label>Favicon URL<input id="faviconUrl" value="' + (branding.faviconUrl || "") + '"></label><label>Primary color<input id="primaryColor" value="' + (branding.primaryColor || "#0f766e") + '"></label><button class="primary" id="save-brand">Save</button></section><div class="phone" id="phone"></div>';
        const paint = () => { const phone = document.querySelector("#phone"); phone.innerHTML = '<strong style="color:' + document.querySelector("#primaryColor").value + '">' + document.querySelector("#appName").value + '</strong>'; };
        ["appName", "primaryColor"].forEach((id) => document.querySelector("#" + id).addEventListener("input", paint));
        paint();
        document.querySelector("#save-brand").onclick = async () => { await api("/api/v1/admin/branding", { method: "PUT", body: JSON.stringify({ appName: document.querySelector("#appName").value, logoUrl: document.querySelector("#logoUrl").value || null, faviconUrl: document.querySelector("#faviconUrl").value || null, primaryColor: document.querySelector("#primaryColor").value }) }); };
      } else if (tab === "payments") {
        const data = await api("/api/v1/admin/payments");
        view.innerHTML = '<section><h2>Payments</h2>' + table(data.payments) + '</section>';
      } else if (tab === "support") {
        const data = await api("/api/v1/admin/tickets");
        view.innerHTML = '<section><h2>Support</h2>' + data.tickets.map((ticket) => '<article class="card"><h3>' + ticket.subject + '</h3><p>' + ticket.messages.map((message) => message.senderType + ': ' + message.message).join("<br>") + '</p><textarea id="reply-' + ticket.id + '"></textarea><button class="primary" data-reply="' + ticket.id + '">Reply</button></article>').join("") + '</section>';
        document.querySelectorAll("[data-reply]").forEach((button) => button.onclick = async () => { await api("/api/v1/admin/tickets/" + button.getAttribute("data-reply") + "/reply", { method: "POST", body: JSON.stringify({ message: document.querySelector("#reply-" + button.getAttribute("data-reply")).value }) }); render(); });
      } else if (tab === "customers") {
        const data = await api("/api/v1/admin/customers");
        view.innerHTML = '<section><h2>Customers</h2>' + data.customers.map((customer) => '<div class="card"><strong>' + customer.name + '</strong> ' + customer.mobile + ' ' + customer.status + ' <button data-ban="' + customer.id + '">Ban</button> <button data-unban="' + customer.id + '">Unban</button></div>').join("") + '</section>';
        document.querySelectorAll("[data-ban]").forEach((button) => button.onclick = async () => { const reason = prompt("Ban reason") || "Banned"; await api("/api/v1/admin/customers/" + button.getAttribute("data-ban") + "/ban", { method: "POST", body: JSON.stringify({ reason }) }); render(); });
        document.querySelectorAll("[data-unban]").forEach((button) => button.onclick = async () => { await api("/api/v1/admin/customers/" + button.getAttribute("data-unban") + "/unban", { method: "POST", body: "{}" }); render(); });
      } else if (tab === "observers") {
        const data = await api("/api/v1/admin/observers");
        view.innerHTML = '<section><h2>Observers</h2><p>Gmail ' + (data.gmail.reachable ? (data.gmail.configured ? (data.gmail.connected ? "connected" : "not connected") : "not configured") : "unreachable") + '</p><p><a href="' + data.gmailOauthUrl + '">Gmail OAuth start</a></p><p>SMS observer ' + (data.sms.reachable ? "reachable" : "unreachable") + '</p><h3>Android devices</h3>' + data.devices.map((device) => '<div class="card">' + device.deviceName + ' heartbeat ' + (device.lastHeartbeatAt || "none") + ' observation ' + (device.lastObservationAt || "none") + '</div>').join("") + '<label>Device name<input id="deviceName"></label><button class="primary" id="pair">Create pairing code</button><pre id="pair-out"></pre><p>The signing secret is shown once.</p></section>';
        document.querySelector("#pair").onclick = async () => { const paired = await api("/api/v1/admin/android-devices", { method: "POST", body: JSON.stringify({ deviceName: document.querySelector("#deviceName").value }) }); document.querySelector("#pair-out").textContent = "Device " + paired.deviceId + "\\nPairing code " + paired.pairingCode + "\\nSigning secret " + paired.signingSecret; };
      } else if (tab === "whatsapp") {
        const data = await api("/api/v1/admin/whatsapp");
        view.innerHTML = '<section><h2>WhatsApp</h2><p>Live adapter: ' + (data.connected ? "connected" : "not connected") + ' (' + data.adapter + ')</p><div id="qr">' + (data.qr || "No QR yet") + '</div><button class="primary" id="reconnect">Reconnect</button> <button id="disconnect">Disconnect</button></section>';
        document.querySelector("#reconnect").onclick = async () => { await api("/api/v1/admin/whatsapp/reconnect", { method: "POST", body: "{}" }); render(); };
        document.querySelector("#disconnect").onclick = async () => { await api("/api/v1/admin/whatsapp/disconnect", { method: "POST", body: "{}" }); render(); };
      } else if (tab === "settings") {
        const data = await api("/api/v1/admin/settings");
        view.innerHTML = '<section><h2>Settings</h2><p>Webhook URL ' + (data.webhookUrl || "") + '</p><label>Support email<input id="supportEmail" value="' + (data.supportEmail || "") + '"></label><label>Support phone<input id="supportPhone" value="' + (data.supportPhone || "") + '"></label><label>Webhook secret (write-only, the current secret is never displayed)<input id="webhookSecret" type="password" placeholder="Set a new secret"></label><button class="primary" id="save-settings">Save</button></section>';
        document.querySelector("#save-settings").onclick = async () => { const body = { supportEmail: document.querySelector("#supportEmail").value, supportPhone: document.querySelector("#supportPhone").value, webhookUrl: data.webhookUrl }; const secret = document.querySelector("#webhookSecret").value; if (secret) body.webhookSecret = secret; await api("/api/v1/admin/settings", { method: "PUT", body: JSON.stringify(body) }); render(); };
      }
    }
    function line(payment) { return payment ? payment.status + " " + payment.amount + " " + payment.orderId : "None"; }
    function table(rows) { if (!rows || !rows.length) return "<p>None</p>"; return "<table><tr><th>Status</th><th>Amount</th><th>Method</th><th>UTR</th><th>Tag</th></tr>" + rows.map((row) => "<tr><td>" + row.status + "</td><td>" + row.amount + "</td><td>" + row.method + "</td><td>" + (row.utr || "") + "</td><td>" + row.verificationTag + "</td></tr>").join("") + "</table>"; }
    async function dock() {
      if (!token()) return;
      try {
        const data = await api("/api/v1/admin/counter");
        document.querySelector("#dock").innerHTML = "<strong>Cashier dock</strong>" + (data.sessions.length ? data.sessions.map((session) => '<div><p>' + session.method + ' ' + session.amount + '</p><button data-confirm="' + session.paymentId + '" data-method="' + session.method + '">Confirm</button> <button data-decline="' + session.paymentId + '">Decline</button></div>').join("") : "<p>No counter payments</p>");
        document.querySelectorAll("[data-confirm]").forEach((button) => button.onclick = async () => { await api("/api/v1/admin/counter-confirm", { method: "POST", body: JSON.stringify({ paymentId: button.getAttribute("data-confirm"), method: button.getAttribute("data-method") }) }); dock(); });
        document.querySelectorAll("[data-decline]").forEach((button) => button.onclick = async () => { await api("/api/v1/admin/counter-decline", { method: "POST", body: JSON.stringify({ paymentId: button.getAttribute("data-decline") }) }); dock(); });
      } catch (error) {}
    }
    if (token()) showShell(); else showGate();
    setInterval(dock, 2000);
  </script>
</body>
</html>`;
}
