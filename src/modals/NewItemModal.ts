import { App, Modal, setIcon } from "obsidian";

export class NewItemModal extends Modal {
  constructor(
    app: App,
    private onTask: () => void,
    private onReminder: () => void,
    private onProjectPlanner: () => void,
    private onClosed: () => void = () => {},
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("qr-modal");
    this.contentEl.addClass("qr-new-item-modal");
    this.contentEl.createEl("h2", { text: "Create new" });
    this.contentEl.createEl("p", {
      text: "What do you want to add?",
      cls: "qr-modal-subtitle",
    });

    const grid = this.contentEl.createDiv({ cls: "qr-pick-grid" });
    this.renderPick(grid, "list-checks", "Task", "Add to a markdown checklist", () => {
      this.close();
      this.onTask();
    });
    this.renderPick(grid, "alarm-clock", "Reminder", "Notify me at a specific time", () => {
      this.close();
      this.onReminder();
    });
    this.renderPick(grid, "folder-kanban", "Project Planner", "Create a project note from an outline", () => {
      this.close();
      this.onProjectPlanner();
    });
  }

  private renderPick(
    parent: HTMLElement,
    icon: string,
    title: string,
    subtitle: string,
    onClick: () => void,
  ): void {
    const card = parent.createEl("button", { cls: "qr-pick-card" });
    const iconWrap = card.createSpan({ cls: "qr-pick-icon" });
    setIcon(iconWrap, icon);
    const text = card.createDiv({ cls: "qr-pick-text" });
    text.createDiv({ text: title, cls: "qr-pick-title" });
    text.createDiv({ text: subtitle, cls: "qr-pick-subtitle" });
    card.onclick = onClick;
  }

  onClose(): void {
    this.contentEl.empty();
    this.onClosed();
  }
}
