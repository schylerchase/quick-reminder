export type TaskIgnoreWorkflowResult =
  | { ok: true; changed: true }
  | { ok: false; changed: false; error?: unknown }
  | { ok: false; changed: true; error: unknown };

export interface TaskIgnoreWorkflow {
  setIgnored: () => Promise<void>;
  afterSetIgnored: () => Promise<void>;
  onSetIgnoredError?: (error: unknown) => void;
  onAfterSetIgnoredError?: (error: unknown) => void;
}

export async function runTaskIgnoreWorkflow(
  workflow: TaskIgnoreWorkflow,
): Promise<TaskIgnoreWorkflowResult> {
  try {
    await workflow.setIgnored();
  } catch (error) {
    workflow.onSetIgnoredError?.(error);
    return { ok: false, changed: false, error };
  }

  try {
    await workflow.afterSetIgnored();
  } catch (error) {
    workflow.onAfterSetIgnoredError?.(error);
    return { ok: false, changed: true, error };
  }

  return { ok: true, changed: true };
}
