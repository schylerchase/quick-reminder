# Phase 4 — Status-Move Under Heading Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Prerequisites:** Phase 0 (`verifyAndWrite`, settings tabs), Phase 1 (`sections.ts`).

**Goal:** New feature — when a task's checkbox status changes via dashboard, also move the task line to the bottom of the matching `### To Do` / `### In Progress` / `### Completed` sub-heading inside the same `## Tasks` block. Default ON for new installs. Existing installs see a one-time migration prompt.

**Architecture:** New pure helper `moveTaskUnderHeading(content, fromLine, targetHeading)` returns new content + new line index, OR null if target heading missing. `setCheckboxStatus` branches on `moveTaskOnStatusChange` setting AFTER the marker update but BEFORE writing through `vault.process`. After move, force synchronous rescan and gate UI input on rows from same file until rescan completes. Migration prompt fires once on `onLayoutReady` if setting is missing from saved data.

**Files touchpoint summary:**
- Modify: `src/types.ts` (settings + status heading map), `src/sections.ts` (add `moveTaskUnderHeading`), `src/taskScanner.ts` (branch on setting in `setCheckboxStatus`), `src/main.ts` (settings UI + migration prompt), `src/view.ts` (gate UI during rescan), `tests/sections.test.ts`.

---

### Task 1: moveTaskUnderHeading

**Files:** Modify `src/sections.ts`, `tests/sections.test.ts`.

- [ ] **Step 1:** Failing tests:

```typescript
import { moveTaskUnderHeading } from "../src/sections";

describe("moveTaskUnderHeading", () => {
  it("moves line to end of target sub-heading", () => {
    const content = [
      "## Tasks", "",
      "### To Do", "- [ ] One",
      "", "### Completed", "- [x] Old",
    ].join("\n");
    const result = moveTaskUnderHeading(content, 3, "Completed");
    expect(result).not.toBeNull();
    expect(result!.content).toContain("### Completed\n- [x] Old\n- [ ] One");
    expect(result!.newLine).toBeGreaterThan(3);
  });

  it("returns null when target heading absent", () => {
    const content = "## Tasks\n\n### To Do\n- [ ] x\n";
    expect(moveTaskUnderHeading(content, 3, "Completed")).toBeNull();
  });

  it("returns null when source line out of range", () => {
    expect(moveTaskUnderHeading("## Tasks\n", 99, "To Do")).toBeNull();
  });

  it("preserves CRLF", () => {
    const content = "## Tasks\r\n\r\n### To Do\r\n- [ ] One\r\n\r\n### Completed\r\n";
    const result = moveTaskUnderHeading(content, 3, "Completed");
    expect(result?.content).toContain("\r\n");
  });
});
```

- [ ] **Step 2:** Run, FAIL.

- [ ] **Step 3:** Implement in `src/sections.ts`:

```typescript
export interface MoveResult {
  content: string;
  newLine: number; // 1-based
}

export function moveTaskUnderHeading(
  content: string,
  fromLine: number, // 1-based
  targetHeading: string,
): MoveResult | null {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  const sourceIdx = fromLine - 1;
  if (sourceIdx < 0 || sourceIdx >= lines.length) return null;

  const target = targetHeading.trim().toLowerCase();
  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (i === sourceIdx) continue;
    const m = lines[i].match(/^\s{0,3}###\s+(.+?)\s*#*\s*$/);
    if (m && m[1].trim().toLowerCase() === target) {
      headingIdx = i;
      break;
    }
  }
  if (headingIdx === -1) return null;

  const sourceLine = lines[sourceIdx];
  // Remove from source position
  lines.splice(sourceIdx, 1);
  // Adjust headingIdx if it was after sourceIdx
  const adjusted = headingIdx > sourceIdx ? headingIdx - 1 : headingIdx;

  // Find boundary: next heading of equal-or-higher level (## or ###) or EOF
  let boundary = lines.length;
  for (let i = adjusted + 1; i < lines.length; i++) {
    const m = lines[i].match(/^\s{0,3}(#{1,6})\s+/);
    if (m && m[1].length <= 3) { boundary = i; break; }
  }
  // Skip trailing blank lines
  let insertAt = boundary;
  while (insertAt > adjusted + 1 && lines[insertAt - 1].trim() === "") insertAt--;

  lines.splice(insertAt, 0, sourceLine);
  return { content: lines.join(newline), newLine: insertAt + 1 };
}
```

- [ ] **Step 4:** Tests PASS.

- [ ] **Step 5:** Commit:

```bash
git add src/sections.ts tests/sections.test.ts
git commit -m "feat: add moveTaskUnderHeading with sub-heading boundary walk"
```

---

### Task 2: Settings additions

**Files:** Modify `src/types.ts`.

- [ ] **Step 1:** Add fields:

```typescript
export interface Settings {
  // ... existing fields
  moveTaskOnStatusChange: boolean;
  statusHeadingMap: { todo: string; "in-progress": string; completed: string };
}

export const DEFAULT_SETTINGS: Settings = {
  // ... existing
  moveTaskOnStatusChange: true,
  statusHeadingMap: { todo: "To Do", "in-progress": "In Progress", completed: "Completed" },
};
```

- [ ] **Step 2:** Build clean.

- [ ] **Step 3:** Commit:

```bash
git add src/types.ts
git commit -m "feat: add moveTaskOnStatusChange + statusHeadingMap settings"
```

---

### Task 3: Migration prompt on layout-ready

**Files:** Modify `src/main.ts`.

- [ ] **Step 1:** In `onload` after `await this.store.init()`, detect missing setting (= upgrading user) by saving the raw loaded data and comparing keys. Easiest path: add a sentinel `_migrated_phase4: boolean` field to PluginData; if absent on load, prompt; on confirmation set to true.

In `src/types.ts`:

```typescript
export interface PluginData {
  reminders: Reminder[];
  ignoredTaskIds: string[];
  ignoredTaskNotes?: Record<string, string>;
  settings: Settings;
  _migrated_phase4?: boolean;
}
```

In `src/main.ts` `onLayoutReady`:

```typescript
this.app.workspace.onLayoutReady(async () => {
  // ... existing notification/scheduler init
  await this.maybeShowMoveOnStatusMigration();
});

private async maybeShowMoveOnStatusMigration(): Promise<void> {
  const data = (await this.loadData()) as PluginData | null;
  if (!data || data._migrated_phase4) return;
  const isFreshInstall = !data.settings || Object.keys(data).length <= 1;
  if (isFreshInstall) {
    // Fresh install — default ON applies, just mark migrated
    await this.saveData({ ...(data ?? {}), _migrated_phase4: true } as PluginData);
    return;
  }
  // Existing user — prompt
  const modal = new MoveMigrationModal(this.app, async (enable) => {
    await this.store.updateSettings({ moveTaskOnStatusChange: enable });
    await this.saveData({ ...(data ?? {}), _migrated_phase4: true } as PluginData);
  });
  modal.open();
}
```

Create `src/moveMigrationModal.ts`:

```typescript
import { App, Modal } from "obsidian";

export class MoveMigrationModal extends Modal {
  constructor(app: App, private onChoose: (enable: boolean) => Promise<void>) { super(app); }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Quick Reminder — new behavior" });
    contentEl.createEl("p", { text: "Quick Reminder can now move tasks to your Completed / In Progress / To Do sections when you check them. This is a new behavior. Enable?" });
    const row = contentEl.createDiv();
    row.style.display = "flex"; row.style.gap = "0.5em"; row.style.marginTop = "1em";
    const enable = row.createEl("button", { text: "Enable", cls: "mod-cta" });
    enable.onclick = async () => { await this.onChoose(true); this.close(); };
    const keep = row.createEl("button", { text: "Keep current behavior" });
    keep.onclick = async () => { await this.onChoose(false); this.close(); };
  }

  onClose(): void { this.contentEl.empty(); }
}
```

- [ ] **Step 2:** Build clean.

- [ ] **Step 3:** Commit:

```bash
git add src/main.ts src/types.ts src/moveMigrationModal.ts
git commit -m "feat: migration prompt for move-on-status default"
```

---

### Task 4: Wire setCheckboxStatus to move on status change

**Files:** Modify `src/taskScanner.ts`.

- [ ] **Step 1:** TaskScanner needs settings access. Pass the move flag and heading map from the caller. Update signature:

```typescript
async setCheckboxStatus(
  task: ScrapedTask,
  status: CheckboxStatus,
  options: { moveOnChange: boolean; headingMap: { todo: string; "in-progress": string; completed: string } } = { moveOnChange: false, headingMap: { todo: "To Do", "in-progress": "In Progress", completed: "Completed" } },
): Promise<"ok" | "stale" | "error">
```

Implementation:

```typescript
async setCheckboxStatus(task, status, options = {...}): Promise<"ok" | "stale" | "error"> {
  if (task.kind !== "checkbox") return "error";
  return this.verifyAndWrite(task, (line) => {
    if (!CHECKBOX_TASK_RE.test(line)) return null;
    const updated = line.replace(/\[[^\]]\]/, `[${getCheckboxStatusMarker(status)}]`);
    return updated; // Move happens at file level below — handled outside verifyAndWrite for atomic combined write
  }).then(async (result) => {
    if (result !== "ok" || !options.moveOnChange) return result;
    // Now perform the move in a second vault.process call
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) return "error";
    const targetHeading = options.headingMap[status];
    let moveResult: "ok" | "skipped" = "skipped";
    await this.app.vault.process(file, (data) => {
      const moved = moveTaskUnderHeading(data, task.line, targetHeading);
      if (!moved) return data;
      moveResult = "ok";
      return moved.content;
    });
    return moveResult === "ok" ? "ok" : "ok"; // Move skip is non-fatal — checkbox already updated
  });
}
```

Add `import { moveTaskUnderHeading } from "./sections";` at top.

NOTE: Two `vault.process` calls is acceptable here — the verify-then-mark step is the safety-critical part. If the move fails (heading missing), the checkbox change is already persisted. Show a one-shot notice.

- [ ] **Step 2:** Update view.ts caller (`updateTaskStatus`):

```typescript
const result = await this.taskScanner.setCheckboxStatus(task, status, {
  moveOnChange: this.store.settings.moveTaskOnStatusChange,
  headingMap: this.store.settings.statusHeadingMap,
});
```

After successful update (when move was attempted), force rescan of that file:

```typescript
if (this.store.settings.moveTaskOnStatusChange) {
  await this.refreshScrapedTasks(); // full rescan; later phases may scope per-file
}
```

- [ ] **Step 3:** Build clean.

- [ ] **Step 4:** Commit:

```bash
git add src/taskScanner.ts src/view.ts
git commit -m "feat: wire moveTaskOnStatusChange into setCheckboxStatus"
```

---

### Task 5: Settings UI in Safety tab

**Files:** Modify `src/main.ts`.

- [ ] **Step 1:** In `renderSafetyTab(parent)` add toggle + heading map editor:

```typescript
new Setting(parent)
  .setName("Move tasks on status change")
  .setDesc("When you check a task done in the dashboard, also move the line under your Completed / In Progress / To Do sub-heading.")
  .addToggle((t) => t.setValue(this.plugin.store.settings.moveTaskOnStatusChange).onChange(async (v) => {
    await this.plugin.store.updateSettings({ moveTaskOnStatusChange: v });
  }));

new Setting(parent)
  .setName("Status heading names")
  .setDesc("Sub-heading names used by move-on-status. Order: To Do, In Progress, Completed.")
  .addTextArea((t) => {
    const m = this.plugin.store.settings.statusHeadingMap;
    t.setValue(`${m.todo}\n${m["in-progress"]}\n${m.completed}`).onChange(async (v) => {
      const [todo, inProgress, completed] = v.split(/\r?\n/).map((s) => s.trim());
      if (todo && inProgress && completed) {
        await this.plugin.store.updateSettings({ statusHeadingMap: { todo, "in-progress": inProgress, completed } });
      }
    });
  });
```

- [ ] **Step 2:** Build clean.

- [ ] **Step 3:** Commit:

```bash
git add src/main.ts
git commit -m "feat: settings UI for move-on-status and heading map"
```

---

### Task 6: Manual integration

- [ ] **Step 1:** Reload plugin in test vault (clean install path or simulate fresh by deleting plugin data).
- [ ] **Step 2:** Confirm fresh install: move ON by default, no prompt.
- [ ] **Step 3:** Simulate upgrade by manually adding plugin data with `_migrated_phase4: undefined`. Reload. Expect modal.
- [ ] **Step 4:** Click each option, confirm setting persists and modal does not reappear on reload.
- [ ] **Step 5:** Test move: check task in dashboard with move ON. Source file shows line moved to `### Completed`.
- [ ] **Step 6:** Test heading-missing fallback: rename `### Completed` to `### Done` in note. Check task — checkbox flips, no move, no error.

---

### Task 7: Version bump + CHANGELOG + README

- [ ] **Step 1:** Bump patch.
- [ ] **Step 2:** CHANGELOG: "Phase 4: optional move-on-status (default ON for new installs, migration prompt for upgrades)."
- [ ] **Step 3:** README: section explaining behavior + setting.
- [ ] **Step 4:** Commit `chore: bump to v0.1.x for Phase 4 status-move`.

## Verification

- [ ] Tests: ≥4 moveTaskUnderHeading.
- [ ] Manual: fresh install default ON, no prompt.
- [ ] Manual: upgrade install shows prompt once.
- [ ] Manual: move applies on toggle done.
- [ ] Manual: missing target heading → checkbox flips, no move.
