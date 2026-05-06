# Phase 1 — New Task From Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisites:** Phase 0 complete (Vitest harness, `inlineFields.ts`, `verifyAndWrite` via `vault.process`).

**Goal:** Add a "New task" button to the dashboard toolbar that opens a lightweight modal, appends a checkbox task to the active note's `## Tasks → ### To Do` (or chosen status) section using `vault.process`, then refreshes scan and highlights the new row.

**Architecture:** Pure section-manipulation helpers extracted into `src/sections.ts` (zero `obsidian` import) for unit testability. New `NewTaskModal` mirrors existing `IgnoreTaskModal` pattern. Button only enabled in "Current file" scope; other scopes show a tooltip directing the user to switch scope. All writes route through `verifyAndWrite` from Phase 0 — atomic against open editors.

**Tech Stack:** Same as Phase 0.

**File touchpoint summary:**
- Create: `src/sections.ts`, `src/newTaskModal.ts`, `tests/sections.test.ts`.
- Modify: `src/view.ts:389` (toolbar), `src/view.ts:520` (highlight new row), `src/main.ts:841-867` (re-export from sections), `src/taskScanner.ts` (add `appendTaskToFile` writer), `styles.css`, `manifest.json`, `package.json`, `CHANGELOG.md`, `README.md`.

---

### Task 1: Extract sections.ts with existing helpers

**Files:**
- Create: `src/sections.ts`
- Create: `tests/sections.test.ts`
- Modify: `src/main.ts`

- [ ] **Step 1:** Failing tests in `tests/sections.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { hasTaskSection, buildTaskSectionBlock, normalizeTaskSectionHeadings } from "../src/sections";

describe("hasTaskSection", () => {
  it("matches '## Tasks' heading", () => {
    expect(hasTaskSection("intro\n\n## Tasks\n\n### To Do\n")).toBe(true);
  });

  it("ignores '## Tasks' inside code fence", () => {
    expect(hasTaskSection("```\n## Tasks\n```\n")).toBe(false);
  });

  it("returns false when absent", () => {
    expect(hasTaskSection("# Just a note\n\nNo tasks here")).toBe(false);
  });
});

describe("buildTaskSectionBlock", () => {
  it("builds default block with 3 sub-headings", () => {
    const block = buildTaskSectionBlock(["In Progress", "To Do", "Completed"]);
    expect(block).toContain("## Tasks");
    expect(block).toContain("### In Progress");
    expect(block).toContain("### To Do");
    expect(block).toContain("### Completed");
  });

  it("filters empty heading entries", () => {
    const block = buildTaskSectionBlock(["", "  ", "To Do"]);
    expect(block).toContain("### To Do");
    expect(block.match(/^###/gm)?.length).toBe(1);
  });

  it("falls back to defaults when all empty", () => {
    expect(buildTaskSectionBlock(["", " "])).toContain("### To Do");
  });
});

describe("normalizeTaskSectionHeadings", () => {
  it("trims and filters", () => {
    expect(normalizeTaskSectionHeadings([" To Do ", "", "Done"])).toEqual(["To Do", "Done"]);
  });

  it("returns defaults for empty input", () => {
    expect(normalizeTaskSectionHeadings([])).toEqual(["In Progress", "To Do", "Completed"]);
  });
});
```

Note: `hasTaskSection` "ignores code fence" requires a more careful implementation than the current regex-only version. Update accordingly.

- [ ] **Step 2:** Run, expect FAIL.

- [ ] **Step 3:** Create `src/sections.ts`:

```typescript
const TASK_HEADING_RE = /^\s{0,3}##\s+Tasks\s*#*\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;

export function hasTaskSection(content: string): boolean {
  let inFence = false;
  for (const line of content.split(/\r?\n/)) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (TASK_HEADING_RE.test(line)) return true;
  }
  return false;
}

export function normalizeTaskSectionHeadings(headings: string[]): string[] {
  const cleaned = headings.map((h) => h.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : ["In Progress", "To Do", "Completed"];
}

export function buildTaskSectionBlock(headings: string[]): string {
  const sections = normalizeTaskSectionHeadings(headings);
  return ["## Tasks", "", ...sections.flatMap((h) => [`### ${h}`, ""])].join("\n").trimEnd() + "\n";
}
```

- [ ] **Step 4:** Run tests. PASS expected.

- [ ] **Step 5:** Update `src/main.ts:841-867` — replace inline definitions with re-exports from sections.ts:

```typescript
import { buildTaskSectionBlock, hasTaskSection, normalizeTaskSectionHeadings } from "./sections";
```

Delete the now-duplicated function definitions from `main.ts`. Verify nothing else imports them by file (they're file-local today).

- [ ] **Step 6:** Build clean.

- [ ] **Step 7:** Commit:

```bash
git add src/sections.ts tests/sections.test.ts src/main.ts
git commit -m "refactor: extract task section helpers to sections.ts"
```

---

### Task 2: appendTaskUnderHeading function

**Files:**
- Modify: `src/sections.ts`
- Modify: `tests/sections.test.ts`

- [ ] **Step 1:** Failing tests:

```typescript
import { appendTaskUnderHeading } from "../src/sections";

describe("appendTaskUnderHeading", () => {
  it("appends under existing sub-heading before next heading", () => {
    const before = [
      "# Note",
      "",
      "## Tasks",
      "",
      "### To Do",
      "- [ ] First",
      "- [ ] Second",
      "",
      "### Completed",
      "- [x] Old",
      "",
    ].join("\n");

    const result = appendTaskUnderHeading(before, "To Do", "- [ ] Third");

    expect(result).toContain("- [ ] First\n- [ ] Second\n- [ ] Third");
    // Completed unchanged
    expect(result).toContain("### Completed\n- [x] Old");
  });

  it("appends to empty sub-heading", () => {
    const before = "## Tasks\n\n### To Do\n\n### Completed\n";
    const result = appendTaskUnderHeading(before, "To Do", "- [ ] First");
    expect(result).toContain("### To Do\n- [ ] First");
    expect(result).toContain("### Completed");
  });

  it("appends at EOF when sub-heading is last", () => {
    const before = "## Tasks\n\n### To Do\n- [ ] Existing\n";
    const result = appendTaskUnderHeading(before, "To Do", "- [ ] New");
    expect(result.trimEnd().endsWith("- [ ] New")).toBe(true);
  });

  it("returns null when sub-heading absent", () => {
    expect(appendTaskUnderHeading("## Tasks\n\n### Other\n", "To Do", "- [ ] Task")).toBeNull();
  });

  it("preserves CRLF when input uses CRLF", () => {
    const before = "## Tasks\r\n\r\n### To Do\r\n- [ ] First\r\n";
    const result = appendTaskUnderHeading(before, "To Do", "- [ ] Second");
    expect(result).toContain("\r\n");
  });
});
```

- [ ] **Step 2:** Run, FAIL.

- [ ] **Step 3:** Implement:

```typescript
const ANY_HEADING_RE = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const SUB_HEADING_RE = /^\s{0,3}###\s+(.+?)\s*#*\s*$/;

export function appendTaskUnderHeading(
  content: string,
  subHeading: string,
  taskLine: string,
): string | null {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  const target = subHeading.trim().toLowerCase();

  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(SUB_HEADING_RE);
    if (m && m[1].trim().toLowerCase() === target) {
      headingIdx = i;
      break;
    }
  }
  if (headingIdx === -1) return null;

  // Walk forward to find boundary: next heading of equal or higher level (## or ###) or EOF
  let boundary = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(ANY_HEADING_RE);
    if (m && m[1].length <= 3) {
      boundary = i;
      break;
    }
  }

  // Walk backward from boundary to skip trailing blank lines within the section
  let insertAt = boundary;
  while (insertAt > headingIdx + 1 && lines[insertAt - 1].trim() === "") {
    insertAt--;
  }

  lines.splice(insertAt, 0, taskLine);
  return lines.join(newline);
}
```

- [ ] **Step 4:** Run tests, PASS expected (5/5).

- [ ] **Step 5:** Commit:

```bash
git add src/sections.ts tests/sections.test.ts
git commit -m "feat: add appendTaskUnderHeading with sub-heading boundary walk"
```

---

### Task 3: appendTaskToFile writer in taskScanner

**Files:**
- Modify: `src/taskScanner.ts`
- Create: `tests/appendTaskToFile.test.ts`

- [ ] **Step 1:** Failing test:

```typescript
import { describe, it, expect } from "vitest";
import { TaskScanner } from "../src/taskScanner";
import { TFile } from "obsidian";

function makeApp(initialContent: string) {
  let stored = initialContent;
  const file = Object.assign(new TFile(), { path: "note.md", extension: "md" });
  return {
    file,
    stored: () => stored,
    app: {
      vault: {
        getAbstractFileByPath: () => file,
        process: async (_f: TFile, fn: (data: string) => string) => {
          stored = fn(stored);
          return stored;
        },
        getMarkdownFiles: () => [file],
      },
    } as unknown as ConstructorParameters<typeof TaskScanner>[0],
  };
}

describe("TaskScanner.appendTaskToFile", () => {
  it("appends to existing ### To Do", async () => {
    const env = makeApp("## Tasks\n\n### To Do\n- [ ] First\n");
    const scanner = new TaskScanner(env.app);
    const ok = await scanner.appendTaskToFile("note.md", "To Do", "Buy milk");
    expect(ok).toBe(true);
    expect(env.stored()).toContain("- [ ] Buy milk");
  });

  it("creates ## Tasks section when absent", async () => {
    const env = makeApp("# My note\n\nSome body text.\n");
    const scanner = new TaskScanner(env.app);
    const ok = await scanner.appendTaskToFile("note.md", "To Do", "Buy milk");
    expect(ok).toBe(true);
    const stored = env.stored();
    expect(stored).toContain("## Tasks");
    expect(stored).toContain("### To Do");
    expect(stored).toContain("- [ ] Buy milk");
  });

  it("returns false when file not found", async () => {
    const env = makeApp("");
    (env.app.vault as unknown as { getAbstractFileByPath: () => null }).getAbstractFileByPath = () => null;
    const scanner = new TaskScanner(env.app);
    expect(await scanner.appendTaskToFile("missing.md", "To Do", "x")).toBe(false);
  });
});
```

- [ ] **Step 2:** Run, FAIL.

- [ ] **Step 3:** Implement on `TaskScanner`:

```typescript
import { appendTaskUnderHeading, buildTaskSectionBlock, hasTaskSection } from "./sections";

async appendTaskToFile(
  filePath: string,
  subHeading: string,
  taskText: string,
  defaultHeadings: string[] = ["In Progress", "To Do", "Completed"],
): Promise<boolean> {
  const file = this.app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return false;

  const taskLine = `- [ ] ${taskText.trim()}`;
  await this.app.vault.process(file, (data: string) => {
    if (!hasTaskSection(data)) {
      const trimmed = data.replace(/\s+$/, "");
      const newline = data.includes("\r\n") ? "\r\n" : "\n";
      const block = buildTaskSectionBlock(defaultHeadings);
      const newContent = `${trimmed}${trimmed.length ? newline + newline : ""}${block}`;
      const appended = appendTaskUnderHeading(newContent, subHeading, taskLine);
      return appended ?? newContent;
    }
    const result = appendTaskUnderHeading(data, subHeading, taskLine);
    return result ?? data;
  });
  return true;
}
```

- [ ] **Step 4:** Run tests, PASS.

- [ ] **Step 5:** Commit:

```bash
git add src/taskScanner.ts tests/appendTaskToFile.test.ts
git commit -m "feat: add TaskScanner.appendTaskToFile via vault.process"
```

---

### Task 4: NewTaskModal

**Files:**
- Create: `src/newTaskModal.ts`

- [ ] **Step 1:** Create the modal mirroring `IgnoreTaskModal` shape (`view.ts:1114`):

```typescript
import { App, Modal, Notice, Setting } from "obsidian";

export interface NewTaskSubmission {
  text: string;
  status: "todo" | "in-progress" | "completed";
}

export class NewTaskModal extends Modal {
  private textInput!: HTMLInputElement;
  private statusSelect!: HTMLSelectElement;
  private errorEl!: HTMLDivElement;
  private submitting = false;

  constructor(
    app: App,
    private targetFileLabel: string,
    private onSubmit: (submission: NewTaskSubmission) => Promise<{ ok: true } | { ok: false; error: string }>,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: `New task in ${this.targetFileLabel}` });

    new Setting(contentEl)
      .setName("Task text")
      .addText((t) => {
        this.textInput = t.inputEl;
        t.inputEl.style.width = "100%";
        t.inputEl.placeholder = "What needs doing?";
      });

    new Setting(contentEl)
      .setName("Status")
      .addDropdown((d) => {
        this.statusSelect = d.selectEl;
        d.addOption("todo", "To Do")
         .addOption("in-progress", "In Progress")
         .addOption("completed", "Completed")
         .setValue("todo");
      });

    this.errorEl = contentEl.createDiv({ cls: "qr-modal-error" });
    this.errorEl.style.color = "var(--text-error)";
    this.errorEl.style.marginTop = "0.5em";
    this.errorEl.hide();

    const buttonRow = contentEl.createDiv();
    buttonRow.style.display = "flex";
    buttonRow.style.gap = "0.5em";
    buttonRow.style.marginTop = "1em";

    const submit = buttonRow.createEl("button", { text: "Add task", cls: "mod-cta" });
    submit.onclick = () => void this.submit();

    const cancel = buttonRow.createEl("button", { text: "Cancel" });
    cancel.onclick = () => this.close();

    this.textInput.focus();
    this.textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void this.submit();
      } else if (e.key === "Escape") {
        this.close();
      }
    });
  }

  private async submit(): Promise<void> {
    if (this.submitting) return;
    const text = this.textInput.value.trim();
    if (!text) {
      this.showError("Task text is required.");
      return;
    }
    this.submitting = true;
    this.errorEl.hide();
    const result = await this.onSubmit({
      text,
      status: this.statusSelect.value as NewTaskSubmission["status"],
    });
    this.submitting = false;
    if (result.ok) {
      this.close();
    } else {
      this.showError(result.error);
    }
  }

  private showError(msg: string): void {
    this.errorEl.setText(msg);
    this.errorEl.show();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
```

- [ ] **Step 2:** Build clean.

- [ ] **Step 3:** Commit:

```bash
git add src/newTaskModal.ts
git commit -m "feat: add NewTaskModal with inline error and Esc/Enter handling"
```

---

### Task 5: Wire New task button into toolbar

**Files:**
- Modify: `src/view.ts`

- [ ] **Step 1:** Update `renderTaskToolbar` (`view.ts:389`) to add the button. After the existing sort select:

```typescript
const newTaskBtn = toolbar.createEl("button", {
  text: "New task",
  cls: "qr-task-new-btn mod-cta",
});
const isCurrentFile = this.taskScope === "active" && this.lastMarkdownPath !== null;
newTaskBtn.disabled = !isCurrentFile;
newTaskBtn.title = isCurrentFile
  ? "Add a task to the current note"
  : "Switch to Current file scope to add a task";
newTaskBtn.onclick = () => {
  if (!isCurrentFile || !this.lastMarkdownPath) return;
  this.openNewTaskModal(this.lastMarkdownPath);
};
```

- [ ] **Step 2:** Add the handler method to `ReminderView`:

```typescript
private openNewTaskModal(targetPath: string): void {
  const filename = targetPath.split("/").pop() ?? targetPath;
  const subHeadingMap: Record<NewTaskSubmission["status"], string> = {
    todo: "To Do",
    "in-progress": "In Progress",
    completed: "Completed",
  };
  new NewTaskModal(this.app, filename, async ({ text, status }) => {
    try {
      const ok = await this.taskScanner.appendTaskToFile(
        targetPath,
        subHeadingMap[status],
        text,
        this.store.settings.taskSectionHeadings,
      );
      if (!ok) return { ok: false, error: "Could not write — file not found." };
      this.pendingNewTaskHighlight = `${targetPath}::${text}`;
      await this.refreshScrapedTasks();
      await this.render();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }).open();
}
```

Add the `pendingNewTaskHighlight` field to the class:

```typescript
private pendingNewTaskHighlight: string | null = null;
```

Add imports at top of `view.ts`:

```typescript
import { NewTaskModal, NewTaskSubmission } from "./newTaskModal";
```

- [ ] **Step 3:** Build clean.

- [ ] **Step 4:** Commit:

```bash
git add src/view.ts
git commit -m "feat: wire New task button into dashboard toolbar"
```

---

### Task 6: Highlight new row + scroll into view

**Files:**
- Modify: `src/view.ts`
- Modify: `styles.css`

- [ ] **Step 1:** In `renderScrapedRow` (`view.ts:520`), check the highlight token:

```typescript
private renderScrapedRow(
  parent: HTMLElement,
  task: ScrapedTask,
  isIgnored = false,
  ignoredNote = "",
  showFilePath = true,
): void {
  const row = parent.createDiv({ cls: "qr-view-row qr-scraped-row" });
  // existing toggleClass calls...

  const highlightToken = `${task.filePath}::${task.text}`;
  if (this.pendingNewTaskHighlight === highlightToken) {
    row.addClass("qr-row-new");
    window.setTimeout(() => row.removeClass("qr-row-new"), 1500);
    window.setTimeout(() => row.scrollIntoView({ block: "center", behavior: "smooth" }), 0);
    // Focus the first action button after render settles
    window.setTimeout(() => {
      const firstBtn = row.querySelector<HTMLButtonElement>(".qr-row-btn");
      firstBtn?.focus();
    }, 50);
    this.pendingNewTaskHighlight = null;
  }
  // ... rest of existing render logic
}
```

- [ ] **Step 2:** Add CSS in `styles.css`:

```css
.qr-row-new {
  background: var(--background-modifier-success-hover, rgba(0, 200, 0, 0.15));
  transition: background 1.5s ease-out;
}
```

- [ ] **Step 3:** Build clean. Manual smoke test: dashboard in Current file scope, click New task, type text, hit Enter — row should fade green and scroll into view.

- [ ] **Step 4:** Commit:

```bash
git add src/view.ts styles.css
git commit -m "feat: highlight and scroll to newly added task row"
```

---

### Task 7: Manual integration test in vault

**Files:** none (manual verification)

- [ ] **Step 1:** Build:

```bash
npm run build
```

- [ ] **Step 2:** Reload plugin in test vault:

```
Vault path: C:\Users\schyl\OneDrive - admin\Projects Folder\RR\Volunteer Healthcare Services, Inc\.obsidian\plugins\quick-reminder
```

Copy `main.js`, `manifest.json`, `styles.css` into that path. Disable + re-enable the plugin.

- [ ] **Step 3:** Test scenarios:

**Scenario A: Note with existing `## Tasks` section.**
1. Open a note that already has `## Tasks → ### To Do`.
2. Open dashboard from sidebar, switch to Current file scope.
3. Click New task. Type "Test task A". Submit.
4. Expect: row appears in dashboard with green fade. Note's source shows `- [ ] Test task A` appended under `### To Do`.

**Scenario B: Note without `## Tasks` section.**
1. Open a fresh markdown note with just text.
2. Same flow as A.
3. Expect: `## Tasks → ### In Progress, ### To Do, ### Completed` block created at end of note. New task under `### To Do`.

**Scenario C: Whole vault scope (button disabled).**
1. Switch dashboard to Whole vault scope.
2. Hover New task button. Expect: tooltip "Switch to Current file scope to add a task". Button visually disabled.

**Scenario D: File-write rejection.**
1. Make the active note read-only at OS level.
2. Click New task, submit.
3. Expect: modal stays open. Error message visible inside modal. Retry button works after un-locking the file.

**Scenario E: Editor with unsaved buffer.**
1. Open active note in editor. Type a few characters but DO NOT save.
2. From dashboard, click New task. Submit.
3. Expect: both your unsaved buffer changes AND the new task land in the file (vault.process atomicity).

- [ ] **Step 4:** No commit — this task is verification only.

---

### Task 8: Version bump + CHANGELOG + README

**Files:** `manifest.json`, `package.json`, `CHANGELOG.md`, `README.md`

- [ ] **Step 1:** Bump patch version (same Node oneliner from Phase 0 Task 15).

- [ ] **Step 2:** Add CHANGELOG entry:

```markdown
## v0.1.x — Phase 1: New task from dashboard

- Added "New task" button to dashboard toolbar in Current file scope.
- Modal with text input, status dropdown (To Do / In Progress / Completed), inline error surface, Esc/Enter handling.
- Tasks append under `## Tasks → ### <Status>`. Section auto-created when absent using configured headings.
- All writes route through `vault.process` (atomic against open editor buffers).
- New row briefly highlights and scrolls into view on creation.
```

- [ ] **Step 3:** Add README section:

```markdown
### Adding tasks from the dashboard

When the dashboard is in **Current file** scope, click **New task** in the toolbar. Type the task text, choose a status (default: To Do), and submit. The task is appended to the current note's `## Tasks → ### <Status>` section. If the section is absent, Quick Reminder creates it using your configured task section headings (Settings → Metadata).

In **Current folder** or **Whole vault** scope, the New task button is disabled — switch to Current file scope to author tasks. Multi-target picking is on the roadmap for a later phase.
```

- [ ] **Step 4:** Build + test + manual reload one more time. Confirm green.

- [ ] **Step 5:** Commit:

```bash
git add manifest.json package.json CHANGELOG.md README.md
git commit -m "chore: bump to v0.1.x for Phase 1 new-task workflow"
```

---

## Phase 1 verification checklist

- [ ] `npm run build` clean.
- [ ] `npm test` ≥25 tests pass (added: 13 sections + appendTaskToFile tests).
- [ ] Manual A: append to existing `## Tasks → ### To Do` works.
- [ ] Manual B: section auto-creates when absent.
- [ ] Manual C: button disabled in non-Current-file scopes with tooltip.
- [ ] Manual D: file-write rejection surfaces inline error in modal.
- [ ] Manual E: vault.process atomicity preserves editor unsaved buffer.
- [ ] New row highlights green for ~1.5s and scrolls into view.
- [ ] Focus lands on first action button of new row after render.

## Success criteria

Phase 1 ships the highest-visible-value next step on top of Phase 0:
- Users can author tasks without leaving the dashboard.
- All writes are safe (vault.process atomic) — no editor-buffer regressions.
- Section creation is idempotent — re-clicking after a `## Tasks` block exists doesn't duplicate it.
- Error UX surfaces failures inline rather than swallowing them.
- Foundation set for later phases (4 status-move, 11 bulk add) to reuse `appendTaskToFile` and `appendTaskUnderHeading`.
