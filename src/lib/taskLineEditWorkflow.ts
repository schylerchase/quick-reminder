export type TaskLineEditWorkflowResult<TTask> =
  | { ok: true; changed: false }
  | { ok: true; changed: true; task: TTask }
  | { ok: false; stage: "read"; error?: unknown }
  | { ok: false; stage: "edit"; error: unknown }
  | { ok: false; stage: "write"; error?: unknown }
  | { ok: false; stage: "afterWrite"; task: TTask; error: unknown };

export interface TaskLineEditWorkflow<TTask> {
  readTaskLine: () => Promise<string | null>;
  editTaskLine: (currentLine: string) => Promise<string | null>;
  writeTaskLine: (nextLine: string) => Promise<TTask | null>;
  afterWrite: (task: TTask) => Promise<void>;
  onReadError?: (error: unknown) => void;
  onEditError?: (error: unknown) => void;
  onWriteError?: (error: unknown) => void;
  onAfterWriteError?: (error: unknown) => void;
}

export async function runTaskLineEditWorkflow<TTask>(
  workflow: TaskLineEditWorkflow<TTask>,
): Promise<TaskLineEditWorkflowResult<TTask>> {
  let currentLine: string | null;
  try {
    currentLine = await workflow.readTaskLine();
  } catch (error) {
    workflow.onReadError?.(error);
    return { ok: false, stage: "read", error };
  }

  if (!currentLine) {
    return { ok: false, stage: "read" };
  }

  let nextLine: string | null;
  try {
    nextLine = await workflow.editTaskLine(currentLine);
  } catch (error) {
    workflow.onEditError?.(error);
    return { ok: false, stage: "edit", error };
  }

  if (!nextLine || nextLine === currentLine) {
    return { ok: true, changed: false };
  }

  let task: TTask | null;
  try {
    task = await workflow.writeTaskLine(nextLine);
  } catch (error) {
    workflow.onWriteError?.(error);
    return { ok: false, stage: "write", error };
  }

  if (!task) {
    return { ok: false, stage: "write" };
  }

  try {
    await workflow.afterWrite(task);
  } catch (error) {
    workflow.onAfterWriteError?.(error);
    return { ok: false, stage: "afterWrite", task, error };
  }

  return { ok: true, changed: true, task };
}
