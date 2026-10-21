import assert from "node:assert/strict";
import test from "node:test";
import { adminPage } from "../src/page.js";

test("the admin page keeps the token in sessionStorage and treats the webhook secret as write-only", () => {
  const html = adminPage({ apiOrigin: "http://127.0.0.1:6100" });
  assert.match(html, /sessionStorage/);
  assert.match(html, /write-only/);
  assert.match(html, /never displayed/);
  assert.match(html, /Live adapter/);
  assert.equal(html.includes("enc:v1:"), false);
});
