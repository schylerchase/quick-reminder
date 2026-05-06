# Phase 9 — Project/Category Nav Rail

**Prerequisites:** Phase 7 (filtering), Phase 8 (SavedView v2 schema bump for `projectFilter`).

**Goal:** Collapsible 250px left rail (main pane only, ≥700px width) listing top-level projects with task counts. Click filters to project. Multi-select via shift-click.

**Files:** Create `src/dashboardNavRail.ts`, modify `src/view.ts:119` (split layout), `src/types.ts` (`SavedView` v2 add `projectFilter`), `src/store.ts` (`migrateSavedView` v1→v2), `styles.css`.

---

### Task 1: Pure project-tree builder

- [ ] **Step 1:** Failing test:

```typescript
import { buildProjectTree } from "../src/dashboardNavRail";
import type { ScrapedTask } from "../src/types";

describe("buildProjectTree", () => {
  it("groups by project name", () => {
    const tasks = [
      { project: "Foo", status: "todo", completed: false } as ScrapedTask,
      { project: "Foo", status: "completed", completed: true } as ScrapedTask,
      { project: "Bar", status: "in-progress", completed: false } as ScrapedTask,
    ];
    const tree = buildProjectTree(tasks);
    expect(tree.find((p) => p.name === "Foo")).toEqual({ name: "Foo", todo: 1, inProgress: 0, completed: 1 });
    expect(tree.find((p) => p.name === "Bar")?.inProgress).toBe(1);
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3:** Implement `src/dashboardNavRail.ts`:

```typescript
import type { ScrapedTask } from "./types";

export interface ProjectNode {
  name: string;
  todo: number;
  inProgress: number;
  completed: number;
}

export function buildProjectTree(tasks: ScrapedTask[]): ProjectNode[] {
  const map = new Map<string, ProjectNode>();
  for (const t of tasks) {
    const node = map.get(t.project) ?? { name: t.project, todo: 0, inProgress: 0, completed: 0 };
    if (t.status === "todo") node.todo++;
    else if (t.status === "in-progress") node.inProgress++;
    else if (t.status === "completed") node.completed++;
    map.set(t.project, node);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4:** PASS.

- [ ] **Step 5:** Commit `feat: project tree builder`.

---

### Task 2: ProjectFilter on view + migration

- [ ] **Step 1:** Add to `ReminderView` instance state:

```typescript
private projectFilter: string[] = []; // empty = all projects
private navRailCollapsed: boolean = false;
```

- [ ] **Step 2:** Update `getFilteredScrapedTasks` to apply project filter:

```typescript
if (this.projectFilter.length > 0) {
  result = result.filter((t) => this.projectFilter.includes(t.project));
}
```

- [ ] **Step 3:** Update `migrateSavedView` to v2:

```typescript
export function migrateSavedView(view: Partial<SavedView>): SavedView {
  const v1 = { ...defaultsV1, ...view };
  // v1 → v2: ensure projectFilter exists (empty array)
  return { ...v1, schemaVersion: 2, projectFilter: view.projectFilter };
}
```

- [ ] **Step 4:** Apply method respects projectFilter:

```typescript
private applySavedView(view: SavedView): void {
  // ... existing
  if (view.projectFilter !== undefined) this.projectFilter = view.projectFilter;
}
```

- [ ] **Step 5:** Commit `feat: projectFilter state + SavedView v2 migration`.

---

### Task 3: Render rail layout

- [ ] **Step 1:** In `view.ts:119` `render()`, when `isMainWorkspaceView()` AND `containerEl.offsetWidth >= 700`:

```typescript
const isWide = this.isMainWorkspaceView() && (this.containerEl as HTMLElement).offsetWidth >= 700;
if (isWide) {
  const layout = container.createDiv({ cls: "qr-dashboard-layout" });
  if (!this.navRailCollapsed) this.renderNavRailExpanded(layout);
  else this.renderNavRailCollapsed(layout);
  const main = layout.createDiv({ cls: "qr-dashboard-main" });
  // existing render targets `main` instead of `container`
}
```

- [ ] **Step 2:** Implement `renderNavRailExpanded` and `renderNavRailCollapsed`:

```typescript
private renderNavRailExpanded(parent: HTMLElement): void {
  const rail = parent.createDiv({ cls: "qr-nav-rail" });
  const header = rail.createDiv({ cls: "qr-nav-rail-header" });
  header.createSpan({ text: "Projects", cls: "qr-nav-rail-title" });
  const collapseBtn = header.createEl("button", { text: "<<", cls: "qr-nav-rail-collapse" });
  collapseBtn.onclick = () => { this.navRailCollapsed = true; void this.render(); };

  const tree = buildProjectTree(this.scrapedTasks);
  for (const p of tree) {
    const item = rail.createDiv({ cls: "qr-nav-rail-item" });
    item.toggleClass("is-selected", this.projectFilter.includes(p.name));
    item.createSpan({ text: p.name, cls: "qr-nav-rail-name" });
    item.createSpan({ text: `${p.todo}/${p.inProgress}/${p.completed}`, cls: "qr-nav-rail-counts" });
    item.onclick = (e) => {
      if (e.shiftKey) {
        this.projectFilter = this.projectFilter.includes(p.name)
          ? this.projectFilter.filter((n) => n !== p.name)
          : [...this.projectFilter, p.name];
      } else {
        this.projectFilter = [p.name];
      }
      void this.render();
    };
  }

  if (this.projectFilter.length > 0) {
    const clear = rail.createEl("button", { text: "Clear filter" });
    clear.onclick = () => { this.projectFilter = []; void this.render(); };
  }
}

private renderNavRailCollapsed(parent: HTMLElement): void {
  const strip = parent.createDiv({ cls: "qr-nav-rail-collapsed" });
  const expand = strip.createEl("button", { text: ">>", cls: "qr-nav-rail-expand" });
  expand.onclick = () => { this.navRailCollapsed = false; void this.render(); };
  const tree = buildProjectTree(this.scrapedTasks);
  for (const p of tree) {
    const initial = strip.createEl("button", {
      text: p.name.slice(0, 2).toUpperCase(),
      cls: "qr-nav-rail-icon",
      attr: { title: `${p.name}: ${p.todo}/${p.inProgress}/${p.completed}` },
    });
    initial.onclick = () => { this.projectFilter = [p.name]; this.navRailCollapsed = false; void this.render(); };
  }
}
```

- [ ] **Step 3:** Drawer fallback (< 700px main pane): toolbar gets a "Projects" button that opens an overlay drawer. Implement as a Modal with the same project tree content. Keep this minimal — Modal opens, click selects project + closes.

- [ ] **Step 4:** Persist `navRailCollapsed` in view state (extend `getViewState` / `applyViewState`).

- [ ] **Step 5:** Commit `feat: collapsible project nav rail (main pane ≥700px)`.

---

### Task 4: CSS

- [ ] **Step 1:** Add to `styles.css`:

```css
.qr-dashboard-layout { display: grid; grid-template-columns: 250px 1fr; gap: 1em; }
.qr-dashboard-layout:has(.qr-nav-rail-collapsed) { grid-template-columns: 40px 1fr; }
.qr-nav-rail { padding: 0.5em; border-right: 1px solid var(--background-modifier-border); }
.qr-nav-rail-collapsed { display: flex; flex-direction: column; gap: 0.25em; align-items: center; padding: 0.5em 0.25em; }
.qr-nav-rail-icon { width: 32px; height: 32px; font-size: 0.8em; }
.qr-nav-rail-item { display: flex; justify-content: space-between; padding: 0.25em 0.5em; cursor: pointer; border-radius: 3px; }
.qr-nav-rail-item:hover { background: var(--background-modifier-hover); }
.qr-nav-rail-item.is-selected { background: var(--background-modifier-active); font-weight: 600; }
.qr-nav-rail-counts { color: var(--text-muted); font-size: 0.85em; }
```

- [ ] **Step 2:** Manual visual test: wide pane → rail visible. Narrow → drawer button appears.

- [ ] **Step 3:** Commit `style: nav rail layout`.

---

### Task 5: Per-instance state isolation test

- [ ] **Step 1:** Manual: open both sidebar and main dashboard. Click project in main rail. Expected: sidebar instance unaffected. (Already true since `projectFilter` is `private` instance state.)

---

### Task 6: Version + CHANGELOG + README

- [ ] **Step 1:** Bump patch.
- [ ] **Step 2:** CHANGELOG: "Phase 9: project/category nav rail."
- [ ] **Step 3:** README section + screenshot placeholder.
- [ ] **Step 4:** Commit.

## Verification

- [ ] Tests: project tree counts.
- [ ] Manual: rail counts match dashboard.
- [ ] Manual: shift-click multi-select.
- [ ] Manual: collapsed strip works.
- [ ] Manual: narrow main pane shows drawer button.
- [ ] Manual: rail in main does not propagate to sidebar.
