import type { Reminder } from "../types";

export interface ReminderManagerSection {
  title: string;
  emptyText: string;
  isHistory: boolean;
  reminders: Reminder[];
}

export function getReminderManagerSections(
  reminders: readonly Reminder[],
): ReminderManagerSection[] {
  const pending = reminders
    .filter((reminder) => !reminder.notified)
    .sort((a, b) => a.dueAt - b.dueAt);
  const history = reminders
    .filter((reminder) => reminder.notified)
    .sort((a, b) => getHistoryTime(b) - getHistoryTime(a));

  return [
    {
      title: "Pending reminders",
      emptyText: "No pending reminders.",
      isHistory: false,
      reminders: pending,
    },
    {
      title: "Completed and notified",
      emptyText: "No completed reminders yet.",
      isHistory: true,
      reminders: history,
    },
  ];
}

export function getReminderManagerActionLabels(
  isHistory: boolean,
  snoozeMinutes: number,
): string[] {
  if (isHistory) {
    return ["Restore", "Re-add", "Delete"];
  }

  return ["Done", `Snooze ${snoozeMinutes}m`, "Edit", "Delete"];
}

function getHistoryTime(reminder: Reminder): number {
  return reminder.completedAt ?? reminder.notifiedAt ?? reminder.dueAt;
}
