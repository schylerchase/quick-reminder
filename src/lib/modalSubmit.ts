import {
  getSingleActionButtonPresentation,
  runSingleAction,
} from "./singleAction";

export type ModalSubmitResult = boolean | void;

export interface SingleModalSubmitWorkflow<T> {
  isSubmitting: () => boolean;
  setSubmitting: (isSubmitting: boolean) => void;
  submit: () => T | Promise<T>;
}

export type SingleModalSubmitResult<T> =
  | { started: false }
  | { started: true; result: T };

export interface ModalSubmitButtonPresentation {
  disabled: boolean;
  text: string;
}

export function shouldCloseAfterSubmit(result: ModalSubmitResult): boolean {
  return result !== false;
}

export function getModalSubmitButtonPresentation(
  isSubmitting: boolean,
  idleText: string,
  submittingText: string,
): ModalSubmitButtonPresentation {
  return getSingleActionButtonPresentation(isSubmitting, idleText, submittingText);
}

export async function runSingleModalSubmit<T>(
  workflow: SingleModalSubmitWorkflow<T>,
): Promise<SingleModalSubmitResult<T>> {
  return runSingleAction({
    isRunning: workflow.isSubmitting,
    setRunning: workflow.setSubmitting,
    run: workflow.submit,
  });
}
