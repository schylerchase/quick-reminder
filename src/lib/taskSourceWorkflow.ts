export type TaskSourceOpenFailureStage =
  | "source"
  | "pane"
  | "open"
  | "reveal"
  | "focus"
  | "cursor";

export type TaskSourceOpenWorkflowResult<TSource, TPane> =
  | { ok: true; source: TSource; pane: TPane }
  | { ok: false; stage: "source" }
  | { ok: false; stage: "pane"; source: TSource }
  | {
      ok: false;
      stage: Exclude<TaskSourceOpenFailureStage, "source" | "pane">;
      source: TSource;
      pane: TPane;
      error: unknown;
    };

export interface TaskSourceOpenWorkflow<TSource, TPane> {
  getSource: () => TSource | null;
  getPane: (source: TSource) => TPane | null;
  openPane: (source: TSource, pane: TPane) => Promise<void>;
  revealPane: (pane: TPane) => Promise<void>;
  focusPane: (pane: TPane) => void;
  focusCursor: (source: TSource, pane: TPane) => void;
  onError?: (
    stage: Exclude<TaskSourceOpenFailureStage, "source" | "pane">,
    error: unknown,
  ) => void;
}

export async function runTaskSourceOpenWorkflow<TSource, TPane>(
  workflow: TaskSourceOpenWorkflow<TSource, TPane>,
): Promise<TaskSourceOpenWorkflowResult<TSource, TPane>> {
  const source = workflow.getSource();
  if (!source) {
    return { ok: false, stage: "source" };
  }

  const pane = workflow.getPane(source);
  if (!pane) {
    return { ok: false, stage: "pane", source };
  }

  const failed = (
    stage: Exclude<TaskSourceOpenFailureStage, "source" | "pane">,
    error: unknown,
  ): TaskSourceOpenWorkflowResult<TSource, TPane> => {
    workflow.onError?.(stage, error);
    return { ok: false, stage, source, pane, error };
  };

  try {
    await workflow.openPane(source, pane);
  } catch (error) {
    return failed("open", error);
  }

  try {
    await workflow.revealPane(pane);
  } catch (error) {
    return failed("reveal", error);
  }

  try {
    workflow.focusPane(pane);
  } catch (error) {
    return failed("focus", error);
  }

  try {
    workflow.focusCursor(source, pane);
  } catch (error) {
    return failed("cursor", error);
  }

  return { ok: true, source, pane };
}
