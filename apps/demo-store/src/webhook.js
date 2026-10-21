import { verifySignature } from "@bullpay/common";

/**
 * Record a merchant webhook. paid is true only for SUCCESS with method UPI.
 * A repeated delivery id is already handled.
 * @param {{ rawBody: Buffer, signature: string | undefined, deliveryId: string | undefined, secret: string, orders: Map<string, any>, seen: Set<string> }} input
 */
export function applyWebhook(input) {
  if (!verifySignature(input.rawBody, input.signature, input.secret)) {
    return { status: 401, duplicate: false };
  }
  if (input.deliveryId && input.seen.has(input.deliveryId)) {
    return { status: 200, duplicate: true };
  }
  if (input.deliveryId) input.seen.add(input.deliveryId);
  const event = JSON.parse(input.rawBody.toString("utf8"));
  const paid = event.event === "SUCCESS" && event.method === "UPI";
  input.orders.set(event.orderId, {
    orderId: event.orderId,
    status: event.event,
    method: event.method || "",
    paid,
  });
  return { status: 200, duplicate: false };
}
