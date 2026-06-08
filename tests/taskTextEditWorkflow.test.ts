import test from "node:test";
import assert from "node:assert/strict";
import { runTaskTextEditWorkflow } from "../src/lib/taskTextEditWorkflow";

test("task text edit workflow reports source edit failure before refresh work", async () => {
  let refreshed = false;
  const error = new Error("vault process failed");
  let captured: unknown = null;

  const result = await runTaskTextEditWorkflow({
    updateTask: async () => {
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

test("task text edit workflow reports null source edit before refresh work", async () => {
  let refreshed = false;

  const result = await runTaskTextEditWorkflow({
    updateTask: async () => null,
    afterUpdate: async () => {
      refreshed = true;
    },
  });

  assert.deepEqual(result, { ok: false, updated: false });
  assert.equal(refreshed, false);
});

test("task text edit workflow distinguishes refresh failure after task update", async () => {
  const task = { id: "task-next" };
  const error = new Error("render failed");
  let captured: unknown = null;

  const result = await runTaskTextEditWorkflow({
    updateTask: async () => task,
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

test("task text edit workflow succeeds after source update and refresh", async () => {
  const task = { id: "task-next" };
  let refreshed = false;

  const result = await runTaskTextEditWorkflow({
    updateTask: async () => task,
    afterUpdate: async () => {
      refreshed = true;
    },
  });

  assert.deepEqual(result, { ok: true, updated: true, task });
  assert.equal(refreshed, true);
});
