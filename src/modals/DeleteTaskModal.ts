import { App, Modal } from "obsidian";
import { ScrapedTask } from "../types";
import {
  getModalSubmitButtonPresentation,
  runSingleModalSubmit,
  shouldCloseAfterSubmit,
  type ModalSubmitResult,
} from "../lib/modalSubmit";

export class DeleteTaskModal extends Modal {
  private submitBtn!: HTMLButtonElement;
  private isSubmitting = false;

  constructor(
    app: App,
    private task: ScrapedTask,
    private onConfirm: () => ModalSubmitResult | Promise<ModalSubmitResult>,
    private onClosed: () => void = () => {},
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("qr-modal");

    const header = contentEl.createDiv({ cls: "qr-modal-header" });
    header.createEl("h2", { text: "Delete task" });
    contentEl.createDiv({ text: this.task.text, cls: "qr-ignore-task-text" });
    contentEl.createDiv({
      text: `${this.task.filePath}:${this.task.line}`,
      cls: "qr-view-row-when",
    });

    const actions = contentEl.createDiv({ cls: "qr-modal-actions" });
    actions.createEl("button", { text: "Cancel", cls: "qr-secondary-btn" }).onclick = () => {
      this.close();
    };
    this.submitBtn = actions.createEl("button", {
      text: "Delete",
      cls: "qr-primary-btn qr-view-del",
    });
    this.submitBtn.onclick = () => {
      void this.submit();
    };
  }

  onClose(): void {
    this.contentEl.empty();
    this.onClosed();
  }

  private async submit(): Promise<void> {
    const result = await runSingleModalSubmit({
      isSubmitting: () => this.isSubmitting,
      setSubmitting: (isSubmitting) => this.setSubmitting(isSubmitting),
      submit: () => this.onConfirm(),
    });
    if (result.started && shouldCloseAfterSubmit(result.result)) {
      this.close();
    }
  }

  private setSubmitting(isSubmitting: boolean): void {
    this.isSubmitting = isSubmitting;
    if (!this.submitBtn) return;
    const presentation = getModalSubmitButtonPresentation(
      isSubmitting,
      "Delete",
      "Deleting...",
    );
    this.submitBtn.disabled = presentation.disabled;
    this.submitBtn.setText(presentation.text);
  }
}
