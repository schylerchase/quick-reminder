import test from "node:test";
import assert from "node:assert/strict";
import {
  getReminderActionFailedNotice,
  getReminderActionRefreshFailedNotice,
  getReminderCreatedNotice,
  getReminderEditInvalidNotice,
  getReminderFallbackNotice,
  getReminderMissedCatchupNotice,
  getReminderPastTimeNotice,
  getReminderSaveFailedNotice,
  getReminderSelectionMissingNotice,
  getReminderSelectionTimeMissingNotice,
  getReminderTextMissingNotice,
  getReminderTimeMissingNotice,
  getTaskReminderCreatedNotice,
  getTaskReminderDuplicateNotice,
  getTaskReminderRefreshFailedNotice,
  getTaskReminderTimeMissingNotice,
} from "../src/lib/reminderMessages";

test("reminder save failure notice gives an in-app next step", () => {
  const notice = getReminderSaveFailedNotice();

  assert.match(notice, /could not save this reminder/i);
  assert.match(notice, /try again/i);
  assert.doesNotMatch(notice, /console/i);
});

test("reminder created notice is shared across capture entry points", () => {
  const notice = getReminderCreatedNotice("call Sam", "Tomorrow, 3:00 PM");

  assert.match(notice, /reminder set/i);
  assert.match(notice, /Tomorrow, 3:00 PM/);
  assert.match(notice, /call Sam/);
  assert.doesNotMatch(notice, / - /);
});

test("reminder capture validation notices stay short and actionable", () => {
  assert.match(getReminderTextMissingNotice(), /reminder text/i);
  assert.match(getReminderTextMissingNotice(), /saving/i);

  assert.match(getReminderTimeMissingNotice(), /time/i);
  assert.match(getReminderTimeMissingNotice(), /tomorrow 3pm/i);

  assert.match(getReminderPastTimeNotice(), /future/i);
  assert.doesNotMatch(getReminderPastTimeNotice(), /past/i);
});

test("selection reminder validation notices explain the command preconditions", () => {
  assert.match(getReminderSelectionMissingNotice(), /select text/i);
  assert.match(getReminderSelectionMissingNotice(), /reminder/i);

  assert.match(getReminderSelectionTimeMissingNotice(), /selection/i);
  assert.match(getReminderSelectionTimeMissingNotice(), /tomorrow 3pm/i);
});

test("reminder edit validation notices preserve the manager workflow", () => {
  assert.match(getReminderEditInvalidNotice(), /text/i);
  assert.match(getReminderEditInvalidNotice(), /valid time/i);
  assert.match(getTaskReminderTimeMissingNotice(), /task was added/i);
  assert.match(getTaskReminderTimeMissingNotice(), /Add reminder/i);
});

test("reminder action failure notice names the failed action", () => {
  const notice = getReminderActionFailedNotice("snooze this reminder");

  assert.match(notice, /could not snooze this reminder/i);
  assert.match(notice, /try again/i);
  assert.doesNotMatch(notice, /console/i);
});

test("reminder action refresh failure notice says the reminder already changed", () => {
  const notice = getReminderActionRefreshFailedNotice();

  assert.match(notice, /reminder was updated/i);
  assert.match(notice, /could not refresh/i);
  assert.match(notice, /reload Obsidian/i);
});

test("reminder notification notices explain catch-up and fallback behavior", () => {
  assert.match(getReminderMissedCatchupNotice(2), /2 missed reminders/i);
  assert.match(getReminderMissedCatchupNotice(2), /showing them now/i);

  assert.match(getReminderFallbackNotice("pay bill"), /reminder due/i);
  assert.match(getReminderFallbackNotice("pay bill"), /pay bill/i);
});

test("task reminder refresh failure notice says the reminder already exists", () => {
  const notice = getTaskReminderRefreshFailedNotice();

  assert.match(notice, /reminder was added/i);
  assert.match(notice, /could not refresh/i);
  assert.match(notice, /reload Obsidian/i);
});

test("task reminder created notice avoids source implementation details", () => {
  const notice = getTaskReminderCreatedNotice("call Sam");

  assert.match(notice, /reminder added to this task/i);
  assert.match(notice, /call Sam/);
  assert.doesNotMatch(notice, /Projects\/Launch.md/);
  assert.doesNotMatch(notice, /:\d+/);
});

test("task reminder duplicate notice points to the existing linked reminder", () => {
  const notice = getTaskReminderDuplicateNotice();

  assert.match(notice, /already has a reminder/i);
  assert.match(notice, /Reminder set/i);
  assert.doesNotMatch(notice, /console/i);
});
