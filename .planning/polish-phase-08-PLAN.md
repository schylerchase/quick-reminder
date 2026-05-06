# Phase 8 — Saved Views (with schemaVersion)

**Prerequisites:** Phase 7 (sort/filter wired).

**Goal:** Persist named filter presets. Schema-versioned for forward compat with Phase 9 project filter.

**Files:** `src/types.ts` (`SavedView`), `src/store.ts` (CRUD + migration), `src/savedViewsModal.ts`, `src/view.ts` (Views dropdown), `tests/savedViewsMigration.test.ts`.

---

### Task 1: SavedView type + migration

- [ ] **Step 1:** Failing test:

```typescript
import { migrateSavedView } from "../src/store";

describe("migrateSavedView", () => {
  it("adds schemaVersion to legacy view", () => {
    const legacy = { id: "v1", name: "Old", scope: "vault", sourceFilter: "all", taskSort: "page", search: "", dueFilter: "all" };
    const m = migrateSavedView(legacy as any);
    expect(m.schemaVersion).toBe(1);
  });
  it("preserves v1 fields when current version is v2 (Phase 9)", () => {
    const v1 = { id: "x", name: "x", schemaVersion: 1, scope: "vault", sourceFilter: "all", taskSort: "page", search: "", dueFilter: "all" };
    const m = migrateSavedView(v1 as any);
    expect(m.projectFilter).toBeUndefined();
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3:** Implement:

In `src/types.ts`:

```typescript
export interface SavedView {
  id: string;
  name: string;
  schemaVersion: 1 | 2;
  scope: "active" | "folder" | "vault";
  sourceFilter: "all" | "checkbox" | "marker";
  taskSort: TaskSort;
  search: string;
  dueFilter: DueFilter;
  projectFilter?: string[]; // v2 (Phase 9)
}

// Settings adds:
savedViews: SavedView[];
```

In `src/store.ts`:

```typescript
export function migrateSavedView(view: Partial<SavedView>): SavedView {
  return {
    id: view.id ?? `v_${Date.now().toString(36)}`,
    name: view.name ?? "Unnamed",
    schemaVersion: (view.schemaVersion as 1 | 2) ?? 1,
    scope: view.scope ?? "vault",
    sourceFilter: view.sourceFilter ?? "all",
    taskSort: view.taskSort ?? "page",
    search: view.search ?? "",
    dueFilter: view.dueFilter ?? "all",
    projectFilter: view.projectFilter,
  };
}
```

In `ReminderStore.init` after loading:

```typescript
this.data.settings.savedViews = (loaded.settings?.savedViews ?? []).map(migrateSavedView);
```

- [ ] **Step 4:** PASS.

- [ ] **Step 5:** Commit `feat: SavedView type + migration shim`.

---

### Task 2: Store CRUD

- [ ] **Step 1:** Add to `src/store.ts`:

```typescript
async addSavedView(view: Omit<SavedView, "id" | "schemaVersion">): Promise<string> {
  const id = `v_${Date.now().toString(36)}`;
  this.data.settings.savedViews.push({ ...view, id, schemaVersion: 1 });
  await this.persist();
  return id;
}

async removeSavedView(id: string): Promise<void> {
  this.data.settings.savedViews = this.data.settings.savedViews.filter((v) => v.id !== id);
  await this.persist();
}

async updateSavedView(id: string, patch: Partial<SavedView>): Promise<void> {
  const idx = this.data.settings.savedViews.findIndex((v) => v.id === id);
  if (idx === -1) return;
  this.data.settings.savedViews[idx] = { ...this.data.settings.savedViews[idx], ...patch };
  await this.persist();
}
```

- [ ] **Step 2:** Tests for add/remove/update.

- [ ] **Step 3:** Commit `feat: store CRUD for SavedView`.

---

### Task 3: Toolbar Views dropdown + apply

- [ ] **Step 1:** In `renderTaskToolbar`, add a `Views` dropdown listing saved views + "Save current as view…" + "Manage views…".

- [ ] **Step 2:** Apply method on `ReminderView`:

```typescript
private applySavedView(view: SavedView): void {
  if (view.scope) this.taskScope = view.scope;
  if (view.sourceFilter) this.sourceFilter = view.sourceFilter;
  if (view.taskSort) this.taskSort = view.taskSort;
  if (view.search !== undefined) this.taskSearch = view.search;
  if (view.dueFilter) this.dueFilter = view.dueFilter;
  // projectFilter handled in Phase 9
  void this.render();
}
```

- [ ] **Step 3:** "Save current" prompt: simple `Modal` with name input.

- [ ] **Step 4:** Commit `feat: Views toolbar dropdown with apply + save`.

---

### Task 4: Manage views modal

- [ ] **Step 1:** Create `src/savedViewsModal.ts` — list with rename + delete buttons per view.

- [ ] **Step 2:** Commit `feat: manage saved views modal`.

---

### Task 5: Stale-folder warning chip

- [ ] **Step 1:** When applying a view with a folder scope, check the folder still exists. If not, surface a chip "Folder no longer exists" at top of dashboard for that render.

- [ ] **Step 2:** Commit `feat: stale-folder warning when applying saved view`.

---

### Task 6: Version + CHANGELOG + README

- [ ] **Step 1:** Bump patch.
- [ ] **Step 2:** CHANGELOG: "Phase 8: saved views with schemaVersion."
- [ ] **Step 3:** README section.
- [ ] **Step 4:** Commit.

## Verification

- [ ] Tests: migration round-trip.
- [ ] Manual: save / apply / rename / delete cycle.
- [ ] Manual: stale folder shows warning.
