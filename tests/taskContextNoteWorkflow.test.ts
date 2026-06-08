import test from "node:test";
import assert from "node:assert/strict";
import { runTaskContextNoteWorkflow } from "../src/lib/taskContextNoteWorkflow";

test("task context note workflow reports status failure before notes work", async () => {
  const task = { id: "task-original" };
  const error = new Error("status failed");
  const calls: string[] = [];
  let captured: unknown = null;

  const result = await runTaskContextNoteWorkflow({
    task,
    changeStatus: async () => {
      calls.push("status");
      throw error;
    },
    saveNotes: async () => {
      calls.push("notes");
      return true;
    },
    afterSave: async () => {
      calls.push("refresh");
    },
    onStatusError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, {
    ok: false,
    stage: "status",
    task,
    statusChanged: false,
    notesChanged: false,
    error,
  });
  assert.deepEqual(calls, ["status"]);
  assert.equal(captured, error);
});

test("task context note workflow reports relink failure after status changed", async () => {
  const task = { id: "task-original" };
  const updated = { id: "task-updated" };
  const error = new Error("relink failed");
  const calls: string[] = [];
  let captured: unknown = null;

  const result = await runTaskContextNoteWorkflow({
    task,
    changeStatus: async () => {
      calls.push("status");
      return updated;
    },
    afterStatusChange: async () => {
      calls.push("relink");
      throw error;
    },
    saveNotes: async () => {
      calls.push("notes");
      return true;
    },
    afterSave: async () => {
      calls.push("refresh");
    },
    onAfterStatusError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, {
    ok: false,
    stage: "afterStatus",
    task: updated,
    statusChanged: true,
    notesChanged: false,
    error,
  });
  assert.deepEqual(calls, ["status", "relink"]);
  assert.equal(captured, error);
});

test("task context note workflow reports notes failure after status changed", async () => {
  const task = { id: "task-original" };
  const updated = { id: "task-updated" };
  const calls: string[] = [];

  const result = await runTaskContextNoteWorkflow({
    task,
    changeStatus: async () => {
      calls.push("status");
      return updated;
    },
    afterStatusChange: async () => {
      calls.push("relink");
    },
    saveNotes: async (currentTask) => {
      calls.push(`notes:${currentTask.id}`);
      return false;
    },
    afterSave: async () => {
      calls.push("refresh");
    },
  });

  assert.deepEqual(result, {
    ok: false,
    stage: "notes",
    task: updated,
    statusChanged: true,
    notesChanged: false,
  });
  assert.deepEqual(calls, ["status", "relink", "notes:task-updated"]);
});

test("task context note workflow reports refresh failure after notes save", async () => {
  const task = { id: "task-original" };
  const error = new Error("render failed");
  let captured: unknown = null;

  const result = await runTaskContextNoteWorkflow({
    task,
    saveNotes: async () => true,
    afterSave: async () => {
      throw error;
    },
    onAfterSaveError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, {
    ok: false,
    stage: "afterSave",
    task,
    statusChanged: false,
    notesChanged: true,
    error,
  });
  assert.equal(captured, error);
});

test("task context note workflow succeeds with status and notes changes", async () => {
  const task = { id: "task-original" };
  const updated = { id: "task-updated" };
  const calls: string[] = [];

  const result = await runTaskContextNoteWorkflow({
    task,
    changeStatus: async () => {
      calls.push("status");
      return updated;
    },
    afterStatusChange: async () => {
      calls.push("relink");
    },
    saveNotes: async (currentTask) => {
      calls.push(`notes:${currentTask.id}`);
      return true;
    },
    afterSave: async () => {
      calls.push("refresh");
    },
  });

  assert.deepEqual(result, {
    ok: true,
    task: updated,
    statusChanged: true,
    notesChanged: true,
  });
  assert.deepEqual(calls, ["status", "relink", "notes:task-updated", "refresh"]);
});
