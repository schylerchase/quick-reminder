# Phase 6 — Inline Metadata Refactor (Priority + Due Chips)

**Prerequisites:** Phase 0 (`inlineFields.ts`).

**Goal:** Refactor existing `getTaskPriorityRank` from `view.ts:1306` into `inlineFields.ts`. Add new due-date parsing via chrono-node. Render compact chips in task rows. **NOT new parsing logic for priority — it already exists.** Estimate 0.75 days, not 1.5.

**Files:** `src/inlineFields.ts` (extract `parsePriority`, add `parseDueDate`), `src/types.ts` (extend `ScrapedTask`), `src/taskScanner.ts` (populate fields), `src/view.ts:520` (render chips), `view.ts:1306+` (delete moved helpers), `styles.css`.

---

### Task 1: Extract parsePriority

- [ ] **Step 1:** Failing test:

```typescript
import { parsePriority } from "../src/inlineFields";

describe("parsePriority", () => {
  it("dataview high", () => expect(parsePriority("Task [priority:: high]")).toBe("high"));
  it("dataview low", () => expect(parsePriority("Task [priority:: low]")).toBe("low"));
  it("tag form", () => expect(parsePriority("Task #priority/high")).toBe("high"));
  it("bang prefix", () => expect(parsePriority("!! Important")).toBe("high"));
  it("p1", () => expect(parsePriority("p1: do this")).toBe("high"));
  it("p3", () => expect(parsePriority("p3: low priority")).toBe("low"));
  it("emoji 🔼", () => expect(parsePriority("Task 🔼")).toBe("med"));
  it("none", () => expect(parsePriority("Plain task")).toBeNull();
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3:** Copy `getTaskPriorityRank` body from `view.ts:1306` into `src/inlineFields.ts`, restructured to return `"high" | "med" | "low" | null` instead of a numeric rank:

```typescript
export type Priority = "high" | "med" | "low";

export function parsePriority(text: string): Priority | null {
  const t = text.toLowerCase();
  // Dataview field
  const field = getInlineField(text, "priority");
  if (field) {
    const v = field.toLowerCase().trim();
    if (["high", "h", "1", "p1"].includes(v)) return "high";
    if (["low", "l", "3", "p3"].includes(v)) return "low";
    if (["med", "medium", "m", "2", "p2"].includes(v)) return "med";
  }
  // Tag form
  if (/#priority\/high\b/i.test(text)) return "high";
  if (/#priority\/low\b/i.test(text)) return "low";
  if (/#priority\/(med|medium)\b/i.test(text)) return "med";
  // !! prefix
  if (/(^|\s)!!!?(\s|$)/.test(text)) return "high";
  // p1/p2/p3
  if (/(^|\s)p1\b/i.test(text)) return "high";
  if (/(^|\s)p3\b/i.test(text)) return "low";
  if (/(^|\s)p2\b/i.test(text)) return "med";
  // Emoji
  if (/[⏫]/u.test(text)) return "high";
  if (/[🔼]/u.test(text)) return "med";
  if (/[🔽⏬]/u.test(text)) return "low";
  return null;
}
```

- [ ] **Step 4:** PASS.

- [ ] **Step 5:** Commit `feat: extract parsePriority into inlineFields`.

---

### Task 2: parseDueDate

- [ ] **Step 1:** Failing tests:

```typescript
import { parseDueDate } from "../src/inlineFields";

describe("parseDueDate", () => {
  it("ISO date", () => {
    const r = parseDueDate("Task [due:: 2026-05-10]");
    expect(r.dueAt).not.toBeNull();
    expect(r.dueText).toBe("2026-05-10");
  });
  it("returns null when absent", () => {
    expect(parseDueDate("Plain task").dueAt).toBeNull();
  });
  it("natural language", () => {
    const r = parseDueDate("Task [due:: tomorrow]");
    expect(r.dueAt).not.toBeNull();
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3:** Implement in `src/inlineFields.ts`:

```typescript
import * as chrono from "chrono-node";

export function parseDueDate(text: string): { dueAt: number | null; dueText: string | null } {
  const field = getInlineField(text, "due");
  if (!field) return { dueAt: null, dueText: null };
  const parsed = chrono.parse(field, new Date(), { forwardDate: true });
  if (parsed.length === 0) return { dueAt: null, dueText: field };
  return { dueAt: parsed[0].start.date().getTime(), dueText: field };
}
```

- [ ] **Step 4:** PASS.

- [ ] **Step 5:** Commit `feat: add parseDueDate via chrono-node`.

---

### Task 3: Extend ScrapedTask + populate

- [ ] **Step 1:** `src/types.ts`:

```typescript
export interface ScrapedTask {
  // ... existing fields including hash trio
  priority?: "high" | "med" | "low";
  dueAt?: number;
  dueText?: string;
}
```

- [ ] **Step 2:** Update `parseCheckboxTask` in `taskScanner.ts`:

```typescript
import { parsePriority, parseDueDate } from "./inlineFields";
// inside parseCheckboxTask, after computing text:
const priority = parsePriority(parsed.text) ?? undefined;
const due = parseDueDate(parsed.text);
return {
  // ... existing fields,
  priority,
  dueAt: due.dueAt ?? undefined,
  dueText: due.dueText ?? undefined,
};
```

- [ ] **Step 3:** Build clean.

- [ ] **Step 4:** Commit `feat: populate priority + dueAt on ScrapedTask`.

---

### Task 4: Render chips in renderScrapedRow

- [ ] **Step 1:** In `src/view.ts:520`, after the existing `qr-task-badges` block:

```typescript
if (task.priority) {
  badges.createSpan({
    text: task.priority === "high" ? "!!" : task.priority === "med" ? "!" : "↓",
    cls: `qr-task-badge qr-task-badge--priority-${task.priority}`,
    attr: { title: `Priority: ${task.priority}` },
  });
}
if (task.dueAt) {
  const isOverdue = task.dueAt < Date.now();
  const isSoon = task.dueAt - Date.now() < 7 * 24 * 60 * 60 * 1000 && !isOverdue;
  const cls = isOverdue ? "qr-task-badge--due-overdue" : isSoon ? "qr-task-badge--due-soon" : "qr-task-badge--due";
  badges.createSpan({
    text: isOverdue ? "overdue" : new Date(task.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    cls: `qr-task-badge ${cls}`,
    attr: { title: task.dueText ?? "" },
  });
}
```

- [ ] **Step 2:** Add CSS reusing `.qr-task-badge` base:

```css
.qr-task-badge--priority-high { background: var(--color-red, #d33); color: white; }
.qr-task-badge--priority-med { background: var(--background-modifier-hover); }
.qr-task-badge--priority-low { color: var(--text-muted); }
.qr-task-badge--due-overdue { border: 1px solid var(--color-red, #d33); color: var(--color-red, #d33); background: transparent; }
.qr-task-badge--due-soon { background: var(--color-blue, #1e90ff); color: white; }
.qr-task-badge--due { color: var(--text-muted); }
```

Verify 4.5:1 contrast manually in light + dark themes.

- [ ] **Step 3:** Sidebar overflow: extend the badges container with `flex-wrap: wrap` (already in use) and add a max-2-chips behavior in narrow mode:

```typescript
// Inside renderScrapedRow, after appending priority and due chips:
const containerWidth = (parent as HTMLElement).offsetWidth;
if (containerWidth < 240 && badges.children.length > 2) {
  const overflow = badges.children.length - 2;
  for (let i = badges.children.length - 1; i >= 2; i--) {
    badges.removeChild(badges.children[i]);
  }
  badges.createSpan({ text: `+${overflow}`, cls: "qr-task-badge qr-task-badge--overflow" });
}
```

- [ ] **Step 4:** Build clean. Manual visual test with priority + due tasks.

- [ ] **Step 5:** Commit `feat: render priority and due chips with WCAG-friendly colors`.

---

### Task 5: Delete now-orphaned helpers from view.ts

- [ ] **Step 1:** Remove `getTaskPriorityRank`, `hasInlinePriority`, `hasPriorityEmoji` from `view.ts:1306-1333`. Update `sortScrapedTasks` priority branch to use the new `parsePriority` from inlineFields, mapping to numeric rank:

```typescript
import { parsePriority } from "./inlineFields";

private sortScrapedTasks(tasks: ScrapedTask[]): ScrapedTask[] {
  if (this.taskSort === "priority") {
    const rank = (p?: "high" | "med" | "low") => p === "high" ? 0 : p === "med" ? 1 : p === "low" ? 2 : 3;
    return [...tasks].sort((a, b) => rank(a.priority) - rank(b.priority) || compareTaskPageOrder(a, b));
  }
  return [...tasks].sort(compareTaskPageOrder);
}
```

- [ ] **Step 2:** Build clean.

- [ ] **Step 3:** Commit `refactor: drop view.ts priority helpers in favor of inlineFields`.

---

### Task 6: Version + CHANGELOG + README

- [ ] **Step 1:** Bump patch.
- [ ] **Step 2:** CHANGELOG: "Phase 6: priority and due chips on task rows."
- [ ] **Step 3:** README metadata syntax: document `[priority::]`, `[due::]`, tag/bang/p1 alternatives, and that `[due::]` accepts chrono natural language.
- [ ] **Step 4:** Commit.

## Verification

- [ ] Tests: ≥8 priority + ≥3 due.
- [ ] Manual: chips render correctly across themes.
- [ ] Manual: overflow indicator at sidebar width.
- [ ] Manual: priority sort still works after refactor.
