import test from "node:test";
import assert from "node:assert/strict";
import { saveScheduledReminder } from "../src/reminderTransaction";
import type { Reminder } from "../src/types";

test("saveScheduledReminder rolls back a saved and scheduled reminder when the post-save edit fails", async () => {
  const reminder = createReminder();
  const calls: string[] = [];
  const store = {
    async add(value: Reminder) {
      calls.push(`add:${value.id}`);
    },
    async remove(id: string) {
      calls.push(`remove:${id}`);
    },
  };
  const scheduler = {
    schedule(value: Reminder) {
      calls.push(`schedule:${value.id}`);
    },
    cancel(id: string) {
      calls.push(`cancel:${id}`);
    },
  };

  await assert.rejects(
    () =>
      saveScheduledReminder(store, scheduler, reminder, () => {
        throw new Error("editor detached");
      }),
    /editor detached/,
  );

  assert.deepEqual(calls, [
    "add:r1",
    "schedule:r1",
    "cancel:r1",
    "remove:r1",
  ]);
});

test("saveScheduledReminder rolls back the store write when scheduling fails", async () => {
  const reminder = createReminder();
  const calls: string[] = [];
  const store = {
    async add(value: Reminder) {
      calls.push(`add:${value.id}`);
    },
    async remove(id: string) {
      calls.push(`remove:${id}`);
    },
  };
  const scheduler = {
    schedule() {
      calls.push("schedule");
      throw new Error("timer failed");
    },
    cancel(id: string) {
      calls.push(`cancel:${id}`);
    },
  };

  await assert.rejects(
    () => saveScheduledReminder(store, scheduler, reminder),
    /timer failed/,
  );

  assert.deepEqual(calls, ["add:r1", "schedule", "cancel:r1", "remove:r1"]);
});

test("saveScheduledReminder leaves the reminder alone after a successful post-save edit", async () => {
  const reminder = createReminder();
  const calls: string[] = [];
  const store = {
    async add(value: Reminder) {
      calls.push(`add:${value.id}`);
    },
    async remove(id: string) {
      calls.push(`remove:${id}`);
    },
  };
  const scheduler = {
    schedule(value: Reminder) {
      calls.push(`schedule:${value.id}`);
    },
    cancel(id: string) {
      calls.push(`cancel:${id}`);
    },
  };

  await saveScheduledReminder(store, scheduler, reminder, () => {
    calls.push("edit");
  });

  assert.deepEqual(calls, ["add:r1", "schedule:r1", "edit"]);
});

function createReminder(patch: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    text: "pay bill",
    rawInput: "pay bill tomorrow",
    dueAt: Date.now() + 60_000,
    createdAt: Date.now(),
    notified: false,
    ...patch,
  };
}
