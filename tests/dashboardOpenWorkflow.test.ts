import test from "node:test";
import assert from "node:assert/strict";
import { runDashboardOpenWorkflow } from "../src/lib/dashboardOpenWorkflow";

test("dashboard open workflow reports success after opening and refreshing", async () => {
  const calls: string[] = [];

  const result = await runDashboardOpenWorkflow({
    open: async () => {
      calls.push("open");
      return "leaf";
    },
    refresh: async (leaf) => {
      calls.push(`refresh:${leaf}`);
    },
  });

  assert.deepEqual(result, { ok: true, opened: true });
  assert.deepEqual(calls, ["open", "refresh:leaf"]);
});

test("dashboard open workflow reports open failure without refreshing", async () => {
  const error = new Error("workspace failed");
  const calls: string[] = [];
  let captured: unknown = null;

  const result = await runDashboardOpenWorkflow({
    open: async () => {
      calls.push("open");
      throw error;
    },
    refresh: async () => {
      calls.push("refresh");
    },
    onOpenError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, { ok: false, opened: false, error });
  assert.deepEqual(calls, ["open"]);
  assert.equal(captured, error);
});

test("dashboard open workflow treats missing leaves as open failures", async () => {
  const result = await runDashboardOpenWorkflow({
    open: async () => null,
  });

  assert.deepEqual(result, { ok: false, opened: false });
});

test("dashboard open workflow distinguishes refresh failure after opening", async () => {
  const error = new Error("render failed");
  let captured: unknown = null;

  const result = await runDashboardOpenWorkflow({
    open: async () => "leaf",
    refresh: async () => {
      throw error;
    },
    onRefreshError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, { ok: false, opened: true, error });
  assert.equal(captured, error);
});
