export type ProjectNoteCreateWorkflowResult<TFile> =
  | { ok: true; created: true; file: TFile }
  | { ok: false; created: false; alreadyExists: true }
  | { ok: false; created: false; error: unknown }
  | { ok: false; created: true; file: TFile; error: unknown };

export interface ProjectNoteCreateWorkflow<TFile> {
  targetExists?: () => boolean;
  createNote: () => Promise<TFile>;
  afterCreate: (file: TFile) => Promise<void>;
  onTargetExists?: () => void;
  onCreateError?: (error: unknown) => void;
  onAfterCreateError?: (error: unknown) => void;
}

export async function runProjectNoteCreateWorkflow<TFile>(
  workflow: ProjectNoteCreateWorkflow<TFile>,
): Promise<ProjectNoteCreateWorkflowResult<TFile>> {
  if (workflow.targetExists?.()) {
    workflow.onTargetExists?.();
    return { ok: false, created: false, alreadyExists: true };
  }

  let file: TFile;
  try {
    file = await workflow.createNote();
  } catch (error) {
    workflow.onCreateError?.(error);
    return { ok: false, created: false, error };
  }

  try {
    await workflow.afterCreate(file);
  } catch (error) {
    workflow.onAfterCreateError?.(error);
    return { ok: false, created: true, file, error };
  }

  return { ok: true, created: true, file };
}
