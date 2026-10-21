(function () {
  var script = /** @type {HTMLScriptElement | null} */ (document.currentScript);
  var merchantId = script && script.getAttribute("data-bullpay-key");
  var defaultCurrency = (script && script.getAttribute("data-currency")) || "INR";
  var checkoutOrigin = "http://127.0.0.1:7000";
  if (script && script.src) checkoutOrigin = new URL(script.src).origin;
  var apiOrigin = (script && script.getAttribute("data-bullpay-api")) || checkoutOrigin.replace(":7000", ":6100");
  var current = null;

  function detailFrom(body, status) {
    return {
      status: status,
      order_id: body.order_id || body.orderId || (current && current.orderId) || "",
      amount_received: body.amount_received || body.amount || "",
      payment_mode: body.payment_mode || body.method || "",
      utr: body.utr || "",
      timestamp: body.timestamp || new Date().toISOString(),
      metadata: body.metadata || {},
    };
  }

  function emit(detail) {
    var name = "bullpay:payment:" + String(detail.status || "").toLowerCase();
    window.dispatchEvent(new CustomEvent(name, { detail: detail }));
    window.dispatchEvent(new CustomEvent("bullpay:payment:result", { detail: detail }));
    if (current && typeof current.handler === "function") current.handler(detail);
  }

  function removeOverlay() {
    if (current && current.overlay) current.overlay.remove();
    var onClose = current && current.onClose;
    current = null;
    if (typeof onClose === "function") onClose();
  }

  function closeOverlay(fromChild) {
    if (!current) return;
    var status = current.status;
    var shouldCancel = !fromChild && (status === "ACTIVE" || status === "QUEUED" || !status);
    var paymentId = current.paymentId;
    var task = shouldCancel
      ? fetch(apiOrigin + "/api/v1/checkout/" + paymentId + "/cancel", { method: "POST" }).catch(function () {})
      : Promise.resolve();
    task.then(removeOverlay, removeOverlay);
  }

  function ensureStyle() {
    if (document.getElementById("bullpay-overlay-style")) return;
    var style = document.createElement("style");
    style.id = "bullpay-overlay-style";
    style.textContent = [
      ".bullpay-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.45);backdrop-filter:blur(8px);}",
      ".bullpay-dialog{width:min(960px,calc(100% - 32px));height:90vh;background:#fff;border-radius:20px;box-shadow:0 24px 80px rgba(15,23,42,.28);display:flex;flex-direction:column;overflow:hidden;}",
      ".bullpay-bar{display:flex;justify-content:flex-end;padding:8px 10px;background:#f8fafc;}",
      ".bullpay-close{border:0;background:transparent;font:600 14px/1 system-ui,sans-serif;color:#334155;cursor:pointer;padding:8px 12px;}",
      ".bullpay-frame{flex:1;border:0;width:100%;background:#fff;}",
      "@media (max-width:760px){.bullpay-overlay{align-items:flex-end;}.bullpay-dialog{width:100%;height:92vh;border-radius:18px 18px 0 0;}}",
    ].join("");
    document.head.appendChild(style);
  }

  function openOverlay(payment, options) {
    ensureStyle();
    if (current && current.overlay) current.overlay.remove();
    var overlay = document.createElement("div");
    overlay.className = "bullpay-overlay";
    var dialog = document.createElement("div");
    dialog.className = "bullpay-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    var bar = document.createElement("div");
    bar.className = "bullpay-bar";
    var close = document.createElement("button");
    close.className = "bullpay-close";
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", function () { closeOverlay(false); });
    var frame = document.createElement("iframe");
    frame.className = "bullpay-frame";
    frame.src = checkoutOrigin + "/checkout/" + payment.paymentId;
    frame.title = "Bullpay checkout";
    bar.appendChild(close);
    dialog.appendChild(bar);
    dialog.appendChild(frame);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    current = {
      paymentId: payment.paymentId,
      orderId: payment.orderId,
      status: payment.status,
      handler: options.handler,
      onClose: options.onClose,
      overlay: overlay,
    };
  }

  function pay(options) {
    var orderId = options.order_id || ("order_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8));
    var customer = options.customer || {};
    return fetch(apiOrigin + "/api/v1/payments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-merchant-id": merchantId || "",
      },
      body: JSON.stringify({
        orderId: orderId,
        amount: String(options.amount),
        currency: options.currency || defaultCurrency,
        metadata: options.metadata || {},
        customer: customer.name || customer.email || customer.mobile ? customer : undefined,
      }),
    }).then(function (response) {
      return response.json().then(function (body) {
        if (!response.ok) throw new Error((body && body.error) || "Payment could not be started");
        openOverlay(body, options || {});
        return body;
      });
    });
  }

  document.addEventListener("click", function (event) {
    var eventTarget = /** @type {Element | null} */ (event.target);
    var target = eventTarget && eventTarget.closest ? eventTarget.closest("[data-bullpay-pay]") : null;
    if (!target) return;
    event.preventDefault();
    var metadata = {};
    var rawMetadata = target.getAttribute("data-metadata");
    if (rawMetadata) {
      try { metadata = JSON.parse(rawMetadata); } catch (error) { metadata = {}; }
    }
    pay({
      order_id: target.getAttribute("data-order-id") || "",
      amount: target.getAttribute("data-amount") || "",
      currency: target.getAttribute("data-currency") || defaultCurrency,
      customer: {
        name: target.getAttribute("data-customer-name") || undefined,
        email: target.getAttribute("data-customer-email") || undefined,
        mobile: target.getAttribute("data-customer-phone") || undefined,
      },
      metadata: metadata,
    });
  });

  window.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeOverlay(false);
  });

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.source !== "bullpay" || !current) return;
    if (String(event.origin) !== checkoutOrigin) return;
    if (data.type === "bullpay:status") {
      current.status = data.detail && data.detail.status;
      return;
    }
    if (data.type === "bullpay:close") {
      current.status = data.detail && data.detail.status;
      closeOverlay(true);
      return;
    }
    if (String(data.type || "").indexOf("bullpay:payment:") === 0) {
      current.status = data.detail && data.detail.status;
      emit(detailFrom(data.detail || {}, data.detail && data.detail.status));
    }
  });

  /** @type {any} */ (window).Bullpay = { pay: pay, close: function () { closeOverlay(false); } };
})();
