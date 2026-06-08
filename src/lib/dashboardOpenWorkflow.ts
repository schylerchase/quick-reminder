export type DashboardOpenWorkflowResult =
  | { ok: true; opened: true }
  | { ok: false; opened: false; error?: unknown }
  | { ok: false; opened: true; error: unknown };

export interface DashboardOpenWorkflow<TTarget> {
  open: () => Promise<TTarget | null>;
  refresh?: (target: TTarget) => void | Promise<void>;
  onOpenError?: (error: unknown) => void;
  onRefreshError?: (error: unknown) => void;
}

export async function runDashboardOpenWorkflow<TTarget>(
  workflow: DashboardOpenWorkflow<TTarget>,
): Promise<DashboardOpenWorkflowResult> {
  let target: TTarget | null;
  try {
    target = await workflow.open();
  } catch (error) {
    workflow.onOpenError?.(error);
    return { ok: false, opened: false, error };
  }

  if (target === null) {
    return { ok: false, opened: false };
  }

  try {
    await workflow.refresh?.(target);
  } catch (error) {
    workflow.onRefreshError?.(error);
    return { ok: false, opened: true, error };
  }

  return { ok: true, opened: true };
}
