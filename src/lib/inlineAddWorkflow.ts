export interface InlineAddWorkflow<TTarget> {
  isSubmitting?: () => boolean;
  setSubmitting?: (isSubmitting: boolean) => void;
  getTarget: () => Promise<TTarget | null>;
  write: (target: TTarget) => Promise<void>;
  restore: () => void;
  onWriteError?: (error: unknown) => void;
}

export async function runInlineAddWorkflow<TTarget>(
  workflow: InlineAddWorkflow<TTarget>,
): Promise<boolean> {
  if (workflow.isSubmitting?.()) {
    return false;
  }

  workflow.setSubmitting?.(true);
  try {
    const target = await workflow.getTarget();
    if (!target) return false;

    try {
      await workflow.write(target);
    } catch (error) {
      workflow.onWriteError?.(error);
      return false;
    }

    workflow.restore();
    return true;
  } finally {
    workflow.setSubmitting?.(false);
  }
}
