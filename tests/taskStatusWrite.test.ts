import test from "node:test";
import assert from "node:assert/strict";
import {
  runTaskStatusUpdateWorkflow,
  writeTaskStatusChange,
} from "../src/lib/taskStatusWrite";

test("task status write returns the updated task when the source edit succeeds", async () => {
  const updated = { id: "next-task" };

  const result = await writeTaskStatusChange({
    setStatus: async () => updated,
  });

  assert.equal(result, updated);
});

test("task status write returns null when the source edit cannot update the task", async () => {
  const result = await writeTaskStatusChange({
    setStatus: async () => null,
  });

  assert.equal(result, null);
});

test("task status write catches source edit errors for the caller to recover", async () => {
  const error = new Error("vault write failed");
  let captured: unknown = null;

  const result = await writeTaskStatusChange({
    setStatus: async () => {
      throw error;
    },
    onError: (reason) => {
      captured = reason;
    },
  });

  assert.equal(result, null);
  assert.equal(captured, error);
});

test("task status update workflow reports source edit failure before refresh work", async () => {
  const error = new Error("vault write failed");
  let refreshed = false;
  let captured: unknown = null;

  const result = await runTaskStatusUpdateWorkflow({
    updateStatus: async () => {
      throw error;
    },
    afterUpdate: async () => {
      refreshed = true;
    },
    onUpdateError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, { ok: false, updated: false, error });
  assert.equal(refreshed, false);
  assert.equal(captured, error);
});

test("task status update workflow reports null source edit before refresh work", async () => {
  let refreshed = false;

  const result = await runTaskStatusUpdateWorkflow({
    updateStatus: async () => null,
    afterUpdate: async () => {
      refreshed = true;
    },
  });

  assert.deepEqual(result, { ok: false, updated: false });
  assert.equal(refreshed, false);
});

test("task status update workflow distinguishes refresh failure after status update", async () => {
  const task = { id: "task-next" };
  const error = new Error("render failed");
  let captured: unknown = null;

  const result = await runTaskStatusUpdateWorkflow({
    updateStatus: async () => task,
    afterUpdate: async () => {
      throw error;
    },
    onAfterUpdateError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, { ok: false, updated: true, task, error });
  assert.equal(captured, error);
});

test("task status update workflow succeeds after source update and refresh", async () => {
  const task = { id: "task-next" };
  let refreshed = false;

  const result = await runTaskStatusUpdateWorkflow({
    updateStatus: async () => task,
    afterUpdate: async () => {
      refreshed = true;
    },
  });

  assert.deepEqual(result, { ok: true, updated: true, task });
  assert.equal(refreshed, true);
});
