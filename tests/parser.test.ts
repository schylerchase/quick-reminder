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
