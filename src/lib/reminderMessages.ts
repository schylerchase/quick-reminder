export function getReminderSaveFailedNotice(): string {
  return "Quick Reminder could not save this reminder. Try again or reload Obsidian.";
}

export function getReminderCreatedNotice(text: string, formattedTime: string): string {
  return `Reminder set for ${formattedTime}: ${text}`;
}

export function getReminderTextMissingNotice(): string {
  return "Add reminder text before saving.";
}

export function getReminderTimeMissingNotice(): string {
  return "Add a time like tomorrow 3pm.";
}

export function getReminderPastTimeNotice(): string {
  return "Choose a future reminder time.";
}

export function getReminderSelectionMissingNotice(): string {
  return "Select text with a reminder time first.";
}

export function getReminderSelectionTimeMissingNotice(): string {
  return "Selection needs a time like tomorrow 3pm.";
}

export function getReminderEditInvalidNotice(): string {
  return "Add reminder text and a valid time.";
}

export function getTaskReminderTimeMissingNotice(): string {
  return "Task was added. Add a future time, then use Add reminder.";
}

export function getTaskReminderRefreshFailedNotice(): string {
  return "Reminder was added, but Quick Reminder could not refresh the dashboard. Reopen the dashboard or reload Obsidian.";
}

export function getTaskReminderCreatedNotice(text: string): string {
  return `Reminder added to this task: ${text}`;
}

export function getTaskReminderDuplicateNotice(): string {
  return "This task already has a reminder. Look for the Reminder set badge.";
}

export function getReminderActionFailedNotice(description: string): string {
  return `Quick Reminder could not ${description}. Try again or reload Obsidian.`;
}

export function getReminderActionRefreshFailedNotice(): string {
  return "Reminder was updated, but Quick Reminder could not refresh the view. Reopen the dashboard or reload Obsidian.";
}

export function getReminderMissedCatchupNotice(count: number): string {
  const label = count === 1 ? "missed reminder" : "missed reminders";
  return `${count} ${label}. Showing ${count === 1 ? "it" : "them"} now.`;
}

export function getReminderFallbackNotice(text: string): string {
  return `Reminder due: ${text}`;
}
