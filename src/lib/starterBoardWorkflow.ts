export type StarterBoardWorkflowResult<TFile> =
  | { ok: true; boardReady: true; file: TFile }
  | { ok: false; boardReady: false; error: unknown }
  | { ok: false; boardReady: true; file: TFile; error: unknown };

export interface StarterBoardWorkflow<TFile> {
  getBoardFile: () => Promise<TFile>;
  afterBoardReady: (file: TFile) => Promise<void>;
  onBoardError?: (error: unknown) => void;
  onSetupError?: (error: unknown) => void;
}

export type StarterBoardEntryActionResult =
  | { ok: true }
  | { ok: false; handled: true }
  | { ok: false; handled: false; error: unknown };

export interface StarterBoardEntryActionWorkflow {
  openStarterBoard: () => Promise<boolean | void>;
  setBusy: (busy: boolean) => void;
  onError?: (error: unknown) => void;
}

export async function runStarterBoardEntryAction(
  workflow: StarterBoardEntryActionWorkflow,
): Promise<StarterBoardEntryActionResult> {
  workflow.setBusy(true);

  try {
    const opened = await workflow.openStarterBoard();
    if (opened === false) {
      workflow.setBusy(false);
      return { ok: false, handled: true };
    }
    return { ok: true };
  } catch (error) {
    workflow.onError?.(error);
    workflow.setBusy(false);
    return { ok: false, handled: false, error };
  }
}

export async function runStarterBoardWorkflow<TFile>(
  workflow: StarterBoardWorkflow<TFile>,
): Promise<StarterBoardWorkflowResult<TFile>> {
  let file: TFile;
  try {
    file = await workflow.getBoardFile();
  } catch (error) {
    workflow.onBoardError?.(error);
    return { ok: false, boardReady: false, error };
  }

  try {
    await workflow.afterBoardReady(file);
  } catch (error) {
    workflow.onSetupError?.(error);
    return { ok: false, boardReady: true, file, error };
  }

  return { ok: true, boardReady: true, file };
}
