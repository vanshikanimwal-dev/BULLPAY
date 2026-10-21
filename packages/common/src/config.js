import { resolve } from "node:path";
import {
  DEFAULT_ACTIVE_WINDOW_MS,
  DEFAULT_PROCESSING_WINDOW_MS,
  PORTS,
} from "./constants.js";

/**
 * @param {string | undefined} hostname
 */
export function assertProductionHostname(hostname) {
  const value = String(hostname ?? "").trim().toLowerCase();
  const loopback = new Set(["", "localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);
  if (
    loopback.has(value) ||
    value.endsWith(".localhost") ||
    value.includes("localhost") ||
    value.startsWith("127.")
  ) {
    throw new Error("PUBLIC_HOSTNAME must be a real hostname. Refusing to start.");
  }
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(value)) {
    throw new Error("PUBLIC_HOSTNAME must be a real hostname. Refusing to start.");
  }
}

/**
 * @param {string} value
 */
export function isLoopbackUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1";
  } catch {
    return true;
  }
}

/**
 * @param {string | undefined} value
 * @param {number} fallback
 */
function numberFrom(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  let mode = env.BULLPAY_MODE || "";
  if (!mode) mode = nodeEnv === "production" ? "production" : "localhost";
  if (mode === "production") {
    assertProductionHostname(env.PUBLIC_HOSTNAME);
  }

  const ports = {
    demoStore: numberFrom(env.DEMO_STORE_PORT, PORTS.demoStore),
    paymentApi: numberFrom(env.PAYMENT_API_PORT, PORTS.paymentApi),
    checkout: numberFrom(env.CHECKOUT_PORT, PORTS.checkout),
    admin: numberFrom(env.ADMIN_PORT, PORTS.admin),
    smsObserver: numberFrom(env.SMS_OBSERVER_PORT, PORTS.smsObserver),
    gmailObserver: numberFrom(env.GMAIL_OBSERVER_PORT, PORTS.gmailObserver),
    help: numberFrom(env.HELP_PORT, PORTS.help),
    supervisor: numberFrom(env.SUPERVISOR_PORT, PORTS.supervisor),
  };

  const origins = {
    demoStore: (env.DEMO_STORE_ORIGIN || `http://127.0.0.1:${ports.demoStore}`).replace(/\/$/, ""),
    paymentApi: (env.PAYMENT_API_ORIGIN || `http://127.0.0.1:${ports.paymentApi}`).replace(/\/$/, ""),
    checkout: (env.CHECKOUT_ORIGIN || `http://127.0.0.1:${ports.checkout}`).replace(/\/$/, ""),
    admin: (env.ADMIN_ORIGIN || `http://127.0.0.1:${ports.admin}`).replace(/\/$/, ""),
    smsObserver: (env.SMS_OBSERVER_ORIGIN || `http://127.0.0.1:${ports.smsObserver}`).replace(/\/$/, ""),
    gmailObserver: (env.GMAIL_OBSERVER_ORIGIN || `http://127.0.0.1:${ports.gmailObserver}`).replace(/\/$/, ""),
    help: (env.HELP_ORIGIN || `http://127.0.0.1:${ports.help}`).replace(/\/$/, ""),
    supervisor: (env.SUPERVISOR_ORIGIN || `http://127.0.0.1:${ports.supervisor}`).replace(/\/$/, ""),
  };

  let publicCheckoutBase = origins.checkout;
  if (mode === "production") {
    const configured = env.CHECKOUT_ORIGIN || "";
    if (configured && !isLoopbackUrl(configured)) {
      publicCheckoutBase = configured.replace(/\/$/, "");
    } else {
      publicCheckoutBase = `https://${String(env.PUBLIC_HOSTNAME).trim()}`;
    }
  }

  let frameAncestors = env.CHECKOUT_FRAME_ANCESTORS || "";
  if (!frameAncestors) {
    frameAncestors = mode === "production"
      ? `https://${String(env.PUBLIC_HOSTNAME).trim()}`
      : origins.demoStore;
  }

  return {
    mode,
    nodeEnv,
    publicHostname: env.PUBLIC_HOSTNAME || "",
    dataDir: resolve(env.DATA_DIR || "data"),
    databasePath: env.DATABASE_PATH ? resolve(env.DATABASE_PATH) : "",
    ports,
    origins,
    publicCheckoutBase,
    frameAncestors,
    activeWindowMs: numberFrom(env.PAYMENT_ACTIVE_WINDOW_MS, DEFAULT_ACTIVE_WINDOW_MS),
    processingWindowMs: numberFrom(env.PAYMENT_PROCESSING_WINDOW_MS, DEFAULT_PROCESSING_WINDOW_MS),
    devOtpLog: env.BULLPAY_DEV_OTP_LOG === "true" && nodeEnv !== "production",
    gmailClientId: env.GMAIL_CLIENT_ID || "",
    gmailClientSecret: env.GMAIL_CLIENT_SECRET || "",
    gmailRedirectUri: env.GMAIL_REDIRECT_URI || "",
    gmailPollIntervalMs: numberFrom(env.GMAIL_POLL_INTERVAL_MS, 5000),
    enableBrowserObserver: env.ENABLE_BROWSER_OBSERVER === "true",
    supportEmail: env.SUPPORT_EMAIL || "",
    supportPhone: env.SUPPORT_PHONE || "",
    bindHost: "127.0.0.1",
  };
}
