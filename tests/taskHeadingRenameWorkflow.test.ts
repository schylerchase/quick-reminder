import test from "node:test";
import assert from "node:assert/strict";
import { runTaskHeadingRenameWorkflow } from "../src/lib/taskHeadingRenameWorkflow";

test("task heading rename workflow reports source update failure before refresh", async () => {
  const error = new Error("write failed");
  let refreshed = false;
  let captured: unknown = null;

  const result = await runTaskHeadingRenameWorkflow({
    renameHeading: async () => {
      throw error;
    },
    afterRename: async () => {
      refreshed = true;
    },
    onRenameError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, { ok: false, renamed: false, error });
  assert.equal(refreshed, false);
  assert.equal(captured, error);
});

test("task heading rename workflow stops refresh when source update is declined", async () => {
  let refreshed = false;

  const result = await runTaskHeadingRenameWorkflow({
    renameHeading: async () => false,
    afterRename: async () => {
      refreshed = true;
    },
  });

  assert.deepEqual(result, { ok: false, renamed: false });
  assert.equal(refreshed, false);
});

test("task heading rename workflow distinguishes refresh failure after rename", async () => {
  const error = new Error("render failed");
  let captured: unknown = null;

  const result = await runTaskHeadingRenameWorkflow({
    renameHeading: async () => true,
    afterRename: async () => {
      throw error;
    },
    onAfterRenameError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, { ok: false, renamed: true, error });
  assert.equal(captured, error);
});

test("task heading rename workflow succeeds after source update and refresh", async () => {
  let refreshed = false;

  const result = await runTaskHeadingRenameWorkflow({
    renameHeading: async () => true,
    afterRename: async () => {
      refreshed = true;
    },
  });

  assert.deepEqual(result, { ok: true, renamed: true });
  assert.equal(refreshed, true);
});
