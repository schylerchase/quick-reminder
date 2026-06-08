export type TaskDeleteWorkflowResult =
  | { ok: true; deleted: true }
  | { ok: false; deleted: false; error?: unknown }
  | { ok: false; deleted: true; error: unknown };

export interface TaskDeleteWorkflow {
  deleteTask: () => Promise<boolean>;
  afterDelete: () => Promise<void>;
  onDeleteError?: (error: unknown) => void;
  onAfterDeleteError?: (error: unknown) => void;
}

export async function runTaskDeleteWorkflow(
  workflow: TaskDeleteWorkflow,
): Promise<TaskDeleteWorkflowResult> {
  try {
    const deleted = await workflow.deleteTask();
    if (!deleted) {
      return { ok: false, deleted: false };
    }
  } catch (error) {
    workflow.onDeleteError?.(error);
    return { ok: false, deleted: false, error };
  }

  try {
    await workflow.afterDelete();
  } catch (error) {
    workflow.onAfterDeleteError?.(error);
    return { ok: false, deleted: true, error };
  }

  return { ok: true, deleted: true };
}
