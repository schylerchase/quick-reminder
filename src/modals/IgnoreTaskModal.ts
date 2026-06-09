import { App, Modal } from "obsidian";
import { ScrapedTask } from "../types";
import {
  getModalSubmitButtonPresentation,
  runSingleModalSubmit,
  shouldCloseAfterSubmit,
  type ModalSubmitResult,
} from "../lib/modalSubmit";
import { shouldUseMobileTaskViewport } from "../lib/viewHelpers";

export class IgnoreTaskModal extends Modal {
  private noteEl!: HTMLTextAreaElement;
  private submitBtn!: HTMLButtonElement;
  private isSubmitting = false;

  constructor(
    app: App,
    private task: ScrapedTask,
    private onSubmit: (note: string) => ModalSubmitResult | Promise<ModalSubmitResult>,
    private onClosed: () => void = () => {},
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("qr-modal");

    const header = contentEl.createDiv({ cls: "qr-modal-header" });
    header.createEl("h2", { text: "Ignore task" });

    contentEl.createDiv({ text: this.task.text, cls: "qr-ignore-task-text" });

    const field = contentEl.createDiv({ cls: "qr-field" });
    field.createEl("label", {
      text: "Note",
      cls: "qr-field-label",
      attr: { for: "qr-ignore-note" },
    });
    this.noteEl = field.createEl("textarea", {
      attr: { id: "qr-ignore-note" },
      cls: "qr-ignore-note-input",
    });
    this.noteEl.rows = 4;
    this.noteEl.placeholder = "Optional reason";

    const actions = contentEl.createDiv({ cls: "qr-modal-actions" });
    actions.createEl("button", { text: "Cancel", cls: "qr-secondary-btn" }).onclick = () => {
      this.close();
    };
    this.submitBtn = actions.createEl("button", { text: "Ignore", cls: "qr-primary-btn" });
    this.submitBtn.onclick = () => {
      void this.submit();
    };

    if (!shouldUseMobileTaskViewport()) {
      window.setTimeout(() => this.noteEl.focus(), 0);
    }
  }

  onClose(): void {
    this.contentEl.empty();
    this.onClosed();
  }

  private async submit(): Promise<void> {
    const note = this.noteEl.value.trim();
    const result = await runSingleModalSubmit({
      isSubmitting: () => this.isSubmitting,
      setSubmitting: (isSubmitting) => this.setSubmitting(isSubmitting),
      submit: () => this.onSubmit(note),
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
      "Ignore",
      "Ignoring...",
    );
    this.submitBtn.disabled = presentation.disabled;
    this.submitBtn.setText(presentation.text);
  }
}
