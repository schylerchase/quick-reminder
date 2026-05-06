# Phase 3 — Inline Task Editing Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Prerequisites:** Phase 0 (`inlineFields.ts`, `verifyAndWrite`).

**Goal:** Click a task row's text → inline-edit the body, preserving leading whitespace, list marker, checkbox, AND inline metadata suffix (Dataview `[key:: value]` AND Tasks-plugin emojis 📅 ⏳ 🔁 ➕ ✅).

**Architecture:** New `splitTaskLine(line) → { prefix, body, suffix }` returns the editable middle plus the unchanging prefix (whitespace + list marker + checkbox + leading space) and metadata suffix. View swaps row text with `<input>` containing only `body`. On save, recompose `prefix + newBody + suffix` and route through `verifyAndWrite`. Esc reverts silently. Phase 10's keyboard handler must skip row navigation while `editingId !== null`.

**Files touchpoint summary:**
- Create: `src/taskLineSplitter.ts`, `tests/taskLineSplitter.test.ts`.
- Modify: `src/taskScanner.ts` (add `replaceTaskBody(task, newBody)`), `src/view.ts:520` (`renderScrapedRow`), `styles.css`.

---

### Task 1: taskLineSplitter

**Files:** Create `src/taskLineSplitter.ts`, `tests/taskLineSplitter.test.ts`.

- [ ] **Step 1:** Failing tests:

```typescript
import { describe, it, expect } from "vitest";
import { splitTaskLine, recomposeTaskLine } from "../src/taskLineSplitter";

describe("splitTaskLine", () => {
  it("splits simple checkbox", () => {
    expect(splitTaskLine("- [ ] Buy milk")).toEqual({
      prefix: "- [ ] ", body: "Buy milk", suffix: "",
    });
  });

  it("preserves leading whitespace and list marker variation", () => {
    expect(splitTaskLine("  * [/] Working")).toEqual({
      prefix: "  * [/] ", body: "Working", suffix: "",
    });
  });

  it("separates dataview metadata suffix", () => {
    expect(splitTaskLine("- [ ] Buy milk [priority:: high] [due:: 2026-05-10]")).toEqual({
      prefix: "- [ ] ",
      body: "Buy milk",
      suffix: " [priority:: high] [due:: 2026-05-10]",
    });
  });

  it("separates tasks-plugin emoji suffix", () => {
    const result = splitTaskLine("- [ ] Review PR 📅 2026-05-10 🔁 every week");
    expect(result.body).toBe("Review PR");
    expect(result.suffix).toContain("📅");
    expect(result.suffix).toContain("🔁");
  });

  it("returns null for non-task line", () => {
    expect(splitTaskLine("Just a sentence")).toBeNull();
  });

  it("recompose round-trips", () => {
    const line = "  - [/] Work [priority:: high] 📅 2026-05-10";
    const split = splitTaskLine(line)!;
    expect(recomposeTaskLine(split.prefix, split.body, split.suffix)).toBe(line);
  });

  it("recompose handles new body", () => {
    const split = splitTaskLine("- [ ] Old [due:: 2026-05-10]")!;
    expect(recomposeTaskLine(split.prefix, "New body", split.suffix))
      .toBe("- [ ] New body [due:: 2026-05-10]");
  });
});
```

- [ ] **Step 2:** Run, FAIL.

- [ ] **Step 3:** Implement `src/taskLineSplitter.ts`:

```typescript
const PREFIX_RE = /^(\s*[-*+]\s+\[[^\]]\]\s+)/;
const DATAVIEW_FIELD_RE = /\s\[[a-z][a-z0-9_-]*::[^\]]*\]/i;
const TASKS_EMOJI_RE = /\s[📅⏳🔁➕✅🛫⏫🔼🔽⏬]\s*\d{4}-\d{2}-\d{2}/u;
const TASKS_RECURRENCE_RE = /\s🔁\s+(?:every\s+)?\w+/u;

export interface TaskLineParts {
  prefix: string;
  body: string;
  suffix: string;
}

export function splitTaskLine(line: string): TaskLineParts | null {
  const prefixMatch = line.match(PREFIX_RE);
  if (!prefixMatch) return null;
  const prefix = prefixMatch[1];
  let rest = line.slice(prefix.length);

  // Walk from the right, peeling off recognized metadata tokens.
  const suffixParts: string[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of [DATAVIEW_FIELD_RE, TASKS_EMOJI_RE, TASKS_RECURRENCE_RE]) {
      const m = rest.match(new RegExp(re.source + "$", re.flags));
      if (m) {
        suffixParts.unshift(m[0]);
        rest = rest.slice(0, rest.length - m[0].length);
        changed = true;
        break;
      }
    }
  }
  return { prefix, body: rest.trim(), suffix: suffixParts.join("") };
}

export function recomposeTaskLine(prefix: string, body: string, suffix: string): string {
  return `${prefix}${body}${suffix}`;
}
```

- [ ] **Step 4:** Run tests, PASS expected. Recurrence test may need refinement based on real Tasks-plugin output — adjust regex if any test fails on a known pattern.

- [ ] **Step 5:** Commit:

```bash
git add src/taskLineSplitter.ts tests/taskLineSplitter.test.ts
git commit -m "feat: add taskLineSplitter preserving prefix + metadata suffix"
```

---

### Task 2: replaceTaskBody on TaskScanner

**Files:** Modify `src/taskScanner.ts`. Tests in `tests/replaceTaskBody.test.ts`.

- [ ] **Step 1:** Failing test:

```typescript
import { describe, it, expect } from "vitest";
import { TaskScanner } from "../src/taskScanner";
import { TFile } from "obsidian";
import { fnv1a } from "../src/hash";
import type { ScrapedTask } from "../src/types";

function makeApp(content: string) {
  let stored = content;
  const file = Object.assign(new TFile(), { path: "n.md" });
  return {
    app: {
      vault: {
        getAbstractFileByPath: () => file,
        process: async (_f: TFile, fn: (d: string) => string) => { stored = fn(stored); return stored; },
        getMarkdownFiles: () => [file],
      },
    } as unknown as ConstructorParameters<typeof TaskScanner>[0],
    stored: () => stored,
  };
}

function fakeTask(lines: string[], idx: number): ScrapedTask {
  return {
    id: `n.md:${idx + 1}:checkbox`, text: "x", filePath: "n.md", line: idx + 1,
    kind: "checkbox", status: "todo", completed: false, category: "", project: "",
    expectedLineHash: fnv1a(lines[idx]),
    expectedPrevHash: fnv1a(lines[idx - 1] ?? ""),
    expectedNextHash: fnv1a(lines[idx + 1] ?? ""),
  };
}

describe("replaceTaskBody", () => {
  it("preserves prefix and dataview suffix", async () => {
    const lines = ["", "- [ ] Old body [priority:: high]", ""];
    const env = makeApp(lines.join("\n"));
    const scanner = new TaskScanner(env.app);
    const result = await scanner.replaceTaskBody(fakeTask(lines, 1), "New body");
    expect(result).toBe("ok");
    expect(env.stored()).toContain("- [ ] New body [priority:: high]");
  });

  it("preserves tasks-plugin emoji suffix", async () => {
    const lines = ["", "- [ ] Review PR 📅 2026-05-10", ""];
    const env = makeApp(lines.join("\n"));
    const scanner = new TaskScanner(env.app);
    await scanner.replaceTaskBody(fakeTask(lines, 1), "Review the PR");
    expect(env.stored()).toContain("- [ ] Review the PR 📅 2026-05-10");
  });

  it("returns 'stale' on hash mismatch", async () => {
    const lines = ["", "- [ ] Old", ""];
    const env = makeApp(lines.join("\n"));
    const scanner = new TaskScanner(env.app);
    const task = fakeTask(lines, 1);
    (env.app.vault as unknown as { process: (f: TFile, fn: (d: string) => string) => Promise<string> })
      .process = async (_f, fn) => fn(["", "- [ ] CHANGED", ""].join("\n"));
    expect(await scanner.replaceTaskBody(task, "x")).toBe("stale");
  });
});
```

- [ ] **Step 2:** Run, FAIL.

- [ ] **Step 3:** Implement on `TaskScanner`:

```typescript
import { splitTaskLine, recomposeTaskLine } from "./taskLineSplitter";

async replaceTaskBody(task: ScrapedTask, newBody: string): Promise<"ok" | "stale" | "error"> {
  if (task.kind !== "checkbox") return "error";
  return this.verifyAndWrite(task, (line) => {
    const parts = splitTaskLine(line);
    if (!parts) return null;
    return recomposeTaskLine(parts.prefix, newBody.trim(), parts.suffix);
  });
}
```

- [ ] **Step 4:** Tests PASS.

- [ ] **Step 5:** Commit:

```bash
git add src/taskScanner.ts tests/replaceTaskBody.test.ts
git commit -m "feat: add replaceTaskBody preserving prefix + metadata"
```

---

### Task 3: Inline-edit UI in renderScrapedRow

**Files:** Modify `src/view.ts:520`.

- [ ] **Step 1:** Replace the static `body.createDiv({ text: task.text, cls: "qr-view-row-text" })` block with an editable wrapper:

```typescript
const textEl = body.createDiv({ cls: "qr-view-row-text qr-view-row-text--editable" });
textEl.setText(task.text);
textEl.title = "Click to edit";
textEl.onclick = (e) => {
  e.stopPropagation();
  this.beginInlineEdit(task, textEl);
};
```

Add `beginInlineEdit` method:

```typescript
private beginInlineEdit(task: ScrapedTask, textEl: HTMLElement): void {
  if (this.editingId !== null) return;
  this.editingId = task.id;
  const original = task.text;
  textEl.empty();
  const input = textEl.createEl("input", { type: "text", cls: "qr-inline-edit-input" });
  input.value = original;
  input.style.width = "100%";
  input.focus();
  input.select();

  const finish = async (commit: boolean) => {
    if (this.editingId !== task.id) return;
    this.editingId = null;
    if (!commit) {
      textEl.empty();
      textEl.setText(original);
      return;
    }
    const newBody = input.value.trim();
    if (!newBody || newBody === original) {
      textEl.empty();
      textEl.setText(original);
      return;
    }
    const result = await this.taskScanner.replaceTaskBody(task, newBody);
    if (result === "stale") {
      await this.refreshScrapedTasks();
      await this.render();
      new Notice("Task changed since last scan, rescanning...");
      return;
    }
    if (result === "error") {
      new Notice("Could not update task — file not found.");
      textEl.empty();
      textEl.setText(original);
      return;
    }
    await this.refreshScrapedTasks();
    await this.render();
  };

  input.onblur = () => void finish(true);
  input.onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); void finish(true); }
    else if (e.key === "Escape") { e.preventDefault(); void finish(false); }
  };
}
```

- [ ] **Step 2:** Add CSS:

```css
.qr-view-row-text--editable { cursor: text; }
.qr-view-row-text--editable:hover { background: var(--background-modifier-hover); border-radius: 3px; }
.qr-inline-edit-input { background: var(--background-primary); border: 1px solid var(--interactive-accent); border-radius: 3px; padding: 2px 4px; font: inherit; }
```

- [ ] **Step 3:** Build clean. Manual: click task text → input appears, Enter saves, Esc reverts.

- [ ] **Step 4:** Commit:

```bash
git add src/view.ts styles.css
git commit -m "feat: inline edit task text via row click"
```

---

### Task 4: Multi-line input handling + keyboard suppression contract

**Files:** Modify `src/view.ts`.

- [ ] **Step 1:** Document keyboard contract — Phase 10 will check `this.editingId !== null` and skip row navigation. No code change here, but add this comment near the `editingId` field:

```typescript
// Phase 10 keyboard controller skips row-navigation keys while editingId !== null.
private editingId: string | null = null;
```

- [ ] **Step 2:** Multi-line guard: if `task.text` contains `\n` (rare paste accident), display as space-collapsed in input. Save preserves single-line shape:

In `beginInlineEdit` initial value: `input.value = original.replace(/\s*\n\s*/g, " ");`

- [ ] **Step 3:** Build clean.

- [ ] **Step 4:** Commit:

```bash
git add src/view.ts
git commit -m "fix: collapse newlines in inline edit input"
```

---

### Task 5: Tasks-plugin compatibility note

**Files:** Modify `README.md`.

- [ ] **Step 1:** Add to README under "Tasks integration":

```markdown
**Inline edit limitations:** Click-to-edit on task text changes only the body text. The original line's whitespace, list marker, checkbox, and metadata (Dataview `[key:: value]` fields, Tasks-plugin date emojis 📅 ⏳ 🔁) are preserved unchanged. Inline edit does NOT re-trigger the Tasks-plugin recurrence/auto-date logic. For full Tasks-plugin metadata edits, use the "Edit" button (modal flow).
```

- [ ] **Step 2:** Commit:

```bash
git add README.md
git commit -m "docs: document inline-edit Tasks-plugin compat note"
```

---

### Task 6: Version bump + CHANGELOG

- [ ] **Step 1:** Bump patch.
- [ ] **Step 2:** CHANGELOG entry: "Phase 3: inline edit, click row text to edit. Preserves prefix and metadata suffix. Esc reverts."
- [ ] **Step 3:** Commit `chore: bump to v0.1.x for Phase 3 inline edit`.

## Verification

- [ ] Tests: ≥7 splitTaskLine + ≥3 replaceTaskBody.
- [ ] Manual: edit task → save → file updated, prefix + suffix intact.
- [ ] Manual: Esc reverts.
- [ ] Manual: external edit during inline → rescan notice.
- [ ] Manual: Tasks-plugin tasks (with 📅) preserve emoji.
