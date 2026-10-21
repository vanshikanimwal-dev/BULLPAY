import assert from "node:assert/strict";
import test from "node:test";
import { MoneyError, paiseToRupees, rupeesToPaise } from "../src/index.js";

test("499.00 rupees becomes 49900 paise", () => {
  assert.equal(rupeesToPaise("499.00"), 49900);
  assert.equal(paiseToRupees(49900), "499.00");
});

test("a third decimal place is rejected", () => {
  assert.throws(() => rupeesToPaise("499.001"), MoneyError);
});

test("zero and negative amounts are rejected", () => {
  assert.throws(() => rupeesToPaise("0.00"), MoneyError);
  assert.throws(() => rupeesToPaise("-1.00"), MoneyError);
  assert.throws(() => rupeesToPaise("0"), MoneyError);
});

test("one decimal place is padded to paise", () => {
  assert.equal(rupeesToPaise("1.2"), 120);
  assert.equal(rupeesToPaise("1"), 100);
});
