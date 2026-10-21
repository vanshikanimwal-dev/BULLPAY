import assert from "node:assert/strict";
import test from "node:test";
import { browserScriptSource, verifyAndParseWebhook } from "../src/index.js";
import { signBody } from "@bullpay/common";

test("the browser script exposes the pay attribute and the result event", () => {
  const source = browserScriptSource();
  assert.match(source, /data-bullpay-pay/);
  assert.match(source, /bullpay:payment:result/);
  assert.match(source, /\(window\)\.Bullpay/);
});

test("the sdk rejects a webhook body changed after signing", () => {
  const raw = Buffer.from(JSON.stringify({ event: "SUCCESS", amount: "499.00" }));
  const signature = signBody(raw, "secret");
  assert.equal(verifyAndParseWebhook({ rawBody: raw, signatureHeader: signature, secret: "secret" }).ok, true);
  const changed = Buffer.from(JSON.stringify({ event: "SUCCESS", amount: "499.01" }));
  assert.equal(verifyAndParseWebhook({ rawBody: changed, signatureHeader: signature, secret: "secret" }).ok, false);
});
