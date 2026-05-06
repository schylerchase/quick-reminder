# Phase 2 — Better Empty States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Prerequisites:** Phase 1 (`appendTaskToFile` exists, `New task` toolbar button wired, `sections.ts` available).

**Goal:** Replace generic "No tasks" empty states with context-aware text and actionable CTAs.

**Architecture:** Pure helper `getEmptyStateContext(scope, filePath, folderPath, ignoredCount, scannedNotes, totalTasks): EmptyStateContext` returns text + CTA descriptors. View renders via existing `.qr-view-empty` and `.qr-row-btn` / `.qr-view-secondary-btn` classes — no new layout primitives. Stacks vertically below 320px container width.

**Files touchpoint summary:**
- Create: `src/emptyStates.ts`, `tests/emptyStates.test.ts`.
- Modify: `src/view.ts:442` (`renderScrapedSection`), `src/view.ts:1334` (`getEmptyScrapedText` removed/refactored), `styles.css`.

---

### Task 1: emptyStates module

**Files:** Create `src/emptyStates.ts`, `tests/emptyStates.test.ts`.

- [ ] **Step 1:** Failing test:

```typescript
import { describe, it, expect } from "vitest";
import { getEmptyStateContext } from "../src/emptyStates";

describe("getEmptyStateContext", () => {
  it("active file empty", () => {
    const ctx = getEmptyStateContext({
      scope: "active",
      filePath: "Projects/Foo/Notes.md",
      folderPath: null,
      ignoredCount: 0,
      scannedNotes: 1,
      totalUnignored: 0,
      filtersActive: false,
    });
    expect(ctx.message).toContain("Notes.md");
    expect(ctx.actions).toEqual([
      { id: "new-task", label: "New task", primary: true },
      { id: "insert-sections", label: "Insert task sections", primary: false },
    ]);
  });

  it("vault empty shows scan stats", () => {
    const ctx = getEmptyStateContext({
      scope: "vault",
      filePath: null,
      folderPath: null,
      ignoredCount: 3,
      scannedNotes: 42,
      totalUnignored: 0,
      filtersActive: false,
    });
    expect(ctx.message).toContain("42");
    expect(ctx.message).toContain("3 ignored");
    expect(ctx.actions).toEqual([{ id: "open-settings", label: "Open settings", primary: false }]);
  });

  it("filters active shows clear-filters", () => {
    const ctx = getEmptyStateContext({
      scope: "vault",
      filePath: null,
      folderPath: null,
      ignoredCount: 0,
      scannedNotes: 10,
      totalUnignored: 50,
      filtersActive: true,
    });
    expect(ctx.message).toContain("hidden by filters");
    expect(ctx.actions).toEqual([{ id: "clear-filters", label: "Clear filters", primary: true }]);
  });
});
```

- [ ] **Step 2:** Run, FAIL.

- [ ] **Step 3:** Implement `src/emptyStates.ts`:

```typescript
export type EmptyAction =
  | { id: "new-task"; label: "New task"; primary: boolean }
  | { id: "insert-sections"; label: "Insert task sections"; primary: boolean }
  | { id: "open-settings"; label: "Open settings"; primary: boolean }
  | { id: "clear-filters"; label: "Clear filters"; primary: boolean };

export interface EmptyStateContext {
  message: string;
  actions: EmptyAction[];
}

export interface EmptyStateInput {
  scope: "active" | "folder" | "vault";
  filePath: string | null;
  folderPath: string | null;
  ignoredCount: number;
  scannedNotes: number;
  totalUnignored: number;
  filtersActive: boolean;
}

export function getEmptyStateContext(input: EmptyStateInput): EmptyStateContext {
  if (input.filtersActive && input.totalUnignored > 0) {
    return {
      message: `${input.totalUnignored} task(s) hidden by filters.`,
      actions: [{ id: "clear-filters", label: "Clear filters", primary: true }],
    };
  }
  if (input.scope === "active") {
    const filename = input.filePath?.split("/").pop() ?? "this note";
    return {
      message: `${filename} has no tasks.`,
      actions: [
        { id: "new-task", label: "New task", primary: true },
        { id: "insert-sections", label: "Insert task sections", primary: false },
      ],
    };
  }
  if (input.scope === "folder") {
    const folder = input.folderPath ?? "this folder";
    return {
      message: `No tasks in ${folder}. Scanned ${input.scannedNotes} note(s).`,
      actions: [],
    };
  }
  const ignoredFragment = input.ignoredCount > 0 ? ` (${input.ignoredCount} ignored)` : "";
  return {
    message: `Scanned ${input.scannedNotes} note(s), found 0 tasks${ignoredFragment}.`,
    actions: [{ id: "open-settings", label: "Open settings", primary: false }],
  };
}
```

- [ ] **Step 4:** Run, PASS.

- [ ] **Step 5:** Commit:

```bash
git add src/emptyStates.ts tests/emptyStates.test.ts
git commit -m "feat: add emptyStates module with context-aware messaging"
```

---

### Task 2: Wire empty states into renderScrapedSection

**Files:** Modify `src/view.ts`.

- [ ] **Step 1:** Replace the empty branch in `renderScrapedSection` (`view.ts:455-460`):

```typescript
if (tasks.length === 0) {
  this.renderEmptyState(section, totalCount);
  return;
}
```

Add `renderEmptyState`:

```typescript
private renderEmptyState(parent: HTMLElement, totalCount: number): void {
  const ctx = getEmptyStateContext({
    scope: this.taskScope,
    filePath: this.lastMarkdownPath,
    folderPath: this.getScopedFolderPath(),
    ignoredCount: this.store.ignoredTaskIds.size,
    scannedNotes: this.scrapedTasks.length === 0 ? this.app.vault.getMarkdownFiles().length : -1,
    totalUnignored: totalCount,
    filtersActive: this.taskSearch.length > 0 || this.sourceFilter !== "all",
  });
  const wrap = parent.createDiv({ cls: "qr-view-empty qr-empty-state" });
  wrap.createDiv({ text: ctx.message, cls: "qr-empty-message" });
  if (ctx.actions.length > 0) {
    const actions = wrap.createDiv({ cls: "qr-empty-actions" });
    for (const a of ctx.actions) {
      const btn = actions.createEl("button", {
        text: a.label,
        cls: a.primary ? "qr-row-btn mod-cta" : "qr-view-secondary-btn",
      });
      btn.onclick = () => this.handleEmptyAction(a.id);
    }
  }
}

private handleEmptyAction(id: EmptyAction["id"]): void {
  if (id === "new-task" && this.lastMarkdownPath) {
    this.openNewTaskModal(this.lastMarkdownPath);
    return;
  }
  if (id === "insert-sections") {
    const file = this.app.workspace.getActiveFile();
    if (file && file.extension === "md") {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view) insertTaskSections(view.editor, this.store.settings.taskSectionHeadings);
    }
    return;
  }
  if (id === "open-settings") {
    (this.app as { setting?: { open?: () => void } }).setting?.open?.();
    return;
  }
  if (id === "clear-filters") {
    this.taskSearch = "";
    this.sourceFilter = "all";
    void this.render();
  }
}
```

Add imports: `MarkdownView`, `EmptyAction`, `getEmptyStateContext`, `insertTaskSections`. Note `insertTaskSections` lives in `main.ts` today — re-export it via `sections.ts` if not already.

- [ ] **Step 2:** Build clean.

- [ ] **Step 3:** Commit:

```bash
git add src/view.ts
git commit -m "feat: wire context-aware empty states into dashboard"
```

---

### Task 3: Stacked layout below 320px

**Files:** Modify `styles.css`.

- [ ] **Step 1:** Add CSS:

```css
.qr-empty-state { padding: 1em 0.5em; text-align: left; }
.qr-empty-message { font-size: 0.95em; color: var(--text-muted); margin-bottom: 0.75em; }
.qr-empty-actions { display: flex; gap: 0.5em; flex-wrap: wrap; }
@container (max-width: 320px) {
  .qr-empty-actions { flex-direction: column; align-items: stretch; }
}
```

If container queries are not yet supported reliably, fall back to a width media query on `.qr-view` ancestor — or check `containerEl.offsetWidth` at render time.

- [ ] **Step 2:** Manual: load plugin, narrow sidebar to <320px, confirm vertical stacking.

- [ ] **Step 3:** Commit:

```bash
git add styles.css
git commit -m "style: stack empty-state actions vertically on narrow widths"
```

---

### Task 4: Version bump + CHANGELOG + README

- [ ] **Step 1:** Bump patch.
- [ ] **Step 2:** CHANGELOG: "Phase 2: context-aware empty states with primary CTAs."
- [ ] **Step 3:** README: short paragraph noting empty-state CTAs.
- [ ] **Step 4:** Commit `chore: bump to v0.1.x for Phase 2 empty states`.

## Verification

- [ ] Manual: empty active file → message names file, primary `New task` works.
- [ ] Manual: empty vault scan → scan-stats message + Open settings.
- [ ] Manual: search query matching nothing → `Clear filters`.
- [ ] Narrow width → stacked CTAs.
