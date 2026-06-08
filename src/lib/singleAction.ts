export interface SingleActionWorkflow<T> {
  isRunning: () => boolean;
  setRunning: (isRunning: boolean) => void;
  run: () => T | Promise<T>;
}

export type SingleActionResult<T> =
  | { started: false }
  | { started: true; result: T };

export interface KeyedSingleActionWorkflow<T> {
  runningKeys: Set<string>;
  key: string;
  run: () => T | Promise<T>;
}

export interface SingleOpenWorkflow<T> {
  isOpen: () => boolean;
  setOpen: (isOpen: boolean) => void;
  open: (release: () => void) => T;
}

export type SingleOpenResult<T> =
  | { opened: false }
  | { opened: true; result: T };

export interface KeyedSingleOpenWorkflow<T> {
  openKeys: Set<string>;
  key: string;
  open: (release: () => void) => T;
}

export interface SingleActionButtonPresentation {
  disabled: boolean;
  text: string;
}

export interface SingleActionButtonState extends SingleActionButtonPresentation {
  ariaBusy: boolean;
}

export function getSingleActionButtonPresentation(
  isRunning: boolean,
  idleText: string,
  runningText: string,
): SingleActionButtonPresentation {
  return {
    disabled: isRunning,
    text: isRunning ? runningText : idleText,
  };
}

export function getSingleActionButtonState(
  isRunning: boolean,
  idleText: string,
  runningText: string,
): SingleActionButtonState {
  return {
    ...getSingleActionButtonPresentation(isRunning, idleText, runningText),
    ariaBusy: isRunning,
  };
}

export async function runSingleAction<T>(
  workflow: SingleActionWorkflow<T>,
): Promise<SingleActionResult<T>> {
  if (workflow.isRunning()) {
    return { started: false };
  }

  workflow.setRunning(true);
  try {
    return { started: true, result: await workflow.run() };
  } finally {
    workflow.setRunning(false);
  }
}

export async function runKeyedSingleAction<T>(
  workflow: KeyedSingleActionWorkflow<T>,
): Promise<SingleActionResult<T>> {
  return runSingleAction({
    isRunning: () => workflow.runningKeys.has(workflow.key),
    setRunning: (isRunning) => {
      if (isRunning) {
        workflow.runningKeys.add(workflow.key);
      } else {
        workflow.runningKeys.delete(workflow.key);
      }
    },
    run: workflow.run,
  });
}

export function runSingleOpen<T>(
  workflow: SingleOpenWorkflow<T>,
): SingleOpenResult<T> {
  if (workflow.isOpen()) {
    return { opened: false };
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    workflow.setOpen(false);
  };

  workflow.setOpen(true);
  try {
    return { opened: true, result: workflow.open(release) };
  } catch (error) {
    release();
    throw error;
  }
}

export function runKeyedSingleOpen<T>(
  workflow: KeyedSingleOpenWorkflow<T>,
): SingleOpenResult<T> {
  return runSingleOpen({
    isOpen: () => workflow.openKeys.has(workflow.key),
    setOpen: (isOpen) => {
      if (isOpen) {
        workflow.openKeys.add(workflow.key);
      } else {
        workflow.openKeys.delete(workflow.key);
      }
    },
    open: workflow.open,
  });
}
