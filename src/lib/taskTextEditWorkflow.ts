export type TaskTextEditWorkflowResult<TTask> =
  | { ok: true; updated: true; task: TTask }
  | { ok: false; updated: false; error?: unknown }
  | { ok: false; updated: true; task: TTask; error: unknown };

export interface TaskTextEditWorkflow<TTask> {
  updateTask: () => Promise<TTask | null>;
  afterUpdate: (task: TTask) => Promise<void>;
  onUpdateError?: (error: unknown) => void;
  onAfterUpdateError?: (error: unknown) => void;
}

export async function runTaskTextEditWorkflow<TTask>(
  workflow: TaskTextEditWorkflow<TTask>,
): Promise<TaskTextEditWorkflowResult<TTask>> {
  let task: TTask | null;
  try {
    task = await workflow.updateTask();
  } catch (error) {
    workflow.onUpdateError?.(error);
    return { ok: false, updated: false, error };
  }

  if (!task) {
    return { ok: false, updated: false };
  }

  try {
    await workflow.afterUpdate(task);
  } catch (error) {
    workflow.onAfterUpdateError?.(error);
    return { ok: false, updated: true, task, error };
  }

  return { ok: true, updated: true, task };
}
