import { App, Modal, Notice } from "obsidian";
import { parseReminder } from "./parser";
import { Reminder } from "./types";
import { ReminderStore } from "./store";
import { Scheduler } from "./scheduler";
import {
  getReminderManagerActionLabels,
  getReminderManagerSections,
} from "./lib/reminderManager";
import {
  getReminderActionFailedNotice,
  getReminderActionRefreshFailedNotice,
  getReminderCreatedNotice,
  getReminderEditInvalidNotice,
  getReminderPastTimeNotice,
  getReminderSaveFailedNotice,
  getReminderTextMissingNotice,
  getReminderTimeMissingNotice,
  getTaskReminderDuplicateNotice,
} from "./lib/reminderMessages";
import { runReminderActionWorkflow } from "./lib/reminderActionWorkflow";
import { runExistingTaskReminderWorkflow } from "./lib/taskReminderWorkflow";
import { saveScheduledReminder } from "./reminderTransaction";
import { formatInputDate } from "./lib/dateFormat";

export class QuickCaptureModal extends Modal {
  private inputEl!: HTMLInputElement;
  private previewEl!: HTMLDivElement;
  private saveButtonEl!: HTMLButtonElement;
  private currentParse = parseReminder("");
  private isSaving = false;
  private isClosed = false;

  constructor(
    app: App,
    private store: ReminderStore,
    private scheduler: Scheduler,
    private initialInput = "",
    private sourceTaskId: string | null = null,
    private onSaveReminder: ((reminder: Reminder, rawInput: string) => void | Promise<void>) | null = null,
    private selectInitialInput = true,
    private onClosed: () => void = () => {},
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("qr-modal");

    const header = contentEl.createDiv({ cls: "qr-modal-header" });
    header.createEl("h2", { text: "New reminder" });

    const field = contentEl.createDiv({ cls: "qr-field" });
    field.createEl("label", {
      text: "Reminder",
      cls: "qr-field-label",
      attr: { for: "qr-reminder-input" },
    });

    this.inputEl = field.createEl("input", {
      type: "text",
      // chrono-node is expensive on every keystroke; cap input so a pasted
      // adversarial string (catastrophic backtracking patterns) can't stall
      // the UI on mobile.
      attr: { id: "qr-reminder-input", maxlength: "500" },
      placeholder: "e.g. call mom tomorrow at 3pm",
      cls: "qr-input",
    });
    this.setInput(this.initialInput);
    this.inputEl.focus();
    if (this.initialInput) {
      if (this.selectInitialInput) {
        this.inputEl.select();
      } else {
        this.inputEl.setSelectionRange(this.initialInput.length, this.initialInput.length);
      }
    }

    this.previewEl = contentEl.createDiv({ cls: "qr-preview" });
    this.renderPreview();

    this.inputEl.addEventListener("input", () => {
      this.currentParse = parseReminder(this.inputEl.value);
      this.renderPreview();
    });

    this.inputEl.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        void this.save();
      }
    });

    const actions = contentEl.createDiv({ cls: "qr-modal-actions" });
    actions.createEl("button", { text: "Cancel", cls: "qr-secondary-btn" }).onclick = () => {
      this.close();
    };
    this.saveButtonEl = actions.createEl("button", {
      text: "Create reminder",
      cls: "qr-primary-btn",
    });
    this.saveButtonEl.onclick = () => {
      void this.save();
    };
    this.updateSaveState();
  }

  onClose(): void {
    this.isClosed = true;
    this.contentEl.empty();
    this.onClosed();
  }

  private renderPreview(): void {
    this.previewEl.empty();
    const { text, dueAt, matchedText } = this.currentParse;

    if (!text && !dueAt) {
      this.previewEl.createDiv({
        text: "Waiting for a reminder",
        cls: "qr-preview-status qr-preview-muted",
      });
      this.updateSaveState();
      return;
    }

    const status = this.previewEl.createDiv({
      text: dueAt ? "Ready to create" : "Add a date or time",
      cls: `qr-preview-status ${dueAt ? "is-ready" : "needs-time"}`,
    });
    status.setAttr("aria-live", "polite");

    this.renderPreviewRow("Task", text || "(empty)");

    if (dueAt) {
      this.renderPreviewRow("Time", formatDateTime(dueAt));
      if (matchedText) {
        this.previewEl.createDiv({
          text: `Detected "${matchedText}"`,
          cls: "qr-preview-meta",
        });
      }
    } else {
      this.renderPreviewRow("Time", "No time detected", "qr-preview-warn");
    }

    this.updateSaveState();
  }

  private renderPreviewRow(label: string, value: string, cls = ""): void {
    const row = this.previewEl.createDiv({ cls: "qr-preview-row" });
    row.createSpan({ text: label, cls: "qr-preview-label" });
    row.createSpan({ text: value, cls });
  }

  private setInput(value: string): void {
    this.inputEl.value = value;
    this.currentParse = parseReminder(value);
  }

  private updateSaveState(): void {
    if (!this.saveButtonEl) return;
    const { text, dueAt } = this.currentParse;
    this.saveButtonEl.disabled = !text || !dueAt || dueAt <= Date.now();
  }

  private async save(): Promise<void> {
    // Re-entry guard: a fast Enter+click or double-click could otherwise
    // create two reminders with different IDs from one user action.
    if (this.isSaving || this.isClosed) return;

    const { text, dueAt } = this.currentParse;

    if (!text) {
      new Notice(getReminderTextMissingNotice());
      return;
    }
    if (!dueAt) {
      new Notice(getReminderTimeMissingNotice());
      return;
    }
    if (dueAt <= Date.now()) {
      new Notice(getReminderPastTimeNotice());
      return;
    }

    // Snapshot the raw input before the await — onClose() empties the DOM
    // and detaches inputEl, so reading .value later is unreliable.
    const rawInput = this.inputEl.value;
    this.isSaving = true;
    if (this.saveButtonEl) this.saveButtonEl.disabled = true;

    const reminder: Reminder = {
      id: genId(),
      text,
      rawInput,
      dueAt,
      createdAt: Date.now(),
      notified: false,
    };
    if (this.sourceTaskId) {
      reminder.sourceTaskId = this.sourceTaskId;
    }

    try {
      const result = await runExistingTaskReminderWorkflow({
        hasExistingReminder: this.sourceTaskId
          ? () => this.store.hasPendingReminderForSourceTask(this.sourceTaskId!)
          : undefined,
        saveReminder: () =>
          saveScheduledReminder(
            this.store,
            this.scheduler,
            reminder,
            () => this.onSaveReminder?.(reminder, rawInput),
            (rollbackErr) => console.error("Quick Reminder rollback failed", rollbackErr),
          ),
        afterSave: async () => {},
        onDuplicate: () => new Notice(getTaskReminderDuplicateNotice()),
        onSaveError: (err) => console.error("Quick Reminder save failed", err),
      });

      if (result.ok) {
        new Notice(getReminderCreatedNotice(text, formatDateTime(dueAt)));
        this.close();
      } else if ("duplicate" in result) {
        if (this.saveButtonEl) this.saveButtonEl.disabled = false;
      } else if (!result.reminderSaved) {
        new Notice(getReminderSaveFailedNotice());
        if (this.saveButtonEl) this.saveButtonEl.disabled = false;
      }
    } finally {
      this.isSaving = false;
    }
  }
}

export class ReminderListModal extends Modal {
  private editingId: string | null = null;

  constructor(
    app: App,
    private store: ReminderStore,
    private scheduler: Scheduler,
    private openCapture: (text?: string) => void = (text = "") => {
      new QuickCaptureModal(this.app, this.store, this.scheduler, text).open();
    },
    private onClosed: () => void = () => {},
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("qr-modal");
    contentEl.addClass("qr-list-modal");

    const header = contentEl.createDiv({ cls: "qr-modal-header" });
    header.createEl("h2", { text: "Reminders" });

    const sections = getReminderManagerSections(this.store.all);
    const hasReminders = sections.some((section) => section.reminders.length > 0);
    if (!hasReminders) {
      contentEl.createEl("p", {
        text: "No reminders yet.",
        cls: "qr-preview-muted",
      });
      const actions = contentEl.createDiv({ cls: "qr-modal-actions" });
      actions.createEl("button", {
        text: "New reminder",
        cls: "qr-primary-btn",
      }).onclick = () => {
        this.close();
        this.openCapture();
      };
      return;
    }

    for (const section of sections) {
      this.renderSection(contentEl, section);
    }
  }

  onClose(): void {
    this.editingId = null;
    this.contentEl.empty();
    this.onClosed();
  }

  private renderSection(
    parent: HTMLElement,
    section: ReturnType<typeof getReminderManagerSections>[number],
  ): void {
    const wrapper = parent.createDiv({ cls: "qr-list-section" });
    const head = wrapper.createDiv({ cls: "qr-list-section-head" });
    head.createEl("h3", { text: section.title });
    head.createSpan({
      text: String(section.reminders.length),
      cls: "qr-list-count",
    });

    if (section.reminders.length === 0) {
      wrapper.createDiv({
        text: section.emptyText,
        cls: "qr-preview-muted qr-list-empty",
      });
      return;
    }

    for (const reminder of section.reminders) {
      this.renderReminderRow(wrapper, reminder, section.isHistory);
    }
  }

  private renderReminderRow(
    parent: HTMLElement,
    reminder: Reminder,
    isHistory: boolean,
  ): void {
    const row = parent.createDiv({ cls: "qr-list-row" });
    row.toggleClass("qr-list-row-history", isHistory);

    if (this.editingId === reminder.id && !isHistory) {
      this.renderEditRow(row, reminder);
      return;
    }

    const text = row.createDiv({ cls: "qr-list-text" });
    text.createDiv({ text: reminder.text, cls: "qr-list-title" });
    text.createDiv({
      text: formatManagerWhen(reminder, isHistory),
      cls: "qr-list-when",
    });

    const actions = row.createDiv({ cls: "qr-list-actions qr-view-row-actions" });
    for (const label of getReminderManagerActionLabels(
      isHistory,
      this.store.settings.defaultSnoozeMinutes,
    )) {
      this.renderAction(actions, reminder, label);
    }
  }

  private renderAction(
    parent: HTMLElement,
    reminder: Reminder,
    label: string,
  ): void {
    const button = parent.createEl("button", {
      text: label,
      cls: label === "Delete" ? "qr-row-btn qr-view-del" : "qr-row-btn",
    });
    button.setAttr("aria-label", `${label} reminder`);

    if (label === "Done") {
      this.wireActionButton(button, {
        busyText: "Saving...",
        description: "mark this reminder done",
        successMessage: "Reminder marked done",
        action: async () => {
          this.scheduler.cancel(reminder.id);
          await this.store.complete(reminder.id);
        },
      });
      return;
    }

    if (label.startsWith("Snooze")) {
      const minutes = this.store.settings.defaultSnoozeMinutes;
      this.wireActionButton(button, {
        busyText: "Snoozing...",
        description: "snooze this reminder",
        successMessage: `Snoozed ${minutes}m`,
        action: async () => {
          await this.store.snooze(reminder.id, minutes);
          this.scheduler.scheduleAll();
        },
      });
      return;
    }

    if (label === "Edit") {
      button.onclick = () => {
        this.editingId = reminder.id;
        this.onOpen();
      };
      return;
    }

    if (label === "Restore") {
      this.wireActionButton(button, {
        busyText: "Restoring...",
        description: "restore this reminder",
        successMessage: "Reminder restored",
        action: async () => {
          await this.store.restore(reminder.id);
          this.scheduler.scheduleAll();
        },
      });
      return;
    }

    if (label === "Re-add") {
      button.onclick = () => {
        this.close();
        this.openCapture(reminder.text);
      };
      return;
    }

    this.wireActionButton(button, {
      busyText: "Deleting...",
      description: "delete this reminder",
      successMessage: "Reminder deleted",
      action: async () => {
        this.scheduler.cancel(reminder.id);
        await this.store.remove(reminder.id);
      },
    });
  }

  private renderEditRow(parent: HTMLElement, reminder: Reminder): void {
    const editor = parent.createDiv({ cls: "qr-edit-form qr-list-edit-form" });
    const fields = editor.createDiv({ cls: "qr-edit-fields" });
    const textInput = fields.createEl("input", { type: "text", cls: "qr-edit-input" });
    textInput.value = reminder.text;

    const dueInput = fields.createEl("input", {
      type: "datetime-local",
      cls: "qr-edit-input",
    });
    dueInput.value = formatInputDate(reminder.dueAt);

    const actions = editor.createDiv({ cls: "qr-edit-actions" });
    actions.createEl("button", { text: "Cancel", cls: "qr-row-btn" }).onclick = () => {
      this.editingId = null;
      this.onOpen();
    };
    const saveBtn = actions.createEl("button", { text: "Save", cls: "qr-row-btn qr-done-btn" });
    let isRunning = false;
    const idleText = saveBtn.textContent ?? "";
    saveBtn.onclick = () => {
      void this.saveEdit(
        reminder,
        textInput.value,
        dueInput.value,
        {
          isRunning: () => isRunning,
          setRunning: (running) => {
            isRunning = running;
            saveBtn.disabled = running;
            saveBtn.setText(running ? "Saving..." : idleText);
          },
        },
      );
    };

    window.setTimeout(() => textInput.focus(), 0);
  }

  private async saveEdit(
    reminder: Reminder,
    textValue: string,
    dueValue: string,
    runningState: {
      isRunning: () => boolean;
      setRunning: (running: boolean) => void;
    },
  ): Promise<void> {
    const text = textValue.trim();
    const dueAt = new Date(dueValue).getTime();
    if (!text || Number.isNaN(dueAt)) {
      new Notice(getReminderEditInvalidNotice());
      return;
    }
    if (dueAt <= Date.now()) {
      new Notice(getReminderPastTimeNotice());
      return;
    }

    await this.runAction(
      "update this reminder",
      "Reminder updated",
      async () => {
        await this.store.updateReminder(reminder.id, text, dueAt);
        this.scheduler.scheduleAll();
        this.editingId = null;
      },
      runningState,
    );
  }

  private wireActionButton(
    button: HTMLButtonElement,
    options: {
      busyText: string;
      description: string;
      successMessage: string;
      action: () => Promise<void>;
    },
  ): void {
    const idleText = button.textContent ?? "";
    let isRunning = false;
    button.onclick = () => {
      void this.runAction(
        options.description,
        options.successMessage,
        options.action,
        {
          isRunning: () => isRunning,
          setRunning: (running) => {
            isRunning = running;
            button.disabled = running;
            button.setText(running ? options.busyText : idleText);
          },
        },
      );
    };
  }

  private async runAction(
    description: string,
    successMessage: string,
    action: () => Promise<void>,
    runningState?: {
      isRunning: () => boolean;
      setRunning: (running: boolean) => void;
    },
  ): Promise<void> {
    const result = await runReminderActionWorkflow({
      isRunning: runningState?.isRunning,
      setRunning: runningState?.setRunning,
      run: action,
      refresh: () => this.onOpen(),
      onError: (error) =>
        console.error("Quick Reminder reminder manager action failed", error),
      onRefreshError: (error) =>
        console.error("Quick Reminder reminder manager refresh failed", error),
    });

    if (!result.ok) {
      if ("ignored" in result) return;
      new Notice(
        result.actionCompleted
          ? getReminderActionRefreshFailedNotice()
          : getReminderActionFailedNotice(description),
      );
      return;
    }

    new Notice(successMessage);
  }
}

function genId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatManagerWhen(reminder: Reminder, isHistory: boolean): string {
  if (!isHistory) return formatDateTime(reminder.dueAt);

  const finishedAt = reminder.completedAt ?? reminder.notifiedAt;
  if (!finishedAt) return `Due ${formatDateTime(reminder.dueAt)}`;

  return `Finished ${formatDateTime(finishedAt)} - due ${formatDateTime(reminder.dueAt)}`;
}
