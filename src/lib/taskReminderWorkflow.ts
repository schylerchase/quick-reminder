export type TaskBackedReminderResult =
  | { ok: true }
  | { ok: false; rolledBackTask: boolean };

export type ExistingTaskReminderWorkflowResult =
  | { ok: true; reminderSaved: true }
  | { ok: false; reminderSaved: false; duplicate: true }
  | { ok: false; reminderSaved: false; error: unknown }
  | { ok: false; reminderSaved: true; error: unknown };

export interface TaskBackedReminderWorkflow {
  saveReminder: () => Promise<void>;
  deleteTask: () => Promise<boolean>;
  onRollbackError?: (error: unknown) => void;
}

export interface ExistingTaskReminderWorkflow {
  hasExistingReminder?: () => boolean;
  saveReminder: () => Promise<void>;
  afterSave: () => Promise<void>;
  onDuplicate?: () => void;
  onSaveError?: (error: unknown) => void;
  onAfterSaveError?: (error: unknown) => void;
}

export async function saveTaskBackedReminder(
  workflow: TaskBackedReminderWorkflow,
): Promise<TaskBackedReminderResult> {
  try {
    await workflow.saveReminder();
    return { ok: true };
  } catch {
    const rolledBackTask = await rollbackTask(workflow);
    return { ok: false, rolledBackTask };
  }
}

export async function runExistingTaskReminderWorkflow(
  workflow: ExistingTaskReminderWorkflow,
): Promise<ExistingTaskReminderWorkflowResult> {
  if (workflow.hasExistingReminder?.()) {
    workflow.onDuplicate?.();
    return { ok: false, reminderSaved: false, duplicate: true };
  }

  try {
    await workflow.saveReminder();
  } catch (error) {
    workflow.onSaveError?.(error);
    return { ok: false, reminderSaved: false, error };
  }

  try {
    await workflow.afterSave();
  } catch (error) {
    workflow.onAfterSaveError?.(error);
    return { ok: false, reminderSaved: true, error };
  }

  return { ok: true, reminderSaved: true };
}

async function rollbackTask(workflow: TaskBackedReminderWorkflow): Promise<boolean> {
  try {
    const rolledBack = await workflow.deleteTask();
    if (!rolledBack) {
      workflow.onRollbackError?.("Task rollback returned false");
    }
    return rolledBack;
  } catch (error) {
    workflow.onRollbackError?.(error);
    return false;
  }
}
