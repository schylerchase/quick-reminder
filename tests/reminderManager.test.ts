import test from "node:test";
import assert from "node:assert/strict";
import {
  getReminderManagerActionLabels,
  getReminderManagerSections,
} from "../src/lib/reminderManager";
import type { Reminder } from "../src/types";

test("reminder manager separates active reminders from history", () => {
  const sections = getReminderManagerSections([
    createReminder({ id: "done", notified: true, completedAt: 200 }),
    createReminder({ id: "pending", notified: false }),
  ]);

  assert.deepEqual(sections.map((section) => section.title), [
    "Pending reminders",
    "Completed and notified",
  ]);
  assert.deepEqual(sections[0].reminders.map((reminder) => reminder.id), ["pending"]);
  assert.deepEqual(sections[1].reminders.map((reminder) => reminder.id), ["done"]);
});

test("reminder manager exposes the full lifecycle actions by state", () => {
  assert.deepEqual(getReminderManagerActionLabels(false, 15), [
    "Done",
    "Snooze 15m",
    "Edit",
    "Delete",
  ]);

  assert.deepEqual(getReminderManagerActionLabels(true, 15), [
    "Restore",
    "Re-add",
    "Delete",
  ]);
});

function createReminder(patch: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    text: "call mom",
    rawInput: "call mom tomorrow",
    dueAt: Date.now() + 60_000,
    createdAt: Date.now(),
    notified: false,
    ...patch,
  };
}
