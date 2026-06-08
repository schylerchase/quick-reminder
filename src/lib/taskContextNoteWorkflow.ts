export type TaskContextNoteWorkflowResult<TTask> =
  | { ok: true; task: TTask; statusChanged: boolean; notesChanged: true }
  | {
      ok: false;
      stage: "status";
      task: TTask;
      statusChanged: false;
      notesChanged: false;
      error?: unknown;
    }
  | {
      ok: false;
      stage: "afterStatus";
      task: TTask;
      statusChanged: true;
      notesChanged: false;
      error: unknown;
    }
  | {
      ok: false;
      stage: "notes";
      task: TTask;
      statusChanged: boolean;
      notesChanged: false;
      error?: unknown;
    }
  | {
      ok: false;
      stage: "afterSave";
      task: TTask;
      statusChanged: boolean;
      notesChanged: true;
      error: unknown;
    };

export interface TaskContextNoteWorkflow<TTask> {
  task: TTask;
  changeStatus?: () => Promise<TTask | null>;
  afterStatusChange?: (task: TTask) => Promise<void>;
  saveNotes: (task: TTask) => Promise<boolean>;
  afterSave: (task: TTask) => Promise<void>;
  onStatusError?: (error: unknown) => void;
  onAfterStatusError?: (error: unknown) => void;
  onNotesError?: (error: unknown) => void;
  onAfterSaveError?: (error: unknown) => void;
}

export async function runTaskContextNoteWorkflow<TTask>(
  workflow: TaskContextNoteWorkflow<TTask>,
): Promise<TaskContextNoteWorkflowResult<TTask>> {
  let currentTask = workflow.task;
  let statusChanged = false;

  if (workflow.changeStatus) {
    try {
      const updated = await workflow.changeStatus();
      if (!updated) {
        return {
          ok: false,
          stage: "status",
          task: currentTask,
          statusChanged: false,
          notesChanged: false,
        };
      }
      currentTask = updated;
      statusChanged = true;
    } catch (error) {
      workflow.onStatusError?.(error);
      return {
        ok: false,
        stage: "status",
        task: currentTask,
        statusChanged: false,
        notesChanged: false,
        error,
      };
    }

    try {
      await workflow.afterStatusChange?.(currentTask);
    } catch (error) {
      workflow.onAfterStatusError?.(error);
      return {
        ok: false,
        stage: "afterStatus",
        task: currentTask,
        statusChanged: true,
        notesChanged: false,
        error,
      };
    }
  }

  try {
    const saved = await workflow.saveNotes(currentTask);
    if (!saved) {
      return {
        ok: false,
        stage: "notes",
        task: currentTask,
        statusChanged,
        notesChanged: false,
      };
    }
  } catch (error) {
    workflow.onNotesError?.(error);
    return {
      ok: false,
      stage: "notes",
      task: currentTask,
      statusChanged,
      notesChanged: false,
      error,
    };
  }

  try {
    await workflow.afterSave(currentTask);
  } catch (error) {
    workflow.onAfterSaveError?.(error);
    return {
      ok: false,
      stage: "afterSave",
      task: currentTask,
      statusChanged,
      notesChanged: true,
      error,
    };
  }

  return { ok: true, task: currentTask, statusChanged, notesChanged: true };
}
