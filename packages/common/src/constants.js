export const DEMO_MERCHANT_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_ACCOUNT_ID = "00000000-0000-4000-8000-000000000002";
export const PLACEHOLDER_UPI = "replace-me@upi";

export const PORTS = {
  demoStore: 5000,
  paymentApi: 6100,
  checkout: 7000,
  admin: 6001,
  smsObserver: 6002,
  gmailObserver: 6003,
  help: 3000,
  supervisor: 8090,
};

export const TRANSITIONS = {
  INITIATED: ["ACTIVE", "QUEUED", "CANCELLED", "EXPIRED"],
  QUEUED: ["ACTIVE", "CANCELLED", "EXPIRED"],
  ACTIVE: ["PROCESSING", "SUCCESS", "FAILED", "EXPIRED", "CANCELLED", "SUSPICIOUS"],
  PROCESSING: ["SUCCESS", "FAILED", "SUSPICIOUS"],
  SUCCESS: [],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: [],
  SUSPICIOUS: [],
};

export const ORDER_BLOCKING_EXCLUSIONS = ["FAILED", "EXPIRED", "CANCELLED"];
export const SLOT_STATUSES = ["ACTIVE", "PROCESSING"];
export const TERMINAL_STATUSES = ["SUCCESS", "FAILED", "EXPIRED", "CANCELLED", "SUSPICIOUS"];
export const METHODS = ["UPI", "COD", "CASH_COUNTER", "CARD_COUNTER"];
export const COUNTER_METHODS = ["CASH_COUNTER", "CARD_COUNTER"];
export const VERIFICATION_TAGS = ["UNVERIFIED", "SINGLE_CHANNEL", "DUAL_CHANNEL", "TRIPLE_CHANNEL"];
export const WEBHOOK_EVENTS = ["SUCCESS", "FAILED", "EXPIRED", "CANCELLED", "SUSPICIOUS"];
export const WEBHOOK_BACKOFF_MS = [5000, 15000, 45000, 120000, 300000];
export const MAX_WEBHOOK_ATTEMPTS = 5;
export const SMS_SOURCES = ["SMS", "GOOGLE_MESSAGES", "ANDROID_OBSERVER"];
export const OBSERVER_SOURCES = ["GMAIL", "GOOGLE_MESSAGES", "ANDROID_OBSERVER", "SMS"];

export const DEFAULT_ACTIVE_WINDOW_MS = 300000;
export const DEFAULT_PROCESSING_WINDOW_MS = 30000;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const CUSTOMER_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const OBSERVATION_GRACE_MS = 5 * 60 * 1000;
export const FINGERPRINT_BUCKET_MS = 5 * 60 * 1000;
export const OTP_WINDOW_MS = 15 * 60 * 1000;
export const OTP_MAX_SENDS = 5;
export const OTP_MAX_ATTEMPTS = 5;
export const ANDROID_CLOCK_SKEW_MS = 60 * 1000;

/**
 * @param {string} from
 * @param {string} to
 */
export function canTransition(from, to) {
  const allowed = TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

/**
 * @param {number} level
 */
export function verificationTagForLevel(level) {
  const index = Math.max(0, Math.min(3, level));
  return VERIFICATION_TAGS[index];
}

/**
 * @param {string} mobile
 */
export function maskMobile(mobile) {
  const digits = String(mobile || "").replace(/\D/g, "");
  const tail = digits.slice(-4).padStart(4, "0");
  return `******${tail}`;
}
