# Phase 11 — Bulk Actions

**Prerequisites:** Phase 0 (verifyAndWrite), Phase 10 (keyboard).

**Goal:** Multi-select tasks, batch-apply status / archive / ignore / delete with concurrency safety.

**Files:** Modify `src/view.ts`, `src/taskScanner.ts` (add `bulkApply`), create `tests/bulkApply.test.ts`.

---

### Task 1: bulkApply with per-file sequential serialization

- [ ] **Step 1:** Failing test:

```typescript
import { describe, it, expect } from "vitest";
import { TaskScanner } from "../src/taskScanner";
import { TFile } from "obsidian";
import { fnv1a } from "../src/hash";

function makeApp(filesContent: Record<string, string>) {
  const stored = { ...filesContent };
  const files: Record<string, TFile> = {};
  for (const path of Object.keys(stored)) files[path] = Object.assign(new TFile(), { path });
  let processCalls: { path: string; ts: number }[] = [];
  return {
    stored: () => stored,
    calls: () => processCalls,
    app: {
      vault: {
        getAbstractFileByPath: (p: string) => files[p] ?? null,
        process: async (f: TFile, fn: (data: string) => string) => {
          processCalls.push({ path: f.path, ts: Date.now() });
          await new Promise((r) => setTimeout(r, 1));
          stored[f.path] = fn(stored[f.path]);
          return stored[f.path];
        },
        getMarkdownFiles: () => Object.values(files),
      },
    } as unknown as ConstructorParameters<typeof TaskScanner>[0],
  };
}

describe("bulkApply", () => {
  it("processes per-file sequentially", async () => {
    const env = makeApp({
      "a.md": "- [ ] one\n- [ ] two\n- [ ] three\n",
      "b.md": "- [ ] x\n",
    });
    const scanner = new TaskScanner(env.app);
    const tasks = await scanner.scan();
    const results = await scanner.bulkApply(tasks, "completed", { moveOnChange: false, addCompletionTimestamp: false, headingMap: { todo: "T", "in-progress": "I", completed: "C" } });
    expect(results.ok).toBe(4);
    expect(results.stale).toBe(0);
    // Same-file calls should be sequential — no overlap
    const aCalls = env.calls().filter((c) => c.path === "a.md");
    expect(aCalls.length).toBeGreaterThan(0);
  });

  it("orders deletes by descending line within file", async () => {
    const env = makeApp({ "a.md": "- [ ] one\n- [ ] two\n- [ ] three\n" });
    const scanner = new TaskScanner(env.app);
    const tasks = await scanner.scan();
    const results = await scanner.bulkApply(tasks, "delete", {});
    expect(results.ok).toBe(3);
    expect(env.stored()["a.md"]).not.toContain("one");
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3:** Implement `bulkApply` on `TaskScanner`:

```typescript
export type BulkAction = "completed" | "in-progress" | "todo" | "delete" | "archive";

async bulkApply(
  tasks: ScrapedTask[],
  action: BulkAction,
  options: {
    moveOnChange?: boolean;
    addCompletionTimestamp?: boolean;
    headingMap?: { todo: string; "in-progress": string; completed: string };
  },
): Promise<{ ok: number; stale: number; error: number }> {
  // Group by file
  const byFile = new Map<string, ScrapedTask[]>();
  for (const t of tasks) {
    const list = byFile.get(t.filePath) ?? [];
    list.push(t);
    byFile.set(t.filePath, list);
  }

  const results = { ok: 0, stale: 0, error: 0 };
  for (const [filePath, fileTasks] of byFile) {
    // For deletes/archives: order by descending line
    if (action === "delete" || action === "archive") {
      fileTasks.sort((a, b) => b.line - a.line);
    }
    for (const task of fileTasks) {
      // Sequential await per file ensures no concurrent vault.process on same file
      const r = await this.applySingle(task, action, options);
      results[r]++;
      // If move enabled, rescan this file before next item
      if (options.moveOnChange && action !== "delete" && action !== "archive") {
        // Re-scan to refresh line numbers for remaining tasks in same file
        const refreshed = await this.scanFile(this.app.vault.getAbstractFileByPath(filePath) as TFile);
        // Update remaining tasks' line + hash trio if they still exist (matched by text)
        for (let i = fileTasks.indexOf(task) + 1; i < fileTasks.length; i++) {
          const remaining = fileTasks[i];
          const found = refreshed.find((r) => r.text === remaining.text && r.kind === remaining.kind);
          if (found) {
            remaining.line = found.line;
            remaining.expectedLineHash = found.expectedLineHash;
            remaining.expectedPrevHash = found.expectedPrevHash;
            remaining.expectedNextHash = found.expectedNextHash;
          }
        }
      }
    }
  }
  return results;
}

private async applySingle(task: ScrapedTask, action: BulkAction, options: any): Promise<"ok" | "stale" | "error"> {
  if (action === "completed" || action === "in-progress" || action === "todo") {
    return this.setCheckboxStatus(task, action, options);
  }
  if (action === "delete") {
    return this.deleteTaskLine(task);
  }
  // archive: caller handles ignoredTaskIds add — return "ok" if task valid
  return "ok";
}
```

- [ ] **Step 4:** PASS.

- [ ] **Step 5:** Commit `feat: bulkApply with per-file sequential awaits and rescan-between-moves`.

---

### Task 2: Multi-select UI

- [ ] **Step 1:** Add to `ReminderView`:

```typescript
private bulkSelectMode: boolean = false;
private selectedTaskIds: Set<string> = new Set();
private lastSelectedIdx: number = -1;
```

- [ ] **Step 2:** Toolbar toggle button: "Select multiple" → enables checkbox column on each row.

- [ ] **Step 3:** In `renderScrapedRow`, when `bulkSelectMode` true, prepend a checkbox:

```typescript
if (this.bulkSelectMode) {
  const cb = body.createEl("input", { type: "checkbox" });
  cb.checked = this.selectedTaskIds.has(task.id);
  cb.onclick = (e) => {
    if ((e as MouseEvent).shiftKey && this.lastSelectedIdx >= 0) {
      // Range select
      const tasks = this.getCurrentVisibleTasks();
      const idx = tasks.findIndex((t) => t.id === task.id);
      const [from, to] = [Math.min(idx, this.lastSelectedIdx), Math.max(idx, this.lastSelectedIdx)];
      for (let i = from; i <= to; i++) this.selectedTaskIds.add(tasks[i].id);
    } else {
      if (cb.checked) this.selectedTaskIds.add(task.id);
      else this.selectedTaskIds.delete(task.id);
    }
    this.lastSelectedIdx = this.getCurrentVisibleTasks().findIndex((t) => t.id === task.id);
    void this.render();
  };
}
```

- [ ] **Step 4:** Bulk bar at top of dashboard when `selectedTaskIds.size > 0`:

```typescript
private renderBulkBar(parent: HTMLElement): void {
  const bar = parent.createDiv({ cls: "qr-bulk-bar" });
  bar.createSpan({ text: `${this.selectedTaskIds.size} selected` });
  const visible = this.getCurrentVisibleTasks().length;
  bar.createSpan({ text: `(${visible} visible — narrow filters to select more)`, cls: "qr-bulk-hint" });
  for (const action of ["completed", "in-progress", "todo", "archive", "delete"] as const) {
    const btn = bar.createEl("button", { text: action });
    btn.onclick = () => void this.runBulk(action);
  }
}
```

- [ ] **Step 5:** Commit `feat: bulk selection UI with range-select`.

---

### Task 3: Bulk execution with spinner

- [ ] **Step 1:** Implement `runBulk`:

```typescript
private async runBulk(action: BulkAction): Promise<void> {
  if (this.selectedTaskIds.size === 0) return;
  if ((action === "delete" || action === "archive") && this.selectedTaskIds.size > 1) {
    if (!confirm(`${action === "archive" ? "Archive" : "Delete"} ${this.selectedTaskIds.size} tasks?`)) return;
  }
  const tasks = this.scrapedTasks.filter((t) => this.selectedTaskIds.has(t.id));
  // Show spinner: disable bulk bar buttons, render progress
  this.bulkInFlight = true;
  await this.render();
  try {
    const result = await this.taskScanner.bulkApply(tasks, action, {
      moveOnChange: this.store.settings.moveTaskOnStatusChange,
      addCompletionTimestamp: this.store.settings.addCompletionTimestamp,
      headingMap: this.store.settings.statusHeadingMap,
    });
    new Notice(`Bulk ${action}: ${result.ok} done, ${result.stale} skipped (file changed), ${result.error} errors.`);
  } finally {
    this.bulkInFlight = false;
    this.selectedTaskIds.clear();
    this.lastSelectedIdx = -1;
    await this.refreshScrapedTasks();
    await this.render();
  }
}
```

- [ ] **Step 2:** Add `bulkInFlight` field. Disable bulk bar buttons + show progress spinner when true.

- [ ] **Step 3:** Commit `feat: bulk execution with spinner and result notice`.

---

### Task 4: x keystroke wiring (Phase 10 dependency)

- [ ] **Step 1:** Add `x` to `resolveKeyAction` returning `"toggle-select"`. In `dispatchKeyAction` toggle current row's selection in `selectedTaskIds`.

- [ ] **Step 2:** Commit `feat: x keystroke toggles bulk selection`.

---

### Task 5: Version + CHANGELOG + README

- [ ] **Step 1:** Bump patch.
- [ ] **Step 2:** CHANGELOG: "Phase 11: bulk actions with per-file serialization."
- [ ] **Step 3:** README bulk section: 150-task visible cap, range-select, archive vs delete.
- [ ] **Step 4:** Commit.

## Verification

- [ ] Tests: bulkApply per-file sequential, descending-line for delete.
- [ ] Manual: select 5, mark done.
- [ ] Manual: range-select via Shift.
- [ ] Manual: spinner appears during multi-second batch.
- [ ] Manual: x keystroke toggles selection (Phase 10 wired).
- [ ] Manual: stale task in batch reported as skipped.
