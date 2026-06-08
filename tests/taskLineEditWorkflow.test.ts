import test from "node:test";
import assert from "node:assert/strict";
import { runTaskLineEditWorkflow } from "../src/lib/taskLineEditWorkflow";

test("task line edit workflow reports read failure before opening editor", async () => {
  const error = new Error("read failed");
  const calls: string[] = [];
  let captured: unknown = null;

  const result = await runTaskLineEditWorkflow({
    readTaskLine: async () => {
      calls.push("read");
      throw error;
    },
    editTaskLine: async () => {
      calls.push("edit");
      return "- [ ] updated";
    },
    writeTaskLine: async () => {
      calls.push("write");
      return { id: "updated" };
    },
    afterWrite: async () => {
      calls.push("refresh");
    },
    onReadError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, { ok: false, stage: "read", error });
  assert.deepEqual(calls, ["read"]);
  assert.equal(captured, error);
});

test("task line edit workflow treats empty read as read failure", async () => {
  let edited = false;

  const result = await runTaskLineEditWorkflow({
    readTaskLine: async () => null,
    editTaskLine: async () => {
      edited = true;
      return "- [ ] updated";
    },
    writeTaskLine: async () => ({ id: "updated" }),
    afterWrite: async () => {},
  });

  assert.deepEqual(result, { ok: false, stage: "read" });
  assert.equal(edited, false);
});

test("task line edit workflow exits quietly when editor is canceled", async () => {
  const calls: string[] = [];

  const result = await runTaskLineEditWorkflow({
    readTaskLine: async () => "- [ ] original",
    editTaskLine: async () => {
      calls.push("edit");
      return null;
    },
    writeTaskLine: async () => {
      calls.push("write");
      return { id: "updated" };
    },
    afterWrite: async () => {
      calls.push("refresh");
    },
  });

  assert.deepEqual(result, { ok: true, changed: false });
  assert.deepEqual(calls, ["edit"]);
});

test("task line edit workflow exits quietly when editor returns unchanged line", async () => {
  const calls: string[] = [];

  const result = await runTaskLineEditWorkflow({
    readTaskLine: async () => "- [ ] original",
    editTaskLine: async () => "- [ ] original",
    writeTaskLine: async () => {
      calls.push("write");
      return { id: "updated" };
    },
    afterWrite: async () => {
      calls.push("refresh");
    },
  });

  assert.deepEqual(result, { ok: true, changed: false });
  assert.deepEqual(calls, []);
});

test("task line edit workflow reports editor failure before source update", async () => {
  const error = new Error("modal failed");
  const calls: string[] = [];
  let captured: unknown = null;

  const result = await runTaskLineEditWorkflow({
    readTaskLine: async () => "- [ ] original",
    editTaskLine: async () => {
      calls.push("edit");
      throw error;
    },
    writeTaskLine: async () => {
      calls.push("write");
      return { id: "updated" };
    },
    afterWrite: async () => {
      calls.push("refresh");
    },
    onEditError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, { ok: false, stage: "edit", error });
  assert.deepEqual(calls, ["edit"]);
  assert.equal(captured, error);
});

test("task line edit workflow reports source update failure before refresh", async () => {
  const error = new Error("write failed");
  const calls: string[] = [];
  let captured: unknown = null;

  const result = await runTaskLineEditWorkflow({
    readTaskLine: async () => "- [ ] original",
    editTaskLine: async () => "- [ ] updated",
    writeTaskLine: async () => {
      calls.push("write");
      throw error;
    },
    afterWrite: async () => {
      calls.push("refresh");
    },
    onWriteError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, { ok: false, stage: "write", error });
  assert.deepEqual(calls, ["write"]);
  assert.equal(captured, error);
});

test("task line edit workflow reports null source update before refresh", async () => {
  let refreshed = false;

  const result = await runTaskLineEditWorkflow({
    readTaskLine: async () => "- [ ] original",
    editTaskLine: async () => "- [ ] updated",
    writeTaskLine: async () => null,
    afterWrite: async () => {
      refreshed = true;
    },
  });

  assert.deepEqual(result, { ok: false, stage: "write" });
  assert.equal(refreshed, false);
});

test("task line edit workflow distinguishes refresh failure after source update", async () => {
  const task = { id: "updated" };
  const error = new Error("render failed");
  let captured: unknown = null;

  const result = await runTaskLineEditWorkflow({
    readTaskLine: async () => "- [ ] original",
    editTaskLine: async () => "- [ ] updated",
    writeTaskLine: async () => task,
    afterWrite: async () => {
      throw error;
    },
    onAfterWriteError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, { ok: false, stage: "afterWrite", task, error });
  assert.equal(captured, error);
});

test("task line edit workflow succeeds after source update and refresh", async () => {
  const task = { id: "updated" };
  let refreshed = false;

  const result = await runTaskLineEditWorkflow({
    readTaskLine: async () => "- [ ] original",
    editTaskLine: async () => "- [ ] updated",
    writeTaskLine: async () => task,
    afterWrite: async () => {
      refreshed = true;
    },
  });

  assert.deepEqual(result, { ok: true, changed: true, task });
  assert.equal(refreshed, true);
});
