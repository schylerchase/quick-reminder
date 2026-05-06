# Phase 7 — Sort/Filter by Due + Priority

**Prerequisites:** Phase 6 (`priority`, `dueAt` on ScrapedTask).

**Goal:** Add `due-soonest` and `overdue-first` sort options. Add due-date filter dropdown.

**Files:** `src/view.ts:389,824,840`, `tests/sortFilter.test.ts`.

---

### Task 1: New sort options

- [ ] **Step 1:** Failing test:

```typescript
import { describe, it, expect } from "vitest";
import { sortScrapedTasksPure } from "../src/sortFilter"; // factor pure helper out

describe("sort", () => {
  const t = (n: number, dueAt?: number, priority?: "high"|"med"|"low") => ({
    line: n, dueAt, priority,
  } as any);
  it("overdue-first puts past-due ahead", () => {
    const now = Date.now();
    const tasks = [t(1, now + 1000), t(2, now - 1000), t(3)];
    expect(sortScrapedTasksPure(tasks, "overdue-first").map((x) => x.line)).toEqual([2, 1, 3]);
  });
  it("due-soonest sorts by dueAt asc, no-due last", () => {
    const tasks = [t(1, 3000), t(2, 1000), t(3), t(4, 2000)];
    expect(sortScrapedTasksPure(tasks, "due-soonest").map((x) => x.line)).toEqual([2, 4, 1, 3]);
  });
});
```

- [ ] **Step 2:** Run, FAIL.

- [ ] **Step 3:** Create `src/sortFilter.ts`:

```typescript
import type { ScrapedTask } from "./types";

export type TaskSort = "page" | "priority" | "due-soonest" | "overdue-first";
export type DueFilter = "all" | "overdue" | "due-soon" | "no-due";

export function sortScrapedTasksPure(tasks: ScrapedTask[], sort: TaskSort): ScrapedTask[] {
  const cmpPage = (a: ScrapedTask, b: ScrapedTask) => a.filePath.localeCompare(b.filePath) || a.line - b.line;
  if (sort === "due-soonest") {
    return [...tasks].sort((a, b) => {
      if (a.dueAt && b.dueAt) return a.dueAt - b.dueAt || cmpPage(a, b);
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return cmpPage(a, b);
    });
  }
  if (sort === "overdue-first") {
    const now = Date.now();
    return [...tasks].sort((a, b) => {
      const ao = a.dueAt && a.dueAt < now ? 0 : 1;
      const bo = b.dueAt && b.dueAt < now ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if (a.dueAt && b.dueAt) return a.dueAt - b.dueAt;
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return cmpPage(a, b);
    });
  }
  if (sort === "priority") {
    const rank = (p?: ScrapedTask["priority"]) => p === "high" ? 0 : p === "med" ? 1 : p === "low" ? 2 : 3;
    return [...tasks].sort((a, b) => rank(a.priority) - rank(b.priority) || cmpPage(a, b));
  }
  return [...tasks].sort(cmpPage);
}

export function filterByDue(tasks: ScrapedTask[], filter: DueFilter): ScrapedTask[] {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (filter === "overdue") return tasks.filter((t) => t.dueAt && t.dueAt < now);
  if (filter === "due-soon") return tasks.filter((t) => t.dueAt && t.dueAt - now <= sevenDays && t.dueAt >= now);
  if (filter === "no-due") return tasks.filter((t) => !t.dueAt);
  return tasks;
}
```

- [ ] **Step 4:** PASS.

- [ ] **Step 5:** Commit `feat: add sort/filter pure helpers for due+priority`.

---

### Task 2: Wire toolbar + view state

- [ ] **Step 1:** In `view.ts`, replace `taskSort` type and add `dueFilter` field:

```typescript
private taskSort: TaskSort = "page";
private dueFilter: DueFilter = "all";
```

In `renderTaskToolbar`, extend the sort select:

```typescript
sortSelect.createEl("option", { text: "Page order", value: "page" });
sortSelect.createEl("option", { text: "Priority", value: "priority" });
sortSelect.createEl("option", { text: "Due soonest", value: "due-soonest" });
sortSelect.createEl("option", { text: "Overdue first", value: "overdue-first" });
```

Add a new due-filter select:

```typescript
const dueSelect = toolbar.createEl("select", { cls: "qr-task-select" });
dueSelect.createEl("option", { text: "Any due", value: "all" });
dueSelect.createEl("option", { text: "Overdue", value: "overdue" });
dueSelect.createEl("option", { text: "Due soon (≤7d)", value: "due-soon" });
dueSelect.createEl("option", { text: "No due date", value: "no-due" });
dueSelect.value = this.dueFilter;
dueSelect.onchange = () => { this.dueFilter = dueSelect.value as DueFilter; void this.render(); };
```

- [ ] **Step 2:** Update `getFilteredScrapedTasks` to apply `dueFilter`:

```typescript
private getFilteredScrapedTasks(tasks: ScrapedTask[]): ScrapedTask[] {
  let result = tasks;
  // existing search + sourceFilter logic
  result = filterByDue(result, this.dueFilter);
  return result;
}
```

Replace `sortScrapedTasks` body with a call to `sortScrapedTasksPure`.

- [ ] **Step 3:** Build clean.

- [ ] **Step 4:** Commit `feat: wire due filter and new sort options into toolbar`.

---

### Task 3: Version + CHANGELOG + README

- [ ] **Step 1:** Bump patch.
- [ ] **Step 2:** CHANGELOG: "Phase 7: sort by due date, filter by overdue/due-soon/no-due."
- [ ] **Step 3:** README mentions new toolbar options.
- [ ] **Step 4:** Commit.

## Verification

- [ ] Tests: 4+ sort scenarios.
- [ ] Manual: due-soon hides items without dueAt.
- [ ] Manual: overdue-first surfaces past-due tasks at top.
