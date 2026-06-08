export interface TaskStatusWrite<TTask> {
  setStatus: () => Promise<TTask | null>;
  onError?: (error: unknown) => void;
}

export async function writeTaskStatusChange<TTask>(
  workflow: TaskStatusWrite<TTask>,
): Promise<TTask | null> {
  try {
    return await workflow.setStatus();
  } catch (error) {
    workflow.onError?.(error);
    return null;
  }
}

export type TaskStatusUpdateWorkflowResult<TTask> =
  | { ok: true; updated: true; task: TTask }
  | { ok: false; updated: false; error?: unknown }
  | { ok: false; updated: true; task: TTask; error: unknown };

export interface TaskStatusUpdateWorkflow<TTask> {
  updateStatus: () => Promise<TTask | null>;
  afterUpdate: (task: TTask) => Promise<void>;
  onUpdateError?: (error: unknown) => void;
  onAfterUpdateError?: (error: unknown) => void;
}

export async function runTaskStatusUpdateWorkflow<TTask>(
  workflow: TaskStatusUpdateWorkflow<TTask>,
): Promise<TaskStatusUpdateWorkflowResult<TTask>> {
  let task: TTask | null;
  try {
    task = await workflow.updateStatus();
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
