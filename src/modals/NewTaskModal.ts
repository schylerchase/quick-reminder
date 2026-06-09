import { App, Modal, Notice, setIcon } from "obsidian";
import { parseReminder } from "../parser";
import { DEFAULT_CATEGORY_FILE_PATH } from "../lib/taskTarget";
import { getTaskCreateTextMissingNotice } from "../lib/taskEditMessages";
import {
  runSingleModalSubmit,
  shouldCloseAfterSubmit,
  type ModalSubmitResult,
} from "../lib/modalSubmit";
import {
  normalizeContextNoteLines,
  type NewTaskRequest,
  type TaskStatusPick,
} from "../lib/viewHelpers";

export class NewTaskModal extends Modal {
  private inputEl!: HTMLTextAreaElement;
  private targetFileEl!: HTMLInputElement;
  private detailsEl!: HTMLTextAreaElement;
  private previewEl!: HTMLDivElement;
  private statusEl!: HTMLDivElement;
  private submitBtn!: HTMLButtonElement;
  private status: TaskStatusPick = "todo";
  private isSubmitting = false;

  constructor(
    app: App,
    private withReminder: boolean,
    private initialFilePath: string,
    private onSubmit: (request: NewTaskRequest) => ModalSubmitResult | Promise<ModalSubmitResult>,
    private onClosed: () => void = () => {},
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("qr-modal");
    this.contentEl.addClass("qr-new-task-modal");
    this.contentEl.createEl("h2", {
      text: this.withReminder ? "New reminder task" : "New task",
    });

    const statusField = this.contentEl.createDiv({ cls: "qr-field" });
    statusField.createEl("label", { text: "Status", cls: "qr-field-label" });
    this.statusEl = statusField.createDiv({ cls: "qr-status-pills" });
    this.renderStatusPill("todo", "circle", "To Do");
    this.renderStatusPill("in-progress", "loader-circle", "In Progress");
    if (!this.withReminder) {
      this.renderStatusPill("completed", "check-circle-2", "Done");
    }

    const field = this.contentEl.createDiv({ cls: "qr-field" });
    field.createEl("label", {
      text: this.withReminder ? "Task and time" : "Task",
      cls: "qr-field-label",
    });
    this.inputEl = field.createEl("textarea", {
      cls: "qr-input qr-input-textarea",
      placeholder: this.withReminder
        ? "e.g. call Alex tomorrow 3pm"
        : "e.g. follow up with Alex",
    });
    this.inputEl.rows = 3;
    this.inputEl.addEventListener("input", () => this.renderPreview());
    this.inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void this.submit();
      }
    });

    const options = this.contentEl.createDiv({ cls: "qr-task-options" });
    const targetField = options.createDiv({ cls: "qr-field" });
    targetField.createEl("label", { text: "Save to", cls: "qr-field-label" });
    this.targetFileEl = targetField.createEl("input", {
      type: "text",
      cls: "qr-input qr-task-target-input",
      value: this.initialFilePath,
    });
    this.targetFileEl.addEventListener("input", () => this.renderPreview());
    this.attachMarkdownFileOptions(this.targetFileEl);

    const detailsField = options.createDiv({ cls: "qr-field" });
    detailsField.createEl("label", { text: "Details", cls: "qr-field-label" });
    this.detailsEl = detailsField.createEl("textarea", {
      cls: "qr-input qr-input-textarea qr-task-details-input",
      placeholder: "Notes, links, context",
    });
    this.detailsEl.rows = 2;
    this.detailsEl.addEventListener("input", () => this.renderPreview());

    this.previewEl = this.contentEl.createDiv({ cls: "qr-preview" });
    this.renderPreview();

    const actions = this.contentEl.createDiv({ cls: "qr-modal-actions" });
    actions.createEl("button", { text: "Cancel", cls: "qr-secondary-btn" }).onclick = () => this.close();
    this.submitBtn = actions.createEl("button", {
      text: this.submitLabel(),
      cls: "qr-primary-btn",
    });
    this.submitBtn.onclick = () => {
      void this.submit();
    };
    window.setTimeout(() => this.inputEl.focus(), 0);
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
      this.renderPreview();
    };
  }

  private renderPreview(): void {
    this.previewEl.empty();
    const raw = this.inputEl.value.trim();
    const target = this.targetFileEl?.value.trim() || DEFAULT_CATEGORY_FILE_PATH;
    const detailsCount = normalizeContextNoteLines((this.detailsEl?.value ?? "").split(/\r?\n/)).length;
    if (!raw) {
      this.previewEl.createDiv({
        text: "Type a task description",
        cls: "qr-preview-status qr-preview-muted",
      });
      this.previewRow("Save to", target);
      if (detailsCount > 0) this.previewRow("Details", `${detailsCount} note${detailsCount === 1 ? "" : "s"}`);
      return;
    }

    if (this.withReminder) {
      const parsed = parseReminder(raw);
      const ready = !!parsed.dueAt && parsed.dueAt > Date.now();
      this.previewEl.createDiv({
        text: ready ? "Ready to create" : "Add a date or time",
        cls: `qr-preview-status ${ready ? "is-ready" : "needs-time"}`,
      });
      this.previewRow("Task", parsed.text || raw);
      this.previewRow("Status", this.statusLabel());
      this.previewRow("Save to", target);
      if (parsed.dueAt) {
        this.previewRow(
          "Time",
          new Date(parsed.dueAt).toLocaleString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }),
        );
        if (parsed.matchedText) {
          this.previewEl.createDiv({
            text: `Detected "${parsed.matchedText}"`,
            cls: "qr-preview-meta",
          });
        }
      } else {
        this.previewRow("Time", "No time detected", "qr-preview-warn");
      }
    } else {
      this.previewEl.createDiv({
        text: "Ready to create",
        cls: "qr-preview-status is-ready",
      });
      this.previewRow("Task", raw);
      this.previewRow("Status", this.statusLabel());
      this.previewRow("Save to", target);
    }
    if (detailsCount > 0) this.previewRow("Details", `${detailsCount} note${detailsCount === 1 ? "" : "s"}`);
  }

  private previewRow(label: string, value: string, cls = ""): void {
    const row = this.previewEl.createDiv({ cls: "qr-preview-row" });
    row.createSpan({ text: label, cls: "qr-preview-label" });
    row.createSpan({ text: value, cls });
  }

  private statusLabel(): string {
    if (this.status === "todo") return "To Do";
    if (this.status === "in-progress") return "In Progress";
    return "Done";
  }

  onClose(): void {
    this.contentEl.empty();
    this.onClosed();
  }

  private async submit(): Promise<void> {
    const value = this.inputEl.value.trim();
    if (!value) {
      new Notice(getTaskCreateTextMissingNotice());
      return;
    }
    const result = await runSingleModalSubmit({
      isSubmitting: () => this.isSubmitting,
      setSubmitting: (isSubmitting) => this.setSubmitting(isSubmitting),
      submit: () => this.onSubmit({
        rawInput: value,
        status: this.status,
        targetFilePath: this.targetFileEl.value.trim() || DEFAULT_CATEGORY_FILE_PATH,
        details: this.detailsEl.value,
      }),
    });
    if (result.started && shouldCloseAfterSubmit(result.result)) {
      this.close();
    }
  }

  private submitLabel(): string {
    return this.withReminder ? "Create task + reminder" : "Create task";
  }

  private submittingLabel(): string {
    return this.withReminder ? "Creating task + reminder..." : "Creating task...";
  }

  private setSubmitting(isSubmitting: boolean): void {
    this.isSubmitting = isSubmitting;
    if (!this.submitBtn) return;
    this.submitBtn.disabled = isSubmitting;
    this.submitBtn.setText(isSubmitting ? this.submittingLabel() : this.submitLabel());
  }

  private attachMarkdownFileOptions(input: HTMLInputElement): void {
    const list = document.createElement("datalist");
    list.id = `qr-task-files-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    for (const file of this.app.vault
      .getMarkdownFiles()
      .sort((a, b) => a.path.localeCompare(b.path))) {
      const option = document.createElement("option");
      option.value = file.path;
      list.appendChild(option);
    }
    input.setAttr("list", list.id);
    input.after(list);
  }
}
