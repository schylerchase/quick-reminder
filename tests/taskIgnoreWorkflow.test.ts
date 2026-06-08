import test from "node:test";
import assert from "node:assert/strict";
import { runTaskIgnoreWorkflow } from "../src/lib/taskIgnoreWorkflow";

test("task ignore workflow reports store failure without refreshing", async () => {
  let refreshed = false;
  const storeError = new Error("plugin data write failed");
  let captured: unknown = null;

  const result = await runTaskIgnoreWorkflow({
    setIgnored: async () => {
      throw storeError;
    },
    afterSetIgnored: async () => {
      refreshed = true;
    },
    onSetIgnoredError: (error) => {
      captured = error;
    },
  });

  assert.deepEqual(result, { ok: false, changed: false, error: storeError });
  assert.equal(refreshed, false);
  assert.equal(captured, storeError);
});

test("task ignore workflow distinguishes refresh failure after visibility changes", async () => {
  const refreshError = new Error("dashboard render failed");
  let captured: unknown = null;

  const result = await runTaskIgnoreWorkflow({
    setIgnored: async () => {},
    afterSetIgnored: async () => {
      throw refreshError;
    },
    onAfterSetIgnoredError: (error) => {
      captured = error;
    },
  });

  assert.deepEqual(result, { ok: false, changed: true, error: refreshError });
  assert.equal(captured, refreshError);
});

test("task ignore workflow succeeds after visibility change and refresh", async () => {
  let refreshed = false;

  const result = await runTaskIgnoreWorkflow({
    setIgnored: async () => {},
    afterSetIgnored: async () => {
      refreshed = true;
    },
  });

  assert.deepEqual(result, { ok: true, changed: true });
  assert.equal(refreshed, true);
});
