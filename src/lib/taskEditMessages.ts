export function getTaskAddedNotice(): string {
  return "Task added.";
}

export function getTaskUpdatedNotice(): string {
  return "Task updated.";
}

export function getTaskDeletedNotice(): string {
  return "Task deleted.";
}

export function getTaskIgnoredNotice(): string {
  return "Task ignored.";
}

export function getTaskUnignoredNotice(): string {
  return "Task unignored.";
}

export function getTaskCategoryAddedNotice(): string {
  return "Category added.";
}

export function getTaskCategoryRenamedNotice(): string {
  return "Category renamed.";
}

export function getTaskAndNotesUpdatedNotice(): string {
  return "Task and notes updated.";
}

export function getTaskNotesSavedNotice(hasNotes: boolean): string {
  return hasNotes ? "Task notes updated." : "Task notes cleared.";
}

export function getTaskIgnoreFailedNotice(): string {
  return "Quick Reminder could not ignore this task. Try again or open the source note.";
}

export function getTaskIgnoreRefreshFailedNotice(): string {
  return "Task was ignored, but Quick Reminder could not refresh the dashboard. Reopen the dashboard or reload Obsidian.";
}

export function getTaskUnignoreFailedNotice(): string {
  return "Quick Reminder could not unignore this task. Try again or open the source note.";
}

export function getTaskUnignoreRefreshFailedNotice(): string {
  return "Task was unignored, but Quick Reminder could not refresh the dashboard. Reopen the dashboard or reload Obsidian.";
}

export function getTaskStatusUpdateFailedNotice(): string {
  return "Quick Reminder could not update this task. Open the source note and edit it manually.";
}

export function getTaskStatusChangedNotesFailedNotice(): string {
  return "Task status was updated, but Quick Reminder could not update task notes. Reopen the source note to review it.";
}

export function getTaskStatusChangedRefreshFailedNotice(): string {
  return "Task status was updated, but Quick Reminder could not refresh the dashboard. Reopen the dashboard or reload Obsidian.";
}

export function getTaskContextRefreshFailedNotice(): string {
  return "Task notes were updated, but Quick Reminder could not refresh the dashboard. Reopen the dashboard or reload Obsidian.";
}

export function getTaskTextUpdateRefreshFailedNotice(): string {
  return "Task was updated, but Quick Reminder could not refresh the dashboard. Reopen the dashboard or reload Obsidian.";
}

export function getTaskLineReadFailedNotice(): string {
  return "Quick Reminder could not read this task. Open the source note and edit it manually.";
}

export function getTaskLineEditFailedNotice(): string {
  return "Quick Reminder could not open the Tasks editor. Reload Obsidian or edit the source note manually.";
}

export function getTasksPluginUnavailableNotice(): string {
  return "Tasks plugin editing is unavailable. Enable it in Quick Reminder settings or edit the source note manually.";
}

export function getTaskLineUpdateFailedNotice(): string {
  return "Quick Reminder could not update this task. Open the source note and edit it manually.";
}

export function getTaskLineUpdateRefreshFailedNotice(): string {
  return "Task was updated, but Quick Reminder could not refresh the dashboard. Reopen the dashboard or reload Obsidian.";
}

export function getTaskHeadingRenameFailedNotice(): string {
  return "Quick Reminder could not rename this category. Open the source note and edit the heading manually.";
}

export function getTaskHeadingRenameRefreshFailedNotice(): string {
  return "Category was renamed, but Quick Reminder could not refresh the dashboard. Reopen the dashboard or reload Obsidian.";
}

export function getTaskNotesUpdateFailedNotice(): string {
  return "Quick Reminder could not update task notes. Open the source note and edit them manually.";
}

export function getTaskSourceMissingNotice(): string {
  return "Quick Reminder could not find the source note. It may have been moved or deleted.";
}

export function getTaskSourcePathMissingNotice(path: string): string {
  return `Quick Reminder could not find ${path}. It may have been moved or deleted; scan the dashboard again.`;
}

export function getTaskSourcePaneMissingNotice(): string {
  return "Quick Reminder could not find a note pane. Open any note and try Show again.";
}

export function getTaskSourceOpenFailedNotice(): string {
  return "Quick Reminder could not open the source note. Open it from the file explorer or reload Obsidian.";
}

export function getTaskInlineAddFailedNotice(): string {
  return "Quick Reminder could not add this task. Try again or open the source note.";
}

export function getTaskInlineAddCategoryFailedNotice(): string {
  return "Quick Reminder could not add this category. Try again or open the source note.";
}

export function getTaskTargetUnavailableNotice(path: string): string {
  return `Quick Reminder cannot add tasks to ${path}. Choose another note or leave the path blank for Quick Reminder Tasks.md.`;
}

export function getTaskTargetCreateFailedNotice(path: string): string {
  return `Quick Reminder could not create ${path}. Check the folder path or choose another note.`;
}

export function getTaskCreateTextMissingNotice(): string {
  return "Enter a task before creating it.";
}

export function getTaskCreateReminderTimeMissingNotice(): string {
  return "Add a future time, like 'tomorrow 3pm', or create the task without a reminder.";
}

export function getTaskAppendFailedNotice(): string {
  return "Quick Reminder could not add this task to the source note. Open the source note and try again.";
}

export function getTaskReminderCreateFailedNotice(rolledBackTask: boolean): string {
  return rolledBackTask
    ? "Quick Reminder could not create the reminder task. Nothing was saved; try again."
    : "Quick Reminder could not create the reminder. The task was left in the note; use Add reminder from the task card.";
}

export function getManagedBlockUpdateFailedNotice(): string {
  return "Quick Reminder could not update the managed task block. Open the source note and try again.";
}

function getCreatedTaskSubject(createdReminder: boolean): string {
  return createdReminder ? "Task and reminder were created" : "Task was created";
}

export function getTaskCreateStatusFailedNotice(createdReminder: boolean): string {
  return `${getCreatedTaskSubject(createdReminder)}, but Quick Reminder could not set its status. Open the source note to review it.`;
}

export function getTaskCreateStatusRefreshFailedNotice(createdReminder: boolean): string {
  const reminderText = createdReminder ? " and the reminder was created" : "";
  return `Task status was set${reminderText}, but Quick Reminder could not finish updating the dashboard. Reopen the dashboard or reload Obsidian.`;
}

export function getTaskCreateRefreshFailedNotice(createdReminder: boolean): string {
  return `${getCreatedTaskSubject(createdReminder)}, but Quick Reminder could not refresh the dashboard. Reopen the dashboard or reload Obsidian.`;
}
