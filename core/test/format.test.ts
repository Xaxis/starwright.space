import assert from "node:assert/strict";
import { test } from "node:test";
import { format, sci, sig } from "../src/format.ts";

test("numbers print to three significant figures with separators", () => {
  assert.equal(sig(19024.4), "19,000");
  assert.equal(sig(0.012345), "0.0123");
  assert.equal(sig(3.14159, 2), "3.1");
});

test("powers of ten print with superscripts", () => {
  assert.equal(sci(3.828e26), "3.8 × 10²⁶");
  assert.equal(sci(9.99e15), "1 × 10¹⁶");
});

test("each unit prints in words a reader knows until they run out", () => {
  assert.equal(format(1.902e13, "W"), "19 TW");
  assert.equal(format(1e16, "W"), "10 PW");
  assert.equal(format(3.83e26, "W"), "3.8 × 10²⁶ W");
  assert.equal(format(2.4e9, "kg"), "2.4 million t");
  assert.equal(format(3.3e23, "kg"), "3.3 × 10²³ kg");
  assert.equal(format(2071.6, "year"), "2072");
  assert.equal(format(Number.POSITIVE_INFINITY, "year"), "never");
  assert.equal(format(0.03, "1/yr"), "3% a year");
  assert.equal(format(0.25, "share"), "25%");
  assert.equal(format(0.7281, "K"), "0.73");
  assert.equal(format(1, "yr"), "1 year");
  assert.equal(format(12.34, "yr"), "12.3 years");
});
