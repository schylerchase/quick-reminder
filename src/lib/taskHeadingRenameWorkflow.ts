export type TaskHeadingRenameWorkflowResult =
  | { ok: true; renamed: true }
  | { ok: false; renamed: false; error?: unknown }
  | { ok: false; renamed: true; error: unknown };

export interface TaskHeadingRenameWorkflow {
  renameHeading: () => Promise<boolean>;
  afterRename: () => Promise<void>;
  onRenameError?: (error: unknown) => void;
  onAfterRenameError?: (error: unknown) => void;
}

export async function runTaskHeadingRenameWorkflow(
  workflow: TaskHeadingRenameWorkflow,
): Promise<TaskHeadingRenameWorkflowResult> {
  try {
    const renamed = await workflow.renameHeading();
    if (!renamed) {
      return { ok: false, renamed: false };
    }
  } catch (error) {
    workflow.onRenameError?.(error);
    return { ok: false, renamed: false, error };
  }

  try {
    await workflow.afterRename();
  } catch (error) {
    workflow.onAfterRenameError?.(error);
    return { ok: false, renamed: true, error };
  }

  return { ok: true, renamed: true };
}
