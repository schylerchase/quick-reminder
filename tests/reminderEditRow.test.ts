import test from "node:test";
import assert from "node:assert/strict";
import { renderReminderEditRow } from "../src/lib/reminderEditRow";
import type { Reminder } from "../src/types";

test("renderReminderEditRow builds the shared edit scaffold and returns controls", () => {
  let cancelled = false;
  const parent = new FakeElement("div");
  const reminder: Reminder = {
    id: "r1",
    text: "pay bill",
    rawInput: "pay bill tomorrow",
    dueAt: new Date(2030, 0, 2, 9, 30).getTime(),
    createdAt: 1,
    notified: false,
  };

  const controls = renderReminderEditRow(parent as never, reminder, {
    formClass: "qr-list-edit-form",
    onCancel: () => {
      cancelled = true;
    },
  });

  assert.equal(parent.children[0].className, "qr-edit-form qr-list-edit-form");
  assert.equal(controls.textInput.value, "pay bill");
  assert.equal(controls.dueInput.value, "2030-01-02T09:30");
  assert.equal(controls.saveButton.textContent, "Save");

  const cancel = parent.findButton("Cancel");
  cancel.onclick?.();
  assert.equal(cancelled, true);
});

class FakeElement {
  children: FakeElement[] = [];
  onclick: (() => void) | null = null;
  textContent = "";
  value = "";

  constructor(
    readonly tag: string,
    public className = "",
  ) {}

  createDiv(options: { cls?: string; text?: string } = {}): FakeElement {
    return this.append("div", options);
  }

  createEl(tag: string, options: { cls?: string; text?: string; type?: string } = {}): FakeElement {
    const child = this.append(tag, options);
    if (options.type) child.type = options.type;
    return child;
  }

  setText(text: string): void {
    this.textContent = text;
  }

  focus(): void {}

  findButton(text: string): FakeElement {
    const found = this.walk().find((el) => el.tag === "button" && el.textContent === text);
    assert.ok(found, `missing ${text} button`);
    return found;
  }

  private append(tag: string, options: { cls?: string; text?: string }): FakeElement {
    const child = new FakeElement(tag, options.cls ?? "");
    child.textContent = options.text ?? "";
    this.children.push(child);
    return child;
  }

  private walk(): FakeElement[] {
    return [this, ...this.children.flatMap((child) => child.walk())];
  }

  private type = "";
}
