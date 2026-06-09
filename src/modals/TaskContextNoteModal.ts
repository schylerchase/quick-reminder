import { App, Modal, setIcon } from "obsidian";
import { ScrapedTask } from "../types";
import {
  getModalSubmitButtonPresentation,
  runSingleModalSubmit,
  shouldCloseAfterSubmit,
  type ModalSubmitResult,
} from "../lib/modalSubmit";
import {
  getTaskContextNoteEditBlock,
  handleTextareaIndent,
  mapTaskKindToStatusPick,
  shouldUseMobileTaskViewport,
  type TaskStatusPick,
} from "../lib/viewHelpers";

export class TaskContextNoteModal extends Modal {
  private noteEl!: HTMLTextAreaElement;
  private statusEl!: HTMLDivElement;
  private submitBtn!: HTMLButtonElement;
  private isSubmitting = false;
  private status: TaskStatusPick;
  private readonly initialStatus: TaskStatusPick;

  constructor(
    app: App,
    private task: ScrapedTask,
    private onSubmit: (
      rawNoteBlock: string,
      statusChange: TaskStatusPick | null,
    ) => ModalSubmitResult | Promise<ModalSubmitResult>,
    private onOpenTasksEditor: (() => void) | null = null,
    private onClosed: () => void = () => {},
  ) {
    super(app);
    this.initialStatus = mapTaskKindToStatusPick(task);
    this.status = this.initialStatus;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("qr-modal");
    contentEl.addClass("qr-task-edit-modal");

    const header = contentEl.createDiv({ cls: "qr-modal-header" });
    header.createEl("h2", { text: "Edit task" });

    contentEl.createDiv({ text: this.task.text, cls: "qr-task-edit-title" });

    const statusField = contentEl.createDiv({ cls: "qr-field" });
    statusField.createEl("label", { text: "Status", cls: "qr-field-label" });
    this.statusEl = statusField.createDiv({ cls: "qr-status-pills" });
    this.renderStatusPill("todo", "circle", "To Do");
    this.renderStatusPill("in-progress", "loader-circle", "In Progress");
    this.renderStatusPill("completed", "check-circle-2", "Done");

    const field = contentEl.createDiv({ cls: "qr-field" });
    field.createEl("label", {
      text: "Notes",
      cls: "qr-field-label",
      attr: { for: "qr-task-context-note" },
    });
    this.noteEl = field.createEl("textarea", {
      attr: { id: "qr-task-context-note" },
      cls: "qr-input qr-input-textarea qr-task-note-edit-input",
    });
    this.noteEl.rows = 6;
    this.noteEl.placeholder = "- blocked by firewall change\n- ask vendor for installer flag\nverify on prod hosts";
    this.noteEl.value = getTaskContextNoteEditBlock(this.task);
    this.noteEl.addEventListener("keydown", (event) => handleTextareaIndent(event, this.noteEl));

    if (this.onOpenTasksEditor) {
      const advanced = contentEl.createDiv({ cls: "qr-modal-advanced" });
      const link = advanced.createEl("button", {
        text: "Open in Tasks plugin (due, priority, recurring…)",
        cls: "qr-link-btn",
      });
      link.onclick = () => {
        this.close();
        this.onOpenTasksEditor?.();
      };
    }

    const actions = contentEl.createDiv({ cls: "qr-modal-actions" });
    actions.createEl("button", { text: "Cancel", cls: "qr-secondary-btn" }).onclick = () => {
      this.close();
    };
    this.submitBtn = actions.createEl("button", { text: "Save", cls: "qr-primary-btn" });
    this.submitBtn.onclick = () => {
      void this.submit();
    };

    if (!shouldUseMobileTaskViewport()) {
      window.setTimeout(() => this.noteEl.focus(), 0);
    }
  }

  private renderStatusPill(value: TaskStatusPick, icon: string, label: string): void {
    const pill = this.statusEl.createEl("button", { cls: "qr-status-pill" });
    pill.dataset.value = value;
    const iconEl = pill.createSpan({ cls: "qr-status-pill-icon" });
    setIcon(iconEl, icon);
    pill.createSpan({ text: label });
    pill.toggleClass("is-active", this.status === value);
    pill.onclick = () => {
      this.status = value;
      for (const child of Array.from(this.statusEl.children)) {
        child.removeClass("is-active");
      }
      pill.addClass("is-active");
    };
  }

  onClose(): void {
    this.contentEl.empty();
    this.onClosed();
  }

  private async submit(): Promise<void> {
    const statusChange = this.status === this.initialStatus ? null : this.status;
    const result = await runSingleModalSubmit({
      isSubmitting: () => this.isSubmitting,
      setSubmitting: (isSubmitting) => this.setSubmitting(isSubmitting),
      submit: () => this.onSubmit(this.noteEl.value, statusChange),
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
      "Save",
      "Saving...",
    );
    this.submitBtn.disabled = presentation.disabled;
    this.submitBtn.setText(presentation.text);
  }
}
