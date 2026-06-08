export interface TaskReminderActionState {
  badgeText: string | null;
  buttonText: string;
  ariaLabel: string;
  title: string | null;
  canAddReminder: boolean;
}

export function getTaskReminderActionState(
  hasPendingReminder: boolean,
  hasFutureReminderTime: boolean,
): TaskReminderActionState {
  if (hasPendingReminder) {
    return {
      badgeText: "Reminder set",
      buttonText: "Added",
      ariaLabel: "Reminder already added for this task",
      title: "Reminder already added",
      canAddReminder: false,
    };
  }

  if (!hasFutureReminderTime) {
    return {
      badgeText: null,
      buttonText: "No time",
      ariaLabel: "Task exists, but no future reminder time was detected",
      title: "Add a future time such as tomorrow 3pm",
      canAddReminder: false,
    };
  }

  return {
    badgeText: null,
    buttonText: "Add reminder",
    ariaLabel: "Add reminder for this task",
    title: null,
    canAddReminder: true,
  };
}
