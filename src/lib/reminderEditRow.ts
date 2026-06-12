import type { Reminder } from "../types";
import { formatInputDate } from "./dateFormat";

export interface ReminderEditRowControls {
  textInput: HTMLInputElement;
  dueInput: HTMLInputElement;
  saveButton: HTMLButtonElement;
}

export interface ReminderEditRowOptions {
  formClass?: string;
  onCancel(): void;
}

export function renderReminderEditRow(
  parent: HTMLElement,
  reminder: Reminder,
  options: ReminderEditRowOptions,
): ReminderEditRowControls {
  const formClass = ["qr-edit-form", options.formClass].filter(Boolean).join(" ");
  const editor = parent.createDiv({ cls: formClass });
  const fields = editor.createDiv({ cls: "qr-edit-fields" });
  const textInput = fields.createEl("input", {
    type: "text",
    cls: "qr-edit-input",
  }) as HTMLInputElement;
  textInput.value = reminder.text;

  const dueInput = fields.createEl("input", {
    type: "datetime-local",
    cls: "qr-edit-input",
  }) as HTMLInputElement;
  dueInput.value = formatInputDate(reminder.dueAt);

  const actions = editor.createDiv({ cls: "qr-edit-actions" });
  actions.createEl("button", { text: "Cancel", cls: "qr-row-btn" }).onclick = options.onCancel;
  const saveButton = actions.createEl("button", {
    text: "Save",
    cls: "qr-row-btn qr-done-btn",
  }) as HTMLButtonElement;

  if (typeof window !== "undefined") {
    window.setTimeout(() => textInput.focus(), 0);
  }

  return { textInput, dueInput, saveButton };
}
