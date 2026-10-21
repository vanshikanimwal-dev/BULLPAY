/**
 * @param {{ vpa: string, payeeName: string, amount: string, orderId: string }} input
 */
export function buildUpiUri(input) {
  const query = [
    ["pa", input.vpa],
    ["pn", input.payeeName],
    ["am", input.amount],
    ["cu", "INR"],
    ["tn", input.orderId],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value ?? "")}`)
    .join("&");
  return `upi://pay?${query}`;
}
