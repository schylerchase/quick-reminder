import test from "node:test";
import assert from "node:assert/strict";
import { parseReminder } from "../src/parser";

test("parseReminder extracts relative due time and task text", () => {
  const ref = new Date("2026-01-15T12:00:00-05:00");
  const result = parseReminder("call mom in 2 hours", ref);

  assert.equal(result.text, "call mom");
  assert.equal(result.matchedText, "in 2 hours");
  assert.equal(new Date(result.dueAt ?? 0).toISOString(), "2026-01-15T19:00:00.000Z");
});

test("parseReminder returns empty result for empty/whitespace input", () => {
  assert.deepEqual(parseReminder(""), { text: "", dueAt: null, matchedText: null });
  assert.deepEqual(parseReminder("   "), { text: "", dueAt: null, matchedText: null });
});

test("parseReminder returns null due time when no date phrase is present", () => {
  const result = parseReminder("buy milk");
  assert.equal(result.text, "buy milk");
  assert.equal(result.dueAt, null);
  assert.equal(result.matchedText, null);
});

test("parseReminder preserves words ending in connector tokens (Marvin, begin, Burton)", () => {
  const ref = new Date("2026-01-15T12:00:00-05:00");
  // Previously the trailing-connector regex chewed "in" off "Marvin",
  // "on" off "Burton", etc. — leaving truncated nonsense.
  for (const [input, expected] of [
    ["Marvin tomorrow", "Marvin"],
    ["call Burton tomorrow", "call Burton"],
    ["begin tomorrow", "begin"],
  ] as const) {
    const result = parseReminder(input, ref);
    assert.equal(result.text, expected, `expected "${expected}" from "${input}"`);
  }
});
