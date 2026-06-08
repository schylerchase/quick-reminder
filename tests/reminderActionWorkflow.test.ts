import test from "node:test";
import assert from "node:assert/strict";
import { runReminderActionWorkflow } from "../src/lib/reminderActionWorkflow";

test("reminder action workflow reports success after the action completes", async () => {
  let ran = false;

  const result = await runReminderActionWorkflow({
    run: async () => {
      ran = true;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(ran, true);
});

test("reminder action workflow refreshes after the action succeeds", async () => {
  const calls: string[] = [];

  const result = await runReminderActionWorkflow({
    run: async () => {
      calls.push("run");
    },
    refresh: async () => {
      calls.push("refresh");
    },
  });

  assert.deepEqual(result, { ok: true, actionCompleted: true });
  assert.deepEqual(calls, ["run", "refresh"]);
});

test("reminder action workflow catches store or scheduler failures", async () => {
  const error = new Error("save failed");
  let captured: unknown = null;
  const calls: string[] = [];

  const result = await runReminderActionWorkflow({
    run: async () => {
      calls.push("run");
      throw error;
    },
    refresh: async () => {
      calls.push("refresh");
    },
    onError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, { ok: false, actionCompleted: false, error });
  assert.deepEqual(calls, ["run"]);
  assert.equal(captured, error);
});

test("reminder action workflow distinguishes refresh failures after action succeeds", async () => {
  const error = new Error("render failed");
  let captured: unknown = null;

  const result = await runReminderActionWorkflow({
    run: async () => {},
    refresh: async () => {
      throw error;
    },
    onRefreshError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, { ok: false, actionCompleted: true, error });
  assert.equal(captured, error);
});

test("reminder action workflow ignores re-entry while an action is running", async () => {
  let isRunning = false;
  let runCalls = 0;
  let refreshed = 0;
  let finishRun: (() => void) | null = null;

  const workflow = {
    isRunning: () => isRunning,
    setRunning: (next: boolean) => {
      isRunning = next;
    },
    run: async () => {
      runCalls += 1;
      await new Promise<void>((resolve) => {
        finishRun = resolve;
      });
    },
    refresh: async () => {
      refreshed += 1;
    },
  };

  const first = runReminderActionWorkflow(workflow);
  await Promise.resolve();

  const second = await runReminderActionWorkflow(workflow);
  assert.deepEqual(second, { ok: false, actionCompleted: false, ignored: true });
  assert.equal(runCalls, 1);
  assert.equal(isRunning, true);
  assert.equal(refreshed, 0);

  finishRun?.();
  assert.deepEqual(await first, { ok: true, actionCompleted: true });
  assert.equal(isRunning, false);
  assert.equal(refreshed, 1);
});
