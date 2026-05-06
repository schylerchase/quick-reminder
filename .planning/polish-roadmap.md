# Quick Reminder Polish Roadmap (v2)

> **For agentic workers:** Strategic phased roadmap. Each phase below should be expanded into a `superpowers:writing-plans` document before execution. Phases are sized for one PR each.

**Goal:** Harden Quick Reminder dashboard into a reliable lightweight task manager with safe edits, richer task metadata, saved views, project navigation, keyboard control, and a health page.

**Wedge / why this plugin exists:** Unified triage of three disjoint Obsidian task sources in one panel — TODO comments, checkbox tasks, and time-based reminders. Tasks plugin handles checkboxes only. Dataview handles queries only. Quick Reminder is the only place that sees all three together. Every phase below should reinforce that wedge, not copy a competitor.

**Non-goals (do not build):**
- Recurrence engine (Tasks plugin owns this).
- DQL/query language (Dataview owns this).
- Kanban board (Kanban plugin owns this).
- Daily-note rollup (Dataview snippet in README is sufficient).

**Architecture today:**
- `src/taskScanner.ts` — scans markdown for `- [ ]/[/]/[x]` and `TODO:`, returns `ScrapedTask[]` with `id = filePath:line:kind`. Mutates lines via `setCheckboxStatus` / `replaceTaskLine` / `deleteTaskLine`. Verified: today's `setCheckboxStatus` only updates the checkbox marker — no line moves.
- `src/store.ts` — reminder + ignored-task persistence, listener pub/sub.
- `src/view.ts` — 1400-line `ReminderView` (sidebar + main dashboard), scope filter, sort, render groups, row actions. Pure helpers `getTaskPriorityRank` etc. live near the bottom and are candidates for extraction.
- `src/main.ts` — Plugin entry, commands, settings tab, workspace plumbing for sidebar/dashboard placement. Holds `buildTaskSectionBlock` / `hasTaskSection` / `normalizeTaskSectionHeadings` (extracted into `sections.ts` in Phase 1).
- `src/parser.ts` — chrono-node natural date parsing (used for reminder capture only today).

**Tech stack:** Obsidian Plugin API (minAppVersion 1.4.0), TypeScript, esbuild, chrono-node. Phase 0 adds Vitest. Build: `npm run build` (canonical; the maintainer's `rtk` proxy wraps this transparently).

**Decisions locked before phase 1:**

1. **Task identity:** keep `filePath:line:kind` for backward compat in stored `ignoredTaskIds`. Every write path content-verifies the line *and* its immediate neighbors first (Phase 0 — guards against duplicate-text false matches).
2. **Status-move behavior:** **NEW feature.** Today's `setCheckboxStatus` does not move lines; Phase 4 introduces it. Default **ON** for new installs. Existing installs see a one-time migration prompt: "Quick Reminder can now move tasks to your Completed/In Progress sections when you check them. Enable?" — picking No keeps today's checkbox-only behavior.
3. **Inline metadata format:** Dataview-style `[key:: value]` for `priority`, `completion`, `due`. Tag-style `#priority/high` and prefix `!!`/`p1` parsed read-only (existing `getTaskPriorityRank` already handles these — Phase 6 is a refactor, not new parsing).
4. **Destructive deletes:** Phase 15 reframes Delete as Archive by default. Cross-phase semantics: until Phase 15 ships, Phase 10/11 buttons remain "Delete" with confirm; rename happens at Phase 15.
5. **Write primitive:** all task-mutating writes use `vault.process(file, mutator)` — atomic against editor buffers. The current `read → modify` pattern is a pre-existing race against open editors and gets replaced in Phase 0. Minimum Obsidian version stays 1.4.0 (`vault.process` available there).
6. **Settings organization:** Phase 0 introduces a tabbed Settings layout (Safety / Metadata / Display / Integrations). Each subsequent phase adds settings under the appropriate tab — caps cognitive load before sprawl hits.
7. **Manifest versioning:** every phase PR bumps `manifest.json` and `package.json` patch version, tags a release, and includes a CHANGELOG.md entry. The in-plugin updater depends on this.
8. **README discipline:** every phase's test/build checklist includes a "Update relevant README section" item. Phase 16 is screenshots only, not a from-scratch rewrite.

---

## Phase ordering at a glance

| # | Phase | Days | Risk | Depends on |
|---|-------|------|------|------------|
| 0 | Safety + test harness + settings tabs | 2.5 | low | — |
| 1 | New task from dashboard | 1 | low | 0 |
| 2 | Better empty states | 0.5 | low | 1 |
| 3 | Inline task editing | 1 | med | 0, 6-foundation |
| 4 | Status-move under heading (new feature, default ON + migration prompt) | 1.5 | med | 0 |
| 5 | Completion timestamps | 0.5 | low | 0 |
| 6 | Inline metadata refactor (priority + due chips) | 0.75 | low | 0 |
| 7 | Sort/filter by due + priority | 1 | low | 6 |
| 8 | Saved views (with schemaVersion) | 1 | low | 7 |
| 9 | Project/category nav rail | 1.5 | med | 7 |
| 10 | Keyboard shortcuts | 1 | med | 1, 3 |
| 11 | Bulk actions | 1.5 | high | 0, 10 |
| 12 | Stale task detection | 0.5 | low | 6 |
| 13 | Auto-clean orphaned reminders/ignored | 0.75 | med | 0 |
| 14 | Health page | 0.5 | low | 0 |
| 15 | Archive vs hard delete | 0.5 | med | 0 |
| 16 | Screenshots + final docs pass | 0.5 | none | last |

Total: ~15.0 dev-days (down from 17 after cuts).

**Cut from v1:**
- ~~Phase 13 (Daily rollup)~~ — duplicates Dataview/Templater. Replacement: ship a Dataview snippet in the README that renders rollups for users who want them. Zero code, zero maintenance.
- ~~Phase 17 (Kanban lanes)~~ — duplicates official Kanban plugin. Three reviewers converged on cut. Phase 4 + Phase 9 cover most kanban-like need at a fraction of the surface.

**Minimum credible polish (8.25 dev-days):** Phase 0, 1, 3, 5, 6, 7, 14, 15. Ships safe edits, new task, inline edit, completion timestamps, priority/due chips, sort/filter, health page, and archive — i.e. all the wedge-reinforcing work. Defer 4, 8, 9, 10, 11, 12, 13 until proven needed.

---

## Phase 0 — Safety foundation + test harness + settings tabs

**User value:** Invisible to user but every later phase depends on it. Without this, status/edit/delete on a stale scan corrupts unrelated lines, and the settings page has nowhere to put new toggles.

**Scope:**

1. **Settings tabs.** Refactor `QuickReminderSettingTab` (`main.ts:878`) into 4 sub-tabs: **Safety**, **Metadata**, **Display**, **Integrations**. Today's flat list moves under appropriate tabs. New phases add settings under the right tab.
2. **Vitest harness.** Add `vitest`, create `vitest.config.ts` with `resolve.alias` mapping `obsidian` → `tests/__mocks__/obsidian.ts`. Mock exports: `TFile` class (with `path`/`extension`/`stat` fields), `TAbstractFile` base, `normalizePath` identity function, `Notice` no-op stub, minimal `App`. Extract pure parsing (`parseCheckboxTask`, `parseMarkerTask`, line-walk helpers) into a new `src/scannerCore.ts` that has zero `obsidian` imports — tests at this layer need no mocks.
3. **`src/inlineFields.ts` (foundation, used by Phase 3/5/6).** Extract: `getInlineField`, `setInlineField`, `removeInlineField`. Use a bracket-balanced parser, not a naive regex — count `[`/`]` depth so `[link:: [[Daily Note]]]` round-trips intact. Parser returns `null` on malformed (unclosed) input. Document `(key:: value)` paren form as out-of-scope.
4. **Hash + neighbor verify.** Add `expectedLineHash`, `expectedPrevHash`, `expectedNextHash` to `ScrapedTask` (in-memory only). Hash is synchronous 32-bit FNV-1a over the raw line *as returned by `content.split(/\r?\n/)`* — no `.trim()`, so leading-whitespace edits invalidate. Crypto-grade hashing is unnecessary; collision risk on identical adjacent triples in real notes is negligible and the relevant failure mode (duplicate text) is solved by neighbor-tuple matching, not hash strength.
5. **`verifyAndWrite(task, mutator)` via `vault.process`.** Helper signature: `async verifyAndWrite(task, mutate: (line: string) => string | null): Promise<"ok" | "stale" | "error">`. Re-reads target line under `vault.process` (atomic against editor buffer), recomputes hash trio, returns `"stale"` and triggers rescan + `Notice("Task changed since last scan, rescanning...")` on mismatch. `mutate` returning `null` deletes the line; returning a string replaces it.
6. **Refactor 3 mutators.** `setCheckboxStatus`, `replaceTaskLine`, `deleteTaskLine` go through `verifyAndWrite`. Existing call sites in `view.ts` (`:728` `updateTaskStatus`, `:781` `editWithTasksPlugin`, `:808` `deleteTask`) get a `"stale"` branch.

**Files touched:**
- Create: `tests/__mocks__/obsidian.ts`, `vitest.config.ts`, `tests/scannerCore.test.ts`, `tests/inlineFields.test.ts`, `tests/verifyAndWrite.test.ts`.
- Create: `src/scannerCore.ts`, `src/inlineFields.ts`.
- Modify: `src/types.ts` — add `expectedLineHash`/`expectedPrevHash`/`expectedNextHash` to `ScrapedTask`.
- Modify: `src/taskScanner.ts` — import from `scannerCore`, add `verifyAndWrite`, refactor 3 mutators.
- Modify: `src/main.ts:878` — split settings tab into 4.
- Modify: `src/view.ts:728,781,808` — handle `"stale"` branch.
- Modify: `package.json` — vitest deps + `test` script.

**Test/build checklist:**
- [ ] `npm run build` clean.
- [ ] `npm test` passes ≥10 tests covering: line parsing, inline field round-trip with wikilinks, hash trio match/mismatch, `vault.process` mock atomicity, stale-rescan branch.
- [ ] Manual: edit tracked file in editor with unsaved buffer, click Done in dashboard, both edits land (no buffer overwrite).
- [ ] Manual: two identical task lines, delete first, dashboard click on second mutates correct line (neighbor-hash protects).
- [ ] Manual: existing `ignoredTaskIds` survive upgrade — no orphan ignores.
- [ ] Bump `manifest.json` patch version. CHANGELOG entry.
- [ ] README: add "Safety" section noting the rescan-on-stale notice.

---

## Phase 1 — New task from dashboard

**User value:** Author tasks where you triage them. No context switch.

**Scope:**

1. Extract `buildTaskSectionBlock`, `hasTaskSection`, `normalizeTaskSectionHeadings` from `main.ts:855-866` into `src/sections.ts`. Add `appendTaskUnderHeading(content, headingPath, taskLine)` — walks line-by-line from heading, finds the boundary where the next heading of equal-or-higher level begins (or EOF), inserts the new task immediately above any trailing blank lines.
2. New "New task" button in `renderTaskToolbar` (`view.ts:389`). Primary visual weight (accent color), to the right of "Scan".
3. New `NewTaskModal` (mirrors `IgnoreTaskModal` shape at `view.ts:1114`): text input (autofocus), status dropdown (To Do default), readonly target file label.
4. **Current file scope:** append to active note's `## Tasks → ### To Do` (or selected status). If `## Tasks` missing, create section first using `buildTaskSectionBlock`.
5. **Other scopes:** button disabled with tooltip "Switch to Current file scope to add a task" — until Phase 9 introduces a target picker.
6. **Post-write UX:** rescan, scroll new task into view, add `is-new` class for 1.5s fade. Focus moves to the new row's first action button.
7. **Failure UX:** if `vault.process` rejects, surface inline error inside modal (do not close), show `error.message` plus a Retry button.

**Files touched:**
- Create: `src/sections.ts`, `src/newTaskModal.ts`, `tests/sections.test.ts`.
- Modify: `src/view.ts:389` toolbar; `:1` import sections.
- Modify: `src/main.ts:841-867` re-export from sections.ts to keep command callers working.
- Modify: `styles.css` — `.qr-row.is-new { transition: background 1.5s; }`.

**Test/build checklist:**
- [ ] Unit: `appendTaskUnderHeading` inserts before next equal-or-higher heading.
- [ ] Unit: heading with zero items + heading at EOF.
- [ ] Unit: CRLF preserved.
- [ ] Manual: dashboard in Current file scope → New task → row appears, focus lands on action button, highlight fades.
- [ ] Manual: Current file scope, target file open in editor with unsaved edits → write succeeds via `vault.process`, no buffer loss.
- [ ] Manual: vault.process rejection (simulate by making file readonly) → modal stays open, error surfaces.
- [ ] Manual: button disabled in Whole vault scope, tooltip shown.
- [ ] Bump version, CHANGELOG, README "New task" section.

---

## Phase 2 — Better empty states

**User value:** Tells user *why* nothing shows and offers next action.

**Scope:**

- **Empty Current file:** "`<filename>` has no tasks." Primary CTA `New task` (accent), secondary `Insert task sections`. Stacked vertically when container width < 320px.
- **Empty Whole vault:** "Scanned `N` notes, found `0` tasks." Secondary CTA `Open settings`.
- **Empty after filters:** distinguish "no tasks in scope" from "filters hide all tasks" — second case shows `Clear filters`.
- **AI-slop guard:** reuse `.qr-view-empty` for message text and `.qr-row-btn` / `.qr-view-secondary-btn` for CTAs. No new layout primitives. No icons-in-circles. No illustrations.

**Files touched:** `src/view.ts:442` `renderScrapedSection`, `:1334` `getEmptyScrapedText`. `src/sections.ts` reused.

**Test/build checklist:**
- [ ] Manual: empty active file → buttons render correctly stacked at sidebar width.
- [ ] Manual: vault scan with no tasks → scan stats accurate.
- [ ] Manual: search query matching nothing → `Clear filters` works.
- [ ] Bump version, CHANGELOG, README empty-state screenshots.

---

## Phase 3 — Inline task editing

**User value:** Edit task text without leaving dashboard.

**Scope:**

1. Click `.qr-view-row-text` → swap to `<input type="text">` with the **editable middle** (visible task text only — inline metadata fields stripped from displayed string and re-appended on save in their original positions).
2. Save path: `verifyAndWrite` (Phase 0). Preserves leading whitespace, list marker, checkbox, AND inline metadata trailing the editable text.
3. **Esc on dirty input:** revert silently to original. No prompt — content is not lost from file.
4. **Multi-line text:** if source line contains literal newline (rare — a paste accident), display as space-collapsed in input. Save preserves single-line shape.
5. **Keyboard handler suppression (Phase 10 contract):** when `editingId !== null` (already tracked at `view.ts:39`), Phase 10's keyboard controller skips all row-navigation keys.
6. **Tasks-plugin emoji-syntax fields** (📅 ⏳ 🔁 ➕ ✅) preserved via the same metadata-suffix split as `[due::]` etc. Document in README that inline edit is text-body-only and does not re-trigger Tasks-plugin recurrence logic; users wanting that should use the `Edit` button.
7. Existing `Edit` button (Tasks-plugin modal) stays for full Tasks-plugin metadata flow.

**Files touched:**
- `src/view.ts:520` `renderScrapedRow`.
- `src/taskScanner.ts` — `replaceTaskText(task, newText)` preserving prefix + metadata suffix. Uses `inlineFields.ts` to identify metadata bounds.
- `tests/replaceTaskText.test.ts` — round-trip with `[due:: 2026-05-10]`, `🔁 every week`, `[priority:: high]`, leading whitespace, mixed list markers.
- `styles.css` — `.qr-view-row-text--editable`, hover pencil hint.

**Test/build checklist:**
- [ ] Unit: round-trip with all 5 Tasks-plugin emoji fields.
- [ ] Unit: round-trip with `[priority::]` + `[due::]` + body text.
- [ ] Manual: edit → save → file reflects new text on exact original line.
- [ ] Manual: external edit during inline edit → save shows rescan notice, aborts.
- [ ] Manual: Esc reverts.
- [ ] Bump version, CHANGELOG, README inline-edit demo.

---

## Phase 4 — Status-move under heading (new feature, default ON + migration)

**User value:** Optional kanban-style discipline — Done tasks move under `### Completed`, etc. NEW behavior; today's `setCheckboxStatus` only flips the marker.

**Scope:**

1. **New setting** `moveTaskOnStatusChange: boolean` (default `true` for new installs).
2. **Setting** `statusHeadingMap: { todo: "To Do", "in-progress": "In Progress", completed: "Completed" }` — defaults to `taskSectionHeadings`.
3. **Migration prompt on first launch after upgrade.** If `moveTaskOnStatusChange` is missing from saved settings (= upgrading user), show one-time notice: "Quick Reminder can now move tasks to your Completed/In Progress sections when you check them. Enable?" with [Enable] [Keep current behavior] buttons. Picking [Keep current behavior] sets `moveTaskOnStatusChange = false`. Either way the setting becomes present and the prompt never shows again.
4. **`moveTaskUnderHeading(content, fromLine, targetHeading)`** in `sections.ts` returns new content + new line number for moved task.
5. When setting on and status changes: move task line to bottom of target sub-heading inside the same `## Tasks` block. If `## Tasks` block missing OR target sub-heading missing: fall through to checkbox-only update + show notice once per session.
6. **After move, force synchronous rescan and gate dashboard input on that file** until rescan completes (loading state on rows from same file). Dropping the cursor-based mitigation; cursor is not the actual race.
7. Pre-write inline-field updates (Phase 5 completion timestamp) run on `lines[index]` BEFORE move, so the moved block carries the new metadata.

**Files touched:**
- `src/types.ts` — `Settings` adds 2 fields.
- `src/main.ts` — settings (Safety tab), migration prompt on `onLayoutReady`.
- `src/sections.ts` — `moveTaskUnderHeading`.
- `src/view.ts:728` `updateTaskStatus` — branch on setting, gate UI on file during rescan.
- `tests/sections.test.ts` — move + neighbor-hash invalidation scenarios.

**Test/build checklist:**
- [ ] Unit: move To Do → Completed lands at bottom of `### Completed`.
- [ ] Unit: missing target heading → no move, returns null, caller falls back.
- [ ] Unit: move triggers neighbor-hash invalidation for tasks below.
- [ ] Manual: clean install → move ON, click Done → line physically moves.
- [ ] Manual: upgraded install → migration notice appears once. Picking [Keep current behavior] disables move.
- [ ] Manual: two identical task lines, move first → second is not affected (neighbor-hash protects).
- [ ] Manual: with note open in editor → write succeeds via vault.process, no buffer loss.
- [ ] Bump version, CHANGELOG, README status-move section + migration note.

---

## Phase 5 — Completion timestamps

**User value:** Audit trail for "when did I finish this?" without manual stamps.

**Scope:**

- Setting `addCompletionTimestamp: boolean` (default `true`, Metadata tab).
- When marking checkbox done: append/update ` [completion:: YYYY-MM-DD HH:mm]` after task text and before existing metadata fields.
- When un-completing: strip the field.
- Respect existing field — never overwrite if value present and different unless re-completing.
- **Ordering vs Phase 4:** completion field write happens to `lines[index]` BEFORE `moveTaskUnderHeading` is called.

**Files touched:**
- `src/types.ts` — `addCompletionTimestamp`.
- `src/main.ts` — Metadata tab toggle.
- `src/taskScanner.ts:setCheckboxStatus` — pre-write hook before any move.
- `tests/inlineFields.test.ts` — adds completion timestamp scenarios.

**Test/build checklist:**
- [ ] Unit: adds field on completion, strips on un-complete.
- [ ] Unit: pre-existing `[completion::]` from a different source preserved when unchanged.
- [ ] Manual: with Phase 4 ON, complete task → moved block has timestamp.
- [ ] Bump version, CHANGELOG, README metadata section.

---

## Phase 6 — Inline metadata refactor (priority + due chips)

**Reframed:** This is a refactor of existing `getTaskPriorityRank` (`view.ts:1306`) plus genuinely new due-date parsing. Estimate cut from 1.5 → 0.75 days.

**Scope:**

1. Move `getTaskPriorityRank`, `hasInlinePriority`, `hasPriorityEmoji` from `view.ts:1306-1333` into `inlineFields.ts` as `parsePriority(text): "high"|"med"|"low"|null`. No new parsing logic — the existing function already handles `[priority::]`, `#priority/high`, `!!`/`!!!`, `p0`-`p4`, and emoji.
2. **New:** `parseDueDate(text): { dueAt: number | null, dueText: string | null }` using chrono-node (already imported in `parser.ts`). Handles `[due:: 2026-05-10]`, `[due:: tomorrow 3pm]`. Locale defaults to `en-US`; document this in README.
3. Extend `ScrapedTask` (in-memory) with `priority`, `dueAt`, `dueText`. Populate in `parseCheckboxTask`.
4. Render compact chips left of task text in `qr-task-badges`. **Reuse `.qr-task-badge` base styles** with color-modifier classes (`.qr-task-badge--priority-high`, `--due-soon`, `--due-overdue`). No new size/radius/font primitives.
5. **Disambiguation:** high priority = solid red background; overdue = red border + warning text. Different signals for different states.
6. **Overflow:** chips inherit `flex-wrap: wrap` from existing badges. In sidebar variant (< 240px), cap at 2 visible chips with a `+N` overflow indicator. Hover overflow chip → tooltip with hidden chips.
7. **Accessibility:** chip text must meet 4.5:1 contrast against background-secondary in both light and dark Obsidian themes. Manual visual check.

**Files touched:**
- `src/inlineFields.ts` — `parsePriority`, `parseDueDate`.
- `src/types.ts` — `ScrapedTask` adds 3 fields.
- `src/taskScanner.ts:parseCheckboxTask` — populate.
- `src/view.ts:520` `renderScrapedRow` — render chips. Remove now-orphaned helpers from view.ts.
- `styles.css` — modifier classes only.
- `tests/parsePriority.test.ts`, `tests/parseDueDate.test.ts`.

**Test/build checklist:**
- [ ] Unit: priority parsing matrix from existing helpers preserved.
- [ ] Unit: due parsing for ISO date, "tomorrow", "next monday".
- [ ] Manual: chips render on real notes; sidebar +N overflow works.
- [ ] Manual: WCAG 4.5:1 contrast in both themes.
- [ ] Bump version, CHANGELOG, README priority/due syntax docs.

---

## Phase 7 — Sort/filter by due + priority

**User value:** Surface what's overdue and what matters.

**Scope:**

- Extend `taskSort` enum: add `due-soonest`, `overdue-first`.
- New filter dropdown in toolbar: `All | Overdue | Due soon (≤7d) | No due date`.
- Wire to `getFilteredScrapedTasks` and `sortScrapedTasks`.

**Files touched:** `src/view.ts:389,824,840`. `tests/view-sort.test.ts`.

**Test/build checklist:**
- [ ] Unit: overdue-first puts past-due ahead, then by date asc.
- [ ] Unit: due-soon hides items with no `dueAt`.
- [ ] Bump version, CHANGELOG, README.

---

## Phase 8 — Saved views (with schemaVersion)

**User value:** One-click recall of common filter combos.

**Scope:**

- Setting persists `savedViews: SavedView[]`. **`SavedView` includes `schemaVersion: 1`** so Phase 9/12 additions don't silently drop fields on downgrade.
- Fields: `id`, `name`, `schemaVersion`, `scope`, `sourceFilter`, `taskSort`, `search`, `dueFilter`. (Phase 9 will add `projectFilter` as v2.)
- **Apply semantics:** when applying a saved view, missing fields are treated as "don't change current state" rather than "reset to default". Restoring v1 in v2 code does not clobber `projectFilter`.
- **Migration:** `migrateSavedView(view, currentVersion)` runs on store load. Bump `schemaVersion` on any breaking shape change.
- **Per-vault scope warning:** if a saved view references a folder filter no longer present, surface a warning chip on apply rather than silently empty result.
- Toolbar `Views` dropdown — list + "Save current as view…" + "Manage views…".

**Files touched:**
- `src/types.ts` — `SavedView` interface, `Settings.savedViews`.
- `src/store.ts` — `addSavedView`, `removeSavedView`, `migrateSavedView`.
- `src/savedViewsModal.ts`.
- `tests/savedViewsMigration.test.ts`.

**Test/build checklist:**
- [ ] Unit: v1 view loaded by v2 code preserves missing-field semantics.
- [ ] Manual: save / reload / delete cycle.
- [ ] Manual: applying view with stale folder filter shows warning chip, not blank list.
- [ ] Bump version, CHANGELOG, README.

---

## Phase 9 — Project/category nav rail (specs filled)

**User value:** Visible at-a-glance counts per project; one-click filter.

**Scope:**

1. Only render in main-pane dashboard (`isMainWorkspaceView()`), never sidebar.
2. **Layout breakpoint:** total pane width ≥ 700px → rail visible (250px). Width < 700px → rail auto-hides; toolbar shows a "Projects" button that opens a temporary overlay drawer instead.
3. **Collapsed state:** 40px icon strip with project initials (first 2 chars). Click an initial → expand rail. Persist collapsed state per workspace via Obsidian view state (NOT plugin settings — per-instance).
4. **State scope:** rail filter selection lives on the `ReminderView` instance (same scope as `taskSearch`/`taskSort`). Selecting a project in the main-pane rail does NOT propagate to a sidebar instance of the dashboard.
5. **Tree:** top-level project (folder) — counts of (todo/in-progress/completed) per project. Click → filters scope. Shift-click → multi-select.
6. Reuse `getProjectName` from scanner. Document the "first folder OR `Projects/<name>`" rule in tooltip.
7. **Saved-views integration:** if Phase 8 ships first, projectFilter becomes v2 schema field; Phase 9 PR includes the v2 migration.

**Files touched:**
- Create: `src/dashboardNavRail.ts`.
- `src/view.ts:119` — split layout when `isMainWorkspaceView()` AND container width ≥ 700px.
- `src/types.ts` — `SavedView` v2 adds `projectFilter`.
- `src/store.ts` — `migrateSavedView` v1→v2 (sets `projectFilter: undefined`).
- `styles.css` — rail layout, collapsed state, drawer fallback.

**Test/build checklist:**
- [ ] Manual: rail counts match scan.
- [ ] Manual: click project → scope/filter updates.
- [ ] Manual: collapse persists across reload.
- [ ] Manual: open both sidebar and main views — rail click in main does not affect sidebar.
- [ ] Manual: narrow main pane (< 700px) → rail hides, drawer button appears.
- [ ] Bump version, CHANGELOG, README nav rail section.

---

## Phase 10 — Keyboard shortcuts

**User value:** Power-user triage speed.

**Scope:**

1. Dashboard-scoped key handler (only when dashboard view focused, `event.target` not in input/textarea, `editingId === null`).
2. Bindings: `j`/`↓` next row, `k`/`↑` prev, `Enter` Show, `Space` toggle done, `i` toggle in-progress, `e` enter inline edit, `Delete`/`Backspace` archive (Phase 15) or delete with confirm modal, `/` focus search, `g g` top, `G` bottom, `?` open shortcut cheat sheet.
3. **Discoverability:** `?` opens an inline modal listing all bindings. Toolbar gets a small keyboard icon button that triggers the same modal. README documents shortcuts but the in-UI cheat sheet is the primary learning surface.
4. Visible focus ring on selected row (`.qr-view-row.is-focused`).
5. **Pure function `resolveKeyAction(event, focusTarget): Action | null`** — extracted for unit testing without DOM.

**Files touched:**
- Create: `src/keyboardController.ts`, `src/keyboardCheatSheetModal.ts`.
- `src/view.ts` — wire on `onOpen`/`onClose`, track selected row index.
- `tests/resolveKeyAction.test.ts`.
- `styles.css`.

**Test/build checklist:**
- [ ] Unit: `resolveKeyAction` covers all 11 bindings + suppression scenarios.
- [ ] Manual: typing in search box doesn't trigger row keys.
- [ ] Manual: `?` opens cheat sheet.
- [ ] Manual: Delete shows confirm modal (or archive in Phase 15+).
- [ ] Bump version, CHANGELOG, README keyboard section.

---

## Phase 11 — Bulk actions

**User value:** Batch-resolve a triage backlog.

**Scope:**

1. Multi-select via checkbox column (toolbar toggle, **always available**) or `x` keystroke (requires Phase 10).
2. **Range select:** Shift+click on a checkbox selects range from last-clicked to current.
3. **Select-all scope:** applies to **visible (sliced) tasks only — currently 150**. Show counter "150 of 320 selected — narrow filters to select more". Document the 150 limit in README.
4. Bulk bar appears when ≥1 selected: `Mark done | In progress | To do | Ignore | Delete` (Delete becomes Archive after Phase 15).
5. **Concurrency rules:**
   - All bulk writes go through `verifyAndWrite` (Phase 0).
   - **Per-file: sequential `await` between writes.** Never `Promise.all` over tasks in same file.
   - **When Phase 4 move-on-status is enabled:** rescan that file between writes within same file (line geometry shifts).
   - For deletes (or archives): order writes by descending line number per file.
   - Bulk bar buttons disabled during execution; spinner shows live count "Processing 4/12...".
6. Per-item failure surfaces in result notice ("4 done, 1 skipped: file changed").
7. **Mid-batch failure:** rescan after batch completes regardless of errors. UI selection state is cleared (selected IDs may be stale post-move).
8. Confirm modal always for Delete/Archive when count > 1.

**Files touched:**
- `src/view.ts` — selection state, bulk bar, batch executor, range-select.
- `src/taskScanner.ts` — `bulkApply(tasks, mutator)` groups by file, sequential await per file, rescan-between when needed.
- `tests/bulkApply.test.ts` — line-shift correctness, sequential ordering, rescan-between-writes when move enabled.

**Test/build checklist:**
- [ ] Unit: descending-line-order delete keeps remaining lines intact.
- [ ] Unit: per-file sequential awaits, no concurrent vault.process on same file.
- [ ] Unit: with Phase 4 ON, mid-batch rescan invalidates stale line numbers.
- [ ] Manual: select 5, Done → 5 checked, source files updated.
- [ ] Manual: external edit during batch → that one skipped, others succeed, notice reports.
- [ ] Manual: range-select via Shift+click works.
- [ ] Manual: select-all counter accurate, mentions 150 cap.
- [ ] Bump version, CHANGELOG, README bulk actions section.

---

## Phase 12 — Stale task detection

**User value:** Surface "what have I forgotten?" with no per-task history.

**Scope:**

- Setting `staleTaskDays: number` (default 14, Display tab).
- **Mtime read at render time, not scan time.** `app.vault.getAbstractFileByPath(filePath).stat.mtime` (cheap in-memory lookup). Drops the `ScrapedTask.fileMtime` field — staleness is computed live.
- Tasks where `now - fileMtime > staleTaskDays` and not completed → flagged with `Stale` chip.
- New filter option `Stale only`.
- Tooltip on Stale chip: "File last modified DATE — staleness is file-level, not task-level."

**Files touched:**
- `src/view.ts` — chip + filter + tooltip.

**Test/build checklist:**
- [ ] Manual: tasks in untouched-90-days note flagged stale.
- [ ] Manual: tooltip wording honest about file-level.
- [ ] Bump version, CHANGELOG, README.

---

## Phase 13 — Auto-clean orphaned reminders + ignored

**User value:** Ignored task list and reminders don't accumulate forever.

**Scope:**

1. Setting `autoCleanOrphans: "off" | "prompt" | "auto"` (default `prompt`, Safety tab). For `auto`: also pick `orphanedReminderAction: "complete" | "delete"`.
2. **`vault.on('rename')` subscription** registered on plugin load. On file rename: rewrite `ignoredTaskIds` and `reminders.sourceTaskId` to the new path prefix. Without this, file renames mass-mark stored entries as orphan.
3. After every successful **full-vault** scan (definition: `scan()` returned without error AND every `vault.cachedRead` succeeded — `lastScanReport.failures === 0`): diff scanned IDs vs `ignoredTaskIds` and `reminders.sourceTaskId`.
4. **`prompt` mode:** notice + button when ≥1 orphan; opens modal listing them.
5. **Modal information:** each orphan row shows stored **task text snapshot** (added at ignore time as a new field `ignoredTaskNotes[id].text`), file path, date ignored, and reason note. Without the snapshot, users only see meaningless raw IDs.
6. **`auto` mode:** silent removal. Logged to console for debugging.
7. **Scope-limited scans NEVER trigger cleanup** — only full-vault.
8. **`ignoredTaskNotes` schema migration:** existing entries are plain strings; new entries are `{ schema: 2, text: string, note: string, archivedAt?: number }`. On first save after upgrade, write a wrapper `{ schema: 2, entries: { ... } }` — discriminator is the wrapper's `schema` field, not a brace-prefix heuristic.

**Files touched:**
- `src/store.ts` — `findOrphans`, `cleanOrphans`, schema migration.
- `src/main.ts` — `vault.on('rename')` subscription.
- `src/orphansModal.ts`.
- `tests/store-rename.test.ts`, `tests/store-orphans.test.ts`.

**Test/build checklist:**
- [ ] Unit: rename rewrites stored IDs without losing entries.
- [ ] Unit: schema-2 migration round-trips legacy string notes.
- [ ] Unit: orphan detection requires successful full-vault scan.
- [ ] Manual: rename a folder with ignored tasks → no false orphans.
- [ ] Manual: scope-limited scan does NOT trigger cleanup.
- [ ] Manual: prompt mode modal shows task text snapshots.
- [ ] Bump version, CHANGELOG, README cleanup section.

---

## Phase 14 — Health page

**User value:** One-screen vault diagnostic.

**Scope:**

- New tab in settings ("Health") + toolbar button opens modal.
- Display: last scan time + duration; scanned notes count, total tasks, breakdown by status; ignored count, orphan count; Tasks plugin status; active settings summary; parse errors from `lastScanReport`; plugin version + updater status; "Copy diagnostics" → clipboard JSON.

**Files touched:**
- Create: `src/healthPage.ts`.
- `src/main.ts` — settings tab.
- `src/taskScanner.ts` — capture timing + parse errors into `lastScanReport: { duration, scannedFiles, failures, parseErrors[] }`.

**Test/build checklist:**
- [ ] Manual: counts match dashboard.
- [ ] Manual: copy diagnostics → valid JSON.
- [ ] Bump version, CHANGELOG, README.

---

## Phase 15 — Archive vs hard delete

**User value:** Reduce data loss risk.

**Scope:**

- Replace red `Delete` button in non-completed rows with `Archive` (= ignore + flag `archived: true` in schema-2 `ignoredTaskNotes` entry to distinguish from user-ignored).
- Hard delete moves to context menu only with confirm modal showing the line content.
- Setting `deleteRequiresConfirm: boolean` (default `true`, Safety tab).
- Bulk Delete from Phase 11 always confirms when count > 1, regardless of setting.
- Phase 10 `Delete` keybind triggers archive by default; `Shift+Delete` triggers hard delete.

**Files touched:**
- `src/store.ts` — extend ignored note schema-2 with `archived` flag.
- `src/view.ts:520` — replace button.
- `src/keyboardController.ts` — `Delete` vs `Shift+Delete`.

**Test/build checklist:**
- [ ] Unit: archive flag round-trips.
- [ ] Manual: Archive → row moves to Ignored; can be un-archived.
- [ ] Manual: hard delete via context menu confirms with line content.
- [ ] Manual: keyboard `Delete` archives, `Shift+Delete` hard-deletes.
- [ ] Bump version, CHANGELOG, README.

---

## Phase 16 — Screenshots + final docs pass

**User value:** Discoverability.

**Scope:**

- 4–6 screenshots: dashboard, sidebar, settings tabs, health page, keyboard cheat sheet, archive flow.
- Cross-link README sections that prior phases incrementally updated.
- Add Dataview snippet to README for users who want a daily-rollup query (the cut-Phase-13 replacement).
- Versioned CHANGELOG.md collated from per-phase entries.

**Files touched:** `README.md`, `installers/screenshots/*`, `CHANGELOG.md`.

---

## Recommended start

1. **Phase 0** is mandatory and largest single block (2.5 days). Pure foundation, unlocks all later phases.
2. **Phase 1** (New task) is the highest-visible-value next step.
3. After Phase 0+1, dogfood for a week before deciding on Phases 8/9/11 priority — those are the heaviest UX surface and benefit most from real usage data.

## Defer / decide before coding

- **Phase 4 migration prompt copy** — wording sensitive; user-test the prompt before ship.
- **Phase 9 nav rail** — at narrow main-pane widths the drawer overlay is unproven UX; willing to revert to "hide entirely below 700px" if drawer feels janky.
- **Phase 11 bulk** — confirm the 150-task visible cap is acceptable, or whether to lift slice limit when bulk-mode active (perf risk on large vaults).

---

## Appendix — what was cut and why

### Cut: Phase 13 (Daily rollup)
Three reviewers (product-lens P1, scope-guardian P1, adversarial P2) converged. Reasoning: duplicates Dataview/Templater/Periodic Notes territory; HTML comment id markers fragile under linter plugins and break when task IDs shift; no concrete user need cited. **Replacement:** README ships a Dataview snippet for users who want rollups.

### Cut: Phase 17 (Kanban lanes)
Three reviewers (product-lens P0, scope-guardian P1, adversarial P2 contradiction-with-Phase-4) converged. Reasoning: duplicates official Kanban plugin; required Phase 4 ON to function correctly which conflicted with the original Phase 4 OFF default; drag-drop on top of Obsidian's own DnD is a maintenance burden disproportionate to a personal tool. Phase 4 (status-move) + Phase 9 (project rail) cover the same triage need.

### Hallucinated finding (rejected)
Feasibility reviewer's P0 — "Status-move is already enabled, not new opt-in" — quoted a `moveCheckboxBlockToStatusSection(lines, index, status)` call at `taskScanner.ts:70`. Verified against git HEAD and working tree: that function never existed in the codebase. Phase 4 is correctly framed as a new feature. This finding is not actionable.

### Settings sprawl mitigation
Cross-cutting decision 6 introduces tabbed settings (Safety / Metadata / Display / Integrations) before any new settings ship. Caps the cognitive load of the otherwise ~25-field flat list that 18 phases worth of toggles would produce.
