import test from "node:test";
import assert from "node:assert/strict";
import { runDashboardScanWorkflow } from "../src/lib/dashboardScanWorkflow";

test("dashboard scan workflow reports success with the scanned task count", async () => {
  const calls: string[] = [];

  const result = await runDashboardScanWorkflow({
    scan: async () => {
      calls.push("scan");
      return 4;
    },
    refresh: async () => {
      calls.push("refresh");
    },
  });

  assert.deepEqual(result, { ok: true, scanned: true, taskCount: 4 });
  assert.deepEqual(calls, ["scan", "refresh"]);
});

test("dashboard scan workflow reports scan failures without refreshing", async () => {
  const error = new Error("scanner failed");
  const calls: string[] = [];
  let captured: unknown = null;

  const result = await runDashboardScanWorkflow({
    scan: async () => {
      calls.push("scan");
      throw error;
    },
    refresh: async () => {
      calls.push("refresh");
    },
    onScanError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, { ok: false, scanned: false, error });
  assert.deepEqual(calls, ["scan"]);
  assert.equal(captured, error);
});

test("dashboard scan workflow treats null scan result as a scan failure", async () => {
  const result = await runDashboardScanWorkflow({
    scan: async () => null,
    refresh: async () => {
      throw new Error("must not refresh");
    },
  });

  assert.deepEqual(result, { ok: false, scanned: false });
});

test("dashboard scan workflow distinguishes refresh failure after scan succeeds", async () => {
  const error = new Error("render failed");
  let captured: unknown = null;

  const result = await runDashboardScanWorkflow({
    scan: async () => 6,
    refresh: async () => {
      throw error;
    },
    onRefreshError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, { ok: false, scanned: true, taskCount: 6, error });
  assert.equal(captured, error);
});
