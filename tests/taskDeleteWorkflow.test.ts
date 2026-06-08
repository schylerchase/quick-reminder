import test from "node:test";
import assert from "node:assert/strict";
import { runTaskDeleteWorkflow } from "../src/lib/taskDeleteWorkflow";

test("task delete workflow reports source edit failure without post-delete cleanup", async () => {
  let cleanedUp = false;
  const sourceError = new Error("vault write failed");
  let captured: unknown = null;

  const result = await runTaskDeleteWorkflow({
    deleteTask: async () => {
      throw sourceError;
    },
    afterDelete: async () => {
      cleanedUp = true;
    },
    onDeleteError: (error) => {
      captured = error;
    },
  });

  assert.deepEqual(result, { ok: false, deleted: false, error: sourceError });
  assert.equal(cleanedUp, false);
  assert.equal(captured, sourceError);
});

test("task delete workflow reports declined source edit without post-delete cleanup", async () => {
  let cleanedUp = false;

  const result = await runTaskDeleteWorkflow({
    deleteTask: async () => false,
    afterDelete: async () => {
      cleanedUp = true;
    },
  });

  assert.deepEqual(result, { ok: false, deleted: false });
  assert.equal(cleanedUp, false);
});

test("task delete workflow distinguishes refresh failure after deletion succeeds", async () => {
  const refreshError = new Error("workspace render failed");
  let captured: unknown = null;

  const result = await runTaskDeleteWorkflow({
    deleteTask: async () => true,
    afterDelete: async () => {
      throw refreshError;
    },
    onAfterDeleteError: (error) => {
      captured = error;
    },
  });

  assert.deepEqual(result, { ok: false, deleted: true, error: refreshError });
  assert.equal(captured, refreshError);
});

test("task delete workflow succeeds after source edit and refresh complete", async () => {
  let cleanedUp = false;

  const result = await runTaskDeleteWorkflow({
    deleteTask: async () => true,
    afterDelete: async () => {
      cleanedUp = true;
    },
  });

  assert.deepEqual(result, { ok: true, deleted: true });
  assert.equal(cleanedUp, true);
});
