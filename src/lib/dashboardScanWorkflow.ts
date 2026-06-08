export type DashboardScanWorkflowResult =
  | { ok: true; scanned: true; taskCount: number }
  | { ok: false; scanned: false; error?: unknown }
  | { ok: false; scanned: true; taskCount: number; error: unknown };

export interface DashboardScanWorkflow {
  scan: () => Promise<number | null>;
  refresh?: () => void | Promise<void>;
  onScanError?: (error: unknown) => void;
  onRefreshError?: (error: unknown) => void;
}

export async function runDashboardScanWorkflow(
  workflow: DashboardScanWorkflow,
): Promise<DashboardScanWorkflowResult> {
  let taskCount: number | null;
  try {
    taskCount = await workflow.scan();
  } catch (error) {
    workflow.onScanError?.(error);
    return { ok: false, scanned: false, error };
  }

  if (taskCount === null) {
    return { ok: false, scanned: false };
  }

  try {
    await workflow.refresh?.();
  } catch (error) {
    workflow.onRefreshError?.(error);
    return { ok: false, scanned: true, taskCount, error };
  }

  return { ok: true, scanned: true, taskCount };
}
