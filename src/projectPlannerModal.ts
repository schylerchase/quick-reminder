import {
  App,
  Modal,
  Notice,
  setIcon,
} from "obsidian";
import { parseReminder } from "./parser";
import {
  normalizeProjectFilePath,
  parseProjectOutline,
  ProjectPhase,
  ProjectPlan,
  ProjectTask,
  renderProjectPlanMarkdown,
  validateProjectPlan,
} from "./lib/projectPlanner";

type ProjectPlannerSubmit = (
  plan: ProjectPlan,
  markdown: string,
) => boolean | Promise<boolean>;

const SAMPLE_OUTLINE = [
  "Project: Client onboarding",
  "File: Projects/Client onboarding.md",
  "",
  "## Intake",
  "- Collect access by Friday 3pm",
  "  - confirm VPN",
  "  - confirm billing contact",
  "- Review current docs due 2026-05-25",
  "",
  "## Build",
  "- Create runbook tomorrow 10am",
  "- Validate monitoring",
].join("\n");

export class ProjectPlannerModal extends Modal {
  private projectTitleEl!: HTMLInputElement;
  private targetEl!: HTMLInputElement;
  private outlineEl!: HTMLTextAreaElement;
  private previewEl!: HTMLDivElement;
  private validationEl!: HTMLDivElement;
  private createBtn!: HTMLButtonElement;
  private plan: ProjectPlan = { title: "", filePath: "", phases: [] };

  constructor(
    app: App,
    private onSubmit: ProjectPlannerSubmit,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("qr-modal");
    this.contentEl.addClass("qr-project-planner-modal");
    this.contentEl.createEl("h2", { text: "Project planner" });

    const meta = this.contentEl.createDiv({ cls: "qr-project-meta" });
    this.projectTitleEl = this.renderTextField(meta, "Project name", "Client onboarding");
    this.targetEl = this.renderTextField(meta, "Target note", "Projects/Client onboarding.md");
    this.attachMarkdownFileOptions(this.targetEl);

    this.projectTitleEl.addEventListener("input", () => {
      this.plan.title = this.projectTitleEl.value;
      if (!this.targetEl.value.trim()) {
        this.plan.filePath = normalizeProjectFilePath("", this.projectTitleEl.value);
      }
      this.renderValidation();
    });
    this.targetEl.addEventListener("input", () => {
      this.plan.filePath = this.targetEl.value;
      this.renderValidation();
    });

    const grid = this.contentEl.createDiv({ cls: "qr-project-grid" });
    const outlineField = grid.createDiv({ cls: "qr-field qr-project-outline-field" });
    outlineField.createEl("label", { text: "Bulk outline", cls: "qr-field-label" });
    this.outlineEl = outlineField.createEl("textarea", {
      cls: "qr-input qr-input-textarea qr-project-outline-input",
      placeholder: SAMPLE_OUTLINE,
    });
    this.outlineEl.rows = 14;
    this.outlineEl.addEventListener("input", () => this.parseOutline());

    const previewField = grid.createDiv({ cls: "qr-field qr-project-preview-field" });
    previewField.createEl("label", { text: "Editable preview", cls: "qr-field-label" });
    this.previewEl = previewField.createDiv({ cls: "qr-project-preview" });

    this.validationEl = this.contentEl.createDiv({ cls: "qr-project-validation" });

    const actions = this.contentEl.createDiv({ cls: "qr-modal-actions qr-project-actions" });
    actions.createEl("button", { text: "Cancel", cls: "qr-secondary-btn" }).onclick = () => {
      this.close();
    };
    actions.createEl("button", { text: "Copy Markdown", cls: "qr-secondary-btn" }).onclick = () => {
      void this.copyMarkdown();
    };
    this.createBtn = actions.createEl("button", {
      text: "Create project note",
      cls: "qr-primary-btn",
    });
    this.createBtn.onclick = () => {
      void this.submit();
    };

    this.parseOutline();
    window.setTimeout(() => this.outlineEl.focus(), 0);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderTextField(parent: HTMLElement, label: string, placeholder: string): HTMLInputElement {
    const field = parent.createDiv({ cls: "qr-field" });
    field.createEl("label", { text: label, cls: "qr-field-label" });
    return field.createEl("input", {
      type: "text",
      cls: "qr-input",
      placeholder,
    });
  }

  private parseOutline(): void {
    this.plan = parseProjectOutline(this.outlineEl.value);
    this.projectTitleEl.value = this.plan.title;
    this.targetEl.value = this.plan.filePath;
    this.renderPreview();
    this.renderValidation();
  }

  private renderPreview(): void {
    this.previewEl.empty();
    if (!this.plan.phases.some((phase) => phase.tasks.length > 0)) {
      this.previewEl.createDiv({
        text: "Paste a project outline to build the editable preview.",
        cls: "qr-preview-muted",
      });
      return;
    }

    for (const phase of this.plan.phases) {
      this.renderPhase(phase);
    }
  }

  private renderPhase(phase: ProjectPhase): void {
    const section = this.previewEl.createDiv({ cls: "qr-project-phase" });
    const heading = section.createDiv({ cls: "qr-project-phase-head" });
    const icon = heading.createSpan({ cls: "qr-project-phase-icon" });
    setIcon(icon, "folder-kanban");
    const input = heading.createEl("input", {
      type: "text",
      cls: "qr-input qr-project-phase-input",
      value: phase.name,
    });
    input.addEventListener("input", () => {
      phase.name = input.value;
      this.renderValidation();
    });

    const tasks = section.createDiv({ cls: "qr-project-tasks" });
    for (const task of phase.tasks) {
      this.renderTask(tasks, task);
    }
  }

  private renderTask(parent: HTMLElement, task: ProjectTask): void {
    const row = parent.createDiv({ cls: "qr-project-task" });
    const line = row.createDiv({ cls: "qr-project-task-line" });
    const checkbox = line.createSpan({ cls: "qr-project-task-checkbox" });
    setIcon(checkbox, "square");
    const input = line.createEl("input", {
      type: "text",
      cls: "qr-input qr-project-task-input",
      value: task.text,
    });
    const chip = line.createSpan({ cls: "qr-project-date-chip" });
    const updateChip = () => {
      const parsed = parseReminder(input.value);
      chip.toggleClass("qr-hidden", !parsed.matchedText);
      chip.setText(parsed.matchedText ? `Date: ${parsed.matchedText}` : "");
    };
    input.addEventListener("input", () => {
      task.text = input.value;
      updateChip();
      this.renderValidation();
    });
    updateChip();

    const notes = row.createEl("textarea", {
      cls: "qr-input qr-input-textarea qr-project-notes-input",
      placeholder: "Notes or subtasks",
    });
    notes.rows = Math.max(2, task.notes.length);
    notes.value = task.notes.join("\n");
    notes.addEventListener("input", () => {
      task.notes = notes.value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      this.renderValidation();
    });
  }

  private renderValidation(): void {
    const plan = this.currentPlan();
    const errors = validateProjectPlan(plan);
    this.validationEl.empty();
    this.createBtn.disabled = errors.length > 0;
    if (errors.length === 0) {
      this.validationEl.createDiv({
        text: `Ready to create ${plan.filePath}`,
        cls: "qr-preview-status is-ready",
      });
      return;
    }

    for (const error of errors) {
      this.validationEl.createDiv({
        text: error,
        cls: "qr-preview-status needs-time",
      });
    }
  }

  private currentPlan(): ProjectPlan {
    return {
      title: this.projectTitleEl.value.trim(),
      filePath: normalizeProjectFilePath(this.targetEl.value, this.projectTitleEl.value),
      phases: this.plan.phases.map((phase) => ({
        name: phase.name.trim() || "Tasks",
        tasks: phase.tasks
          .map((task) => ({
            text: task.text.trim(),
            notes: task.notes.map((note) => note.trim()).filter((note) => note.length > 0),
            status: task.status,
          }))
          .filter((task) => task.text.length > 0),
      })),
    };
  }

  private async copyMarkdown(): Promise<void> {
    const plan = this.currentPlan();
    const errors = validateProjectPlan(plan);
    if (errors.length > 0) {
      new Notice(errors[0]);
      return;
    }
    try {
      await navigator.clipboard.writeText(renderProjectPlanMarkdown(plan));
      new Notice("Project Markdown copied.");
    } catch (error) {
      console.error("Quick Reminder project planner copy failed", error);
      new Notice("Quick Reminder could not copy the project Markdown.");
    }
  }

  private async submit(): Promise<void> {
    const plan = this.currentPlan();
    const errors = validateProjectPlan(plan);
    if (errors.length > 0) {
      new Notice(errors[0]);
      this.renderValidation();
      return;
    }

    const saved = await this.onSubmit(plan, renderProjectPlanMarkdown(plan));
    if (saved) this.close();
  }

  private attachMarkdownFileOptions(input: HTMLInputElement): void {
    const list = document.createElement("datalist");
    list.id = `qr-project-files-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
