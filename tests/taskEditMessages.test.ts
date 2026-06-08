import test from "node:test";
import assert from "node:assert/strict";
import {
  getTaskIgnoreFailedNotice,
  getTaskIgnoreRefreshFailedNotice,
  getTaskInlineAddCategoryFailedNotice,
  getTaskInlineAddFailedNotice,
  getManagedBlockUpdateFailedNotice,
  getTaskAppendFailedNotice,
  getTaskAddedNotice,
  getTaskAndNotesUpdatedNotice,
  getTaskCategoryAddedNotice,
  getTaskCategoryRenamedNotice,
  getTaskCreateRefreshFailedNotice,
  getTaskCreateReminderTimeMissingNotice,
  getTaskCreateStatusFailedNotice,
  getTaskCreateStatusRefreshFailedNotice,
  getTaskCreateTextMissingNotice,
  getTaskContextRefreshFailedNotice,
  getTaskReminderCreateFailedNotice,
  getTaskDeletedNotice,
  getTaskIgnoredNotice,
  getTaskNotesSavedNotice,
  getTaskStatusChangedNotesFailedNotice,
  getTaskStatusChangedRefreshFailedNotice,
  getTaskLineEditFailedNotice,
  getTaskLineReadFailedNotice,
  getTasksPluginUnavailableNotice,
  getTaskLineUpdateFailedNotice,
  getTaskLineUpdateRefreshFailedNotice,
  getTaskHeadingRenameFailedNotice,
  getTaskHeadingRenameRefreshFailedNotice,
  getTaskNotesUpdateFailedNotice,
  getTaskSourcePathMissingNotice,
  getTaskSourceMissingNotice,
  getTaskSourceOpenFailedNotice,
  getTaskSourcePaneMissingNotice,
  getTaskTargetCreateFailedNotice,
  getTaskTargetUnavailableNotice,
  getTaskTextUpdateRefreshFailedNotice,
  getTaskStatusUpdateFailedNotice,
  getTaskUpdatedNotice,
  getTaskUnignoreFailedNotice,
  getTaskUnignoreRefreshFailedNotice,
  getTaskUnignoredNotice,
} from "../src/lib/taskEditMessages";

test("task dashboard success notices stay short and product-facing", () => {
  const notices = [
    getTaskAddedNotice(),
    getTaskUpdatedNotice(),
    getTaskDeletedNotice(),
    getTaskIgnoredNotice(),
    getTaskUnignoredNotice(),
    getTaskCategoryAddedNotice(),
    getTaskCategoryRenamedNotice(),
    getTaskAndNotesUpdatedNotice(),
    getTaskNotesSavedNotice(true),
    getTaskNotesSavedNotice(false),
  ];

  assert.deepEqual(notices, [
    "Task added.",
    "Task updated.",
    "Task deleted.",
    "Task ignored.",
    "Task unignored.",
    "Category added.",
    "Category renamed.",
    "Task and notes updated.",
    "Task notes updated.",
    "Task notes cleared.",
  ]);
  for (const notice of notices) {
    assert.doesNotMatch(notice, /console|source note|:\d+|\.md/i);
  }
});

test("task edit failure notices give source-note recovery paths", () => {
  assert.match(getTaskIgnoreFailedNotice(), /could not ignore this task/i);
  assert.match(getTaskIgnoreFailedNotice(), /try again/i);

  assert.match(getTaskUnignoreFailedNotice(), /could not unignore this task/i);
  assert.match(getTaskUnignoreFailedNotice(), /try again/i);

  assert.match(getTaskIgnoreRefreshFailedNotice(), /task was ignored/i);
  assert.match(getTaskIgnoreRefreshFailedNotice(), /could not refresh/i);

  assert.match(getTaskUnignoreRefreshFailedNotice(), /task was unignored/i);
  assert.match(getTaskUnignoreRefreshFailedNotice(), /could not refresh/i);

  assert.match(getTaskStatusUpdateFailedNotice(), /could not update this task/i);
  assert.match(getTaskStatusUpdateFailedNotice(), /source note/i);

  assert.match(getTaskStatusChangedNotesFailedNotice(), /status was updated/i);
  assert.match(getTaskStatusChangedNotesFailedNotice(), /could not update task notes/i);

  assert.match(getTaskStatusChangedRefreshFailedNotice(), /status was updated/i);
  assert.match(getTaskStatusChangedRefreshFailedNotice(), /could not refresh/i);

  assert.match(getTaskContextRefreshFailedNotice(), /task notes were updated/i);
  assert.match(getTaskContextRefreshFailedNotice(), /could not refresh/i);

  assert.match(getTaskTextUpdateRefreshFailedNotice(), /task was updated/i);
  assert.match(getTaskTextUpdateRefreshFailedNotice(), /could not refresh/i);

  assert.match(getTaskLineReadFailedNotice(), /could not read/i);
  assert.match(getTaskLineReadFailedNotice(), /source note/i);

  assert.match(getTaskLineEditFailedNotice(), /could not open/i);
  assert.match(getTaskLineEditFailedNotice(), /Tasks/i);

  assert.match(getTasksPluginUnavailableNotice(), /Tasks plugin/i);
  assert.match(getTasksPluginUnavailableNotice(), /settings/i);
  assert.match(getTasksPluginUnavailableNotice(), /source note/i);

  assert.match(getTaskLineUpdateFailedNotice(), /could not update/i);
  assert.match(getTaskLineUpdateFailedNotice(), /source note/i);

  assert.match(getTaskLineUpdateRefreshFailedNotice(), /task was updated/i);
  assert.match(getTaskLineUpdateRefreshFailedNotice(), /could not refresh/i);

  assert.match(getTaskHeadingRenameFailedNotice(), /could not rename/i);
  assert.match(getTaskHeadingRenameFailedNotice(), /source note/i);

  assert.match(getTaskHeadingRenameRefreshFailedNotice(), /category was renamed/i);
  assert.match(getTaskHeadingRenameRefreshFailedNotice(), /could not refresh/i);

  assert.match(getTaskNotesUpdateFailedNotice(), /could not update task notes/i);
  assert.match(getTaskNotesUpdateFailedNotice(), /source note/i);

  assert.match(getTaskSourceMissingNotice(), /source note/i);
  assert.match(getTaskSourceMissingNotice(), /moved or deleted/i);

  const sourcePathMissing = getTaskSourcePathMissingNotice("Projects/Launch.md");
  assert.match(sourcePathMissing, /Projects\/Launch\.md/);
  assert.match(sourcePathMissing, /moved or deleted/i);
  assert.match(sourcePathMissing, /scan/i);

  assert.match(getTaskSourcePaneMissingNotice(), /note pane/i);
  assert.match(getTaskSourcePaneMissingNotice(), /try Show again/i);

  assert.match(getTaskSourceOpenFailedNotice(), /could not open the source note/i);
  assert.match(getTaskSourceOpenFailedNotice(), /file explorer/i);
});

test("inline add failure notices keep the user pointed at the dashboard form", () => {
  assert.match(getTaskInlineAddFailedNotice(), /could not add this task/i);
  assert.match(getTaskInlineAddFailedNotice(), /try again/i);

  assert.match(getTaskInlineAddCategoryFailedNotice(), /could not add this category/i);
  assert.match(getTaskInlineAddCategoryFailedNotice(), /try again/i);
});

test("task create target notices explain how to recover", () => {
  const unavailable = getTaskTargetUnavailableNotice("Projects");

  assert.match(unavailable, /Projects/);
  assert.match(unavailable, /cannot add tasks/i);
  assert.match(unavailable, /choose another note/i);

  const createFailed = getTaskTargetCreateFailedNotice("Projects/Tasks.md");

  assert.match(createFailed, /Projects\/Tasks\.md/);
  assert.match(createFailed, /could not create/i);
  assert.match(createFailed, /check the folder path/i);
});

test("task create failure notices preserve source-note recovery", () => {
  assert.match(getTaskAppendFailedNotice(), /could not add this task/i);
  assert.match(getTaskAppendFailedNotice(), /source note/i);

  const rolledBack = getTaskReminderCreateFailedNotice(true);
  assert.match(rolledBack, /could not create the reminder task/i);
  assert.match(rolledBack, /nothing was saved/i);
  assert.match(rolledBack, /try again/i);

  const taskLeft = getTaskReminderCreateFailedNotice(false);
  assert.match(taskLeft, /could not create the reminder/i);
  assert.match(taskLeft, /task was left in the note/i);
  assert.match(taskLeft, /Add reminder/i);
});

test("task create validation notices give the next action", () => {
  assert.match(getTaskCreateTextMissingNotice(), /enter a task/i);
  assert.match(getTaskCreateTextMissingNotice(), /creating/i);

  assert.match(getTaskCreateReminderTimeMissingNotice(), /future time/i);
  assert.match(getTaskCreateReminderTimeMissingNotice(), /tomorrow 3pm/i);
  assert.match(getTaskCreateReminderTimeMissingNotice(), /without a reminder/i);
});

test("managed block failure notice gives a source-note recovery path", () => {
  const notice = getManagedBlockUpdateFailedNotice();

  assert.match(notice, /managed task block/i);
  assert.match(notice, /source note/i);
  assert.match(notice, /try again/i);
  assert.doesNotMatch(notice, /failed/i);
});

test("task create partial-success notices say what was already created", () => {
  assert.match(getTaskCreateStatusFailedNotice(false), /task was created/i);
  assert.match(getTaskCreateStatusFailedNotice(false), /could not set its status/i);

  assert.match(getTaskCreateStatusFailedNotice(true), /task and reminder were created/i);
  assert.match(getTaskCreateStatusFailedNotice(true), /could not set its status/i);

  assert.match(getTaskCreateStatusRefreshFailedNotice(false), /task status was set/i);
  assert.match(getTaskCreateStatusRefreshFailedNotice(false), /could not finish updating/i);

  assert.match(getTaskCreateRefreshFailedNotice(false), /task was created/i);
  assert.match(getTaskCreateRefreshFailedNotice(false), /could not refresh/i);

  assert.match(getTaskCreateRefreshFailedNotice(true), /task and reminder were created/i);
  assert.match(getTaskCreateRefreshFailedNotice(true), /could not refresh/i);
});
