import test from "node:test";
import assert from "node:assert/strict";
import {
  runExistingTaskReminderWorkflow,
  saveTaskBackedReminder,
} from "../src/lib/taskReminderWorkflow";

test("task-backed reminder workflow leaves the task alone after reminder save succeeds", async () => {
  const calls: string[] = [];

  const result = await saveTaskBackedReminder({
    saveReminder: async () => {
      calls.push("save");
    },
    deleteTask: async () => {
      calls.push("delete");
      return true;
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, ["save"]);
});

test("task-backed reminder workflow removes the new task when reminder save fails", async () => {
  const calls: string[] = [];

  const result = await saveTaskBackedReminder({
    saveReminder: async () => {
      calls.push("save");
      throw new Error("timer failed");
    },
    deleteTask: async () => {
      calls.push("delete");
      return true;
    },
  });

  assert.deepEqual(result, { ok: false, rolledBackTask: true });
  assert.deepEqual(calls, ["save", "delete"]);
});

test("task-backed reminder workflow reports when rollback could not remove the task", async () => {
  const rollbackErrors: string[] = [];

  const result = await saveTaskBackedReminder({
    saveReminder: async () => {
      throw new Error("timer failed");
    },
    deleteTask: async () => false,
    onRollbackError: (error) => rollbackErrors.push(String(error)),
  });

  assert.deepEqual(result, { ok: false, rolledBackTask: false });
  assert.deepEqual(rollbackErrors, ["Task rollback returned false"]);
});

test("existing task reminder workflow reports reminder save failure before refresh", async () => {
  let refreshed = false;
  const saveError = new Error("scheduler failed");
  let captured: unknown = null;

  const result = await runExistingTaskReminderWorkflow({
    saveReminder: async () => {
      throw saveError;
    },
    afterSave: async () => {
      refreshed = true;
    },
    onSaveError: (error) => {
      captured = error;
    },
  });

  assert.deepEqual(result, { ok: false, reminderSaved: false, error: saveError });
  assert.equal(refreshed, false);
  assert.equal(captured, saveError);
});

test("existing task reminder workflow blocks duplicate linked reminders before saving", async () => {
  const calls: string[] = [];

  const result = await runExistingTaskReminderWorkflow({
    hasExistingReminder: () => true,
    saveReminder: async () => {
      calls.push("save");
    },
    afterSave: async () => {
      calls.push("refresh");
    },
    onDuplicate: () => {
      calls.push("duplicate");
    },
  });

  assert.deepEqual(result, {
    ok: false,
    reminderSaved: false,
    duplicate: true,
  });
  assert.deepEqual(calls, ["duplicate"]);
});

test("existing task reminder workflow distinguishes refresh failure after save", async () => {
  const refreshError = new Error("render failed");
  let captured: unknown = null;

  const result = await runExistingTaskReminderWorkflow({
    saveReminder: async () => {},
    afterSave: async () => {
      throw refreshError;
    },
    onAfterSaveError: (error) => {
      captured = error;
    },
  });

  assert.deepEqual(result, { ok: false, reminderSaved: true, error: refreshError });
  assert.equal(captured, refreshError);
});

test("existing task reminder workflow succeeds after save and refresh", async () => {
  const calls: string[] = [];

  const result = await runExistingTaskReminderWorkflow({
    saveReminder: async () => {
      calls.push("save");
    },
    afterSave: async () => {
      calls.push("refresh");
    },
  });

  assert.deepEqual(result, { ok: true, reminderSaved: true });
  assert.deepEqual(calls, ["save", "refresh"]);
});
