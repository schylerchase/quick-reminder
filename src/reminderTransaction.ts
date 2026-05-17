import type { Reminder } from "./types";

export interface ReminderPersistence {
  add(reminder: Reminder): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface ReminderScheduler {
  schedule(reminder: Reminder): void;
  cancel(id: string): void;
}

export async function saveScheduledReminder(
  store: ReminderPersistence,
  scheduler: ReminderScheduler,
  reminder: Reminder,
  afterSave?: () => void | Promise<void>,
  onRollbackError: (error: unknown) => void = () => {},
): Promise<void> {
  await store.add(reminder);
  try {
    scheduler.schedule(reminder);
    await afterSave?.();
  } catch (error) {
    try {
      scheduler.cancel(reminder.id);
    } catch (rollbackError) {
      onRollbackError(rollbackError);
    }
    try {
      await store.remove(reminder.id);
    } catch (rollbackError) {
      onRollbackError(rollbackError);
    }
    throw error;
  }
}
