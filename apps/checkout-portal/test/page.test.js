import assert from "node:assert/strict";
import test from "node:test";
import { checkoutPage } from "../src/page.js";

test("the checkout page contains the payment views and the placeholder banner", () => {
  const html = checkoutPage({ apiOrigin: "http://127.0.0.1:6100", paymentId: "pay_123" });
  assert.match(html, /Scan with any UPI app/);
  assert.match(html, /I have paid/);
  assert.match(html, /Checking your payment/);
  assert.match(html, /you are in line/);
  assert.match(html, /Show this screen to the cashier/);
  assert.match(html, /replace this in the admin before a real payment/);
  assert.match(html, /bullpay\.profiles/);
  assert.equal(html.includes("replace-me@upi"), false);
});
