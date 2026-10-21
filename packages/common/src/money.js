import { MoneyError } from "./errors.js";

/**
 * Convert a rupee string such as "499.00" into integer paise.
 * More than two decimal places, zero, and negative amounts are rejected.
 * @param {string} value
 */
export function rupeesToPaise(value) {
  if (typeof value !== "string") {
    throw new MoneyError("Amount must be a rupee string");
  }
  const trimmed = value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) {
    throw new MoneyError("Amount must be a rupee string with at most two decimal places");
  }
  const rupees = match[1];
  const fraction = (match[2] ?? "").padEnd(2, "0");
  if (rupees.length > 14) {
    throw new MoneyError("Amount is too large");
  }
  const paise = Number(rupees) * 100 + Number(fraction);
  if (!Number.isSafeInteger(paise) || paise <= 0) {
    throw new MoneyError("Amount must be greater than zero");
  }
  return paise;
}

/**
 * @param {number} paise
 */
export function paiseToRupees(paise) {
  if (!Number.isSafeInteger(paise) || paise <= 0) {
    throw new MoneyError("Amount must be greater than zero");
  }
  const rupees = Math.trunc(paise / 100);
  const fraction = String(paise % 100).padStart(2, "0");
  return `${rupees}.${fraction}`;
}
