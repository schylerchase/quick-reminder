import test from "node:test";
import assert from "node:assert/strict";
import { getTaskReminderActionState } from "../src/lib/taskReminderAction";

test("task reminder action shows visible linked reminder context", () => {
  assert.deepEqual(getTaskReminderActionState(true, true), {
    badgeText: "Reminder set",
    buttonText: "Added",
    ariaLabel: "Reminder already added for this task",
    title: "Reminder already added",
    canAddReminder: false,
  });
});

test("task reminder action distinguishes missing time from addable tasks", () => {
  assert.deepEqual(getTaskReminderActionState(false, false), {
    badgeText: null,
    buttonText: "No time",
    ariaLabel: "Task exists, but no future reminder time was detected",
    title: "Add a future time such as tomorrow 3pm",
    canAddReminder: false,
  });

  assert.deepEqual(getTaskReminderActionState(false, true), {
    badgeText: null,
    buttonText: "Add reminder",
    ariaLabel: "Add reminder for this task",
    title: null,
    canAddReminder: true,
  });
});
