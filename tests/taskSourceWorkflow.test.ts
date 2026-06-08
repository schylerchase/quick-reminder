import test from "node:test";
import assert from "node:assert/strict";
import { runTaskSourceOpenWorkflow } from "../src/lib/taskSourceWorkflow";

test("task source workflow reports a missing source before pane work", async () => {
  let lookedForPane = false;

  const result = await runTaskSourceOpenWorkflow({
    getSource: () => null,
    getPane: () => {
      lookedForPane = true;
      return "pane";
    },
    openPane: async () => {},
    revealPane: async () => {},
    focusPane: () => {},
    focusCursor: () => {},
  });

  assert.deepEqual(result, { ok: false, stage: "source" });
  assert.equal(lookedForPane, false);
});

test("task source workflow reports a missing pane before opening", async () => {
  let opened = false;

  const result = await runTaskSourceOpenWorkflow({
    getSource: () => "source",
    getPane: () => null,
    openPane: async () => {
      opened = true;
    },
    revealPane: async () => {},
    focusPane: () => {},
    focusCursor: () => {},
  });

  assert.deepEqual(result, { ok: false, stage: "pane", source: "source" });
  assert.equal(opened, false);
});

test("task source workflow distinguishes open failure", async () => {
  const openError = new Error("leaf open failed");
  let captured: unknown = null;

  const result = await runTaskSourceOpenWorkflow({
    getSource: () => "source",
    getPane: () => "pane",
    openPane: async () => {
      throw openError;
    },
    revealPane: async () => {},
    focusPane: () => {},
    focusCursor: () => {},
    onError: (stage, error) => {
      captured = { stage, error };
    },
  });

  assert.deepEqual(result, {
    ok: false,
    stage: "open",
    source: "source",
    pane: "pane",
    error: openError,
  });
  assert.deepEqual(captured, { stage: "open", error: openError });
});

test("task source workflow distinguishes cursor focus failure after pane open", async () => {
  const cursorError = new Error("editor focus failed");
  const calls: string[] = [];

  const result = await runTaskSourceOpenWorkflow({
    getSource: () => "source",
    getPane: () => "pane",
    openPane: async () => {
      calls.push("open");
    },
    revealPane: async () => {
      calls.push("reveal");
    },
    focusPane: () => {
      calls.push("focus-pane");
    },
    focusCursor: () => {
      calls.push("focus-cursor");
      throw cursorError;
    },
  });

  assert.deepEqual(result, {
    ok: false,
    stage: "cursor",
    source: "source",
    pane: "pane",
    error: cursorError,
  });
  assert.deepEqual(calls, ["open", "reveal", "focus-pane", "focus-cursor"]);
});

test("task source workflow succeeds after source pane is focused", async () => {
  const calls: string[] = [];

  const result = await runTaskSourceOpenWorkflow({
    getSource: () => "source",
    getPane: () => "pane",
    openPane: async () => {
      calls.push("open");
    },
    revealPane: async () => {
      calls.push("reveal");
    },
    focusPane: () => {
      calls.push("focus-pane");
    },
    focusCursor: () => {
      calls.push("focus-cursor");
    },
  });

  assert.deepEqual(result, { ok: true, source: "source", pane: "pane" });
  assert.deepEqual(calls, ["open", "reveal", "focus-pane", "focus-cursor"]);
});
