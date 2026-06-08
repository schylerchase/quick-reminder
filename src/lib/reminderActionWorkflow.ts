export type ReminderActionWorkflowResult =
  | { ok: true; actionCompleted: true }
  | { ok: false; actionCompleted: false; ignored: true }
  | { ok: false; actionCompleted: false; error: unknown }
  | { ok: false; actionCompleted: true; error: unknown };

export interface ReminderActionWorkflow {
  isRunning?: () => boolean;
  setRunning?: (isRunning: boolean) => void;
  run: () => Promise<void>;
  refresh?: () => void | Promise<void>;
  onError?: (error: unknown) => void;
  onRefreshError?: (error: unknown) => void;
}

export async function runReminderActionWorkflow(
  workflow: ReminderActionWorkflow,
): Promise<ReminderActionWorkflowResult> {
  if (workflow.isRunning?.()) {
    return { ok: false, actionCompleted: false, ignored: true };
  }

  workflow.setRunning?.(true);
  try {
    try {
      await workflow.run();
    } catch (error) {
      workflow.onError?.(error);
      return { ok: false, actionCompleted: false, error };
    }

    try {
      await workflow.refresh?.();
    } catch (error) {
      workflow.onRefreshError?.(error);
      return { ok: false, actionCompleted: true, error };
    }

    return { ok: true, actionCompleted: true };
  } finally {
    workflow.setRunning?.(false);
  }
}
