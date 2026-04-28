# Phase 1: Schema & Store Foundation - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers the data foundation that every subsequent phase depends on: a lossless v0→v1 schema migration of existing reminder data into a new discriminated-union `Task` model, an extended `TaskStore` with debounced markdown mirror writes, UUID-based ID generation, and a recovery path when migration fails. All existing user-visible behavior — quick capture, native OS notifications, launch-time catch-up, sidebar viewing — is preserved unchanged through the rewrite.

This phase ships **zero net-new user-visible features**. Its job is to make the schema, store, and lifecycle correct enough that phases 2–5 (Inbox UI, Code TODO Scanner, Calendar Feeds, Daily Dashboard) can plug in without further schema migrations or store refactors. The 18 locked requirements in REQUIREMENTS.md (DATA-01..08, CAP-01/02/04, TASK-07, NOTIF-01..03, QUAL-01/02/04) define the scope.

**In scope (this phase):** Migrator module, Task discriminated union with all four sourceRef shapes, TaskStore (renamed from ReminderStore) with debounced mirror, UUID id generation, snooze preset popover, full callsite rewrite, recovery view on migration failure, Vitest test infrastructure with parser/store unit tests + scheduler integration test + migration integration test against captured v0 fixture, hot-reload smoke verification.

**Out of scope (this phase, deferred to later phases or v1.x):** Inbox filter/sort/keyboard navigation (Phase 2), project CRUD UI (Phase 2 — model exists in Phase 1, no UI), code TODO scanner (Phase 3), calendar feeds (Phase 4), daily dashboard (Phase 5), recurring reminders (deferred indefinitely per PROJECT.md), pre-reminder lead time, status-emoji rendering of priority/status fields (Phase 2 surfaces them).

</domain>

<decisions>
## Implementation Decisions

### Type Shape

- **D-01: True discriminated union for Task.** Define four separate interfaces — `TaskManual`, `TaskMeeting`, `TaskCode`, `TaskOwe` — each with its own `source` literal and its own `sourceRef` shape. Export `Task = TaskManual | TaskMeeting | TaskCode | TaskOwe`. Consumers narrow on `task.source` to access source-specific fields. This catches per-source field mismatches at compile time and scales cleanly through phases 2–5 without needing further union-shape migrations.

- **D-02: Lock all four sourceRef shapes in Phase 1.** Even though Phase 1 only ever creates `TaskManual` instances (existing reminders migrate to manual; new captures are manual), the other three shapes are defined now so phases 3, 4, 5 only have to populate fields rather than add them. Concrete shapes:
  - `TaskManual.sourceRef` — omitted entirely (no extra fields beyond base Task)
  - `TaskMeeting.sourceRef` — `{ calendarEventId: string; eventStart: number }` (eventStart enables time-based correlation when calendar feeds change)
  - `TaskCode.sourceRef` — `{ path: string; line: number; originalText: string }` (path:line is the dedupe key per SCAN-10; originalText supports "TODO removed → auto-mark done" detection)
  - `TaskOwe.sourceRef` — `{ assignee: string }` (assignee = the @name from `TODO(@name)`; staleness is computed from base `createdAt`)

- **D-03: Lock the full Task base shape now, including Phase 2 fields as optional.** The Phase 1 migration writes the complete v1 schema; Phase 2 does no schema work and is purely UI/feature additions. Base fields:
  - **Required (carry forward from existing Reminder):** `id: string`, `text: string`, `rawInput: string`, `createdAt: number`
  - **Required (new in v1):** `source: "manual" | "meeting" | "code" | "owe"`
  - **Optional (existing Reminder fields, kept for compat):** `dueAt?: number` (made optional — Phase 2 ships no-date tasks per INBOX-02; existing reminders all have it set), `notified?: boolean` (legacy: "OS notification fired"; orthogonal to new `status` field), `snoozedFrom?: number`
  - **Optional (Phase 2 fields, written but not populated by Phase 1 code):** `priority?: 1 | 2 | 3 | 4 | 5`, `status?: "open" | "done" | "cancelled"`, `completedAt?: number`, `projectId?: string`, `tags?: string[]`, `allDay?: boolean`
  - Plus per-source `sourceRef?` per D-02.
  - The legacy `notified` boolean and the new `status` enum are **orthogonal**: `notified` means the OS notification fired; `status` means the user took action. A task can be `notified=true, status="open"` (fired but user hasn't done it). Phase 2 introduces `status` and the inbox UI that distinguishes them.

- **D-04: PluginData includes `projects: Project[]` (initialized empty) and `schemaVersion: number` (set to 1 by migrator).** `Project` model: `{ id: string; name: string; status: "active" | "archived"; noteLink?: string }`. Phase 1 writes the empty array; Phase 2 builds the CRUD UI.

### Migration

- **D-05: Standalone Migrator module at `src/migrations/v0-to-v1.ts`.** Exports a pure function `migrate(rawData: unknown): PluginData` (no Obsidian dependencies — easily unit-testable per QUAL-02). Detects v0 by `schemaVersion === undefined || schemaVersion < 1`. Maps each v0 `Reminder` to a `TaskManual` by:
  - Preserving `id`, `text`, `rawInput`, `dueAt`, `createdAt`, `notified`, `snoozedFrom` exactly (DATA-01)
  - Setting `source: "manual"`
  - Leaving Phase 2 optional fields (`priority`, `status`, etc.) undefined
  - Initializing `projects: []` at the PluginData level
  - NOT setting `schemaVersion` — caller does that AFTER successful persist (DATA-03)

- **D-06: Migration orchestration lives in `TaskStore.init()`.** Sequence:
  1. `await load()` raw data from disk
  2. If `rawData.schemaVersion < 1 || undefined`: detect v0
  3. Write `data.json.pre-v1.bak` via Obsidian's plugin data API by saving `rawData` under a backup key, OR by writing a separate file in the plugin folder via `app.vault.adapter` (research will resolve which API works)
  4. Call `migrate(rawData)` → throws `MigrationError` on any failure
  5. Persist migrated data via `await save(migrated)` (without `schemaVersion`)
  6. Set `migrated.schemaVersion = 1` and persist again — ONLY after step 5 succeeded
  7. Hydrate in-memory `data` from migrated result
  - On any throw between steps 3–6: propagate `MigrationError` up to plugin lifecycle.

- **D-07: Migration failure → inert plugin + dedicated recovery sidebar view.** `TaskStore.init()` rethrows `MigrationError`. `QuickReminderPlugin.onload()` wraps `store.init()` in try/catch. On catch: do NOT register the normal sidebar view, ribbon icons, commands, scheduler, or settings tab. Instead register a single sidebar view of type `quick-reminder-recovery` that displays:
  - The error message
  - The full path to `data.json.pre-v1.bak` (resolved from plugin data folder)
  - Manual recovery instructions ("To restore your reminders: 1. Disable plugin. 2. Replace data.json with data.json.pre-v1.bak. 3. Re-enable plugin.")
  - Links to the GitHub issues page for reporting the bug
  - The plugin remains loaded but inert until next Obsidian restart. No partial functionality.

### Backward-Compatibility & Naming

- **D-08: Rewrite all `Reminder` callsites to `Task`.** No type aliases, no adapter layer. Every `import { Reminder }` becomes `import { Task }` (or a specific variant like `TaskManual` where the source is statically known). Estimated diff: ~5 source files, ~100 lines touched. Cleanest end state — phases 2–5 start from a consistent `Task` vocabulary.

- **D-09: Rename internal classes and user-facing labels.** Internal: `ReminderStore → TaskStore`, `ReminderView → TaskView`, `ReminderListModal → TaskListModal`, `Reminder` interface → `Task` (and four variants per D-01). User-facing: sidebar title `"Reminders" → "Tasks"`, ribbon tooltip `"Open reminders" → "Open tasks"`, command names `"Show pending reminders" → "Show pending tasks"`, etc. The new install default for `mirrorFilePath` becomes `"Tasks.md"`. Existing users' configured `mirrorFilePath` setting is honored unchanged on upgrade — they keep `Reminders.md` if that's what they have. The plugin's manifest `name: "Quick Reminder"` stays (manifest contract; renaming the plugin breaks Obsidian's plugin identity).

- **D-10: Preserve all existing user-visible behavior through the rewrite.** Quick-capture hotkey works identically. Chrono-node parsing unchanged. Native OS notifications fire at due time. Launch-time catch-up still runs. Sidebar still shows Pending + History sections (Phase 2 reshapes via filters). Snooze still defaults to `defaultSnoozeMinutes`. The user should not perceive the rewrite — only the schema migration prompt on first launch.

### Snooze UX (TASK-07)

- **D-11: Snooze button → inline popover with presets + custom input.** Single "Snooze" button per row matches existing one-button pattern. Click opens an inline popover positioned beneath the button containing four preset buttons — "Later today (3h)", "Tomorrow morning (9am)", "This evening (8pm)", "Next week (Monday 9am)" — plus a custom datetime input that accepts chrono-node phrases. ESC or click-outside dismisses. The custom input reuses the existing `parseReminder()` parser so users can type the same natural-language phrases they use in capture. Default snooze (no preset selected, just plain click) still applies `settings.defaultSnoozeMinutes` for muscle-memory continuity.

### Test Infrastructure (QUAL-01/02/04)

- **D-12: Vitest, co-located `*.test.ts` files, factory pattern in `src/test-utils.ts`.** Per existing TESTING.md analysis. Add `vitest` + `@vitest/coverage-v8` to devDependencies. Create `vitest.config.ts` at project root with `environment: "node"` and `coverage.exclude: ["src/main.ts"]`. Mock the `obsidian` module surface used (`Notice`, `normalizePath`, `TFile`). Use `vi.useFakeTimers()` for scheduler integration tests. Coverage targets: parser 100%, store/migrator 80%+, scheduler 70%+, view/modal deferred (DOM-heavy, low ROI for this phase).

- **D-13: QUAL-02 fixture lives at `src/migrations/__fixtures__/v0-data.json`.** Captured from a live v0 install before Phase 1 implementation begins (this is a Phase 0 spike — see PROJECT.md "Phase 1 Phase-0 spikes"). The fixture is a frozen snapshot of one user's `data.json` containing: a mix of pending and notified reminders, at least one snoozed reminder, varying due dates including past/future/within-24h. Integration test loads the fixture, runs the migrator, asserts the resulting v1 shape preserves every reminder's id/text/dueAt/notified state and adds `source: "manual"` to each.

- **D-14: QUAL-04 hot-reload smoke is automated within the test suite, not a manual checklist.** Test instantiates a TaskStore with stub load/save, attaches a counter listener, runs init/destroy cycles in a loop. Asserts listener count returns to baseline after destroy and that no in-flight setTimeout handles leak. The Obsidian plugin reload (Cmd+R within the app) is NOT what this test exercises — it tests the in-process equivalent that would mirror the bug Obsidian's reload would surface.

### Claude's Discretion

The following details were not discussed because the user delegated them. Capture them in the plan, do not re-ask:

- **Mirror file format change (DATA-08).** Convert the existing `Reminders.md` (and new `Tasks.md`) format from a semi-readable checkbox list to an explicit write-only file with: a header banner stating "AUTO-GENERATED — DO NOT EDIT" + the file's last-write timestamp, the same checkbox-style task lines (so it remains scannable), and an mtime drift detector in `TaskStore.persist()` that records the file's mtime after every write and on next write checks for drift. On drift: surface a `Notice` ("Tasks.md was modified externally — your edits will be overwritten on next save") and proceed with the overwrite. Optional: write a `.bak` of the user's edited version before overwriting.

- **Snooze popover styling.** Match existing `qr-*` CSS class conventions. Popover positioned with `getBoundingClientRect()` of the snooze button. Use existing color tokens. Popover gets a new class `.qr-snooze-popover` and preset buttons get `.qr-snooze-preset`.

- **`src/migrations/` directory layout.** `src/migrations/v0-to-v1.ts` for the migrator. `src/migrations/types.ts` for `MigrationError` class and any shared migration types (kept separate from `src/types.ts` to avoid bloating that file). `src/migrations/__fixtures__/` for test data. Future migrations (v1→v2 etc.) follow the same `vN-to-vN+1.ts` pattern.

- **UUID generation helper.** Add `src/util/id.ts` exporting `newTaskId(): string` that returns `crypto.randomUUID()`. Replace inline `genId()` in `src/modal.ts:172` and the duplicated inline helper at `src/main.ts:152`. Existing reminder IDs in the format `r_<base36-time>_<base36-rand>` are preserved through migration (per D-05); only NEW tasks created post-migration use UUID. Both formats coexist as `string` in the Task interface.

- **Scheduler clamp boundary.** Existing scheduler clamps `setTimeout` delay to `2_147_483_000` ms (~24.8 days) at `src/scheduler.ts:28`. Keep this clamp. Do NOT add background re-arming for tasks past the horizon in Phase 1 — that's a separate concern. Existing behavior: those tasks get armed only when `scheduleAll()` re-runs (currently only on launch and on snooze). If a user is bothered by this, log it as a future v1.x improvement.

- **`projects: []` exposure.** Phase 1 stores `data.projects: Project[] = []` in PluginData but does NOT expose any UI to view, create, or assign projects. The empty array exists so Phase 2's project CRUD has a place to write without another schema bump. Add a getter `taskStore.projects` for symmetry with `taskStore.tasks`, returning the empty array.

- **`schemaVersion` strategy beyond v1.** Single integer field. Migrator chain: `v0-to-v1.ts` for now; future migrators added as `v1-to-v2.ts` etc. `TaskStore.init()` runs them in order based on detected version. Do NOT design the chain orchestration in Phase 1 — only the v0→v1 step. When Phase 2 (or later) adds a v2 schema, that phase designs the chain.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-Level Specs
- `.planning/PROJECT.md` — Core value, constraints (additive schema only, desktop-only, local persistence), Key Decisions table, Phase 1 Phase-0 spike list (frozen v0 fixture, `crypto.randomUUID()` availability)
- `.planning/REQUIREMENTS.md` §"Data Foundation" + §"Capture" + §"Task Model" (TASK-07 only) + §"Notifications" + §"Quality" — all 18 locked Phase 1 requirements with their full acceptance criteria
- `.planning/ROADMAP.md` §"Phase 1: Schema & Store Foundation" — phase goal, success criteria, dependency note ("first phase, nothing depends on it"), research flag MEDIUM
- `.planning/STATE.md` §"Blockers/Concerns" — Phase 1 spike list (frozen v0 `data.json` fixture, `crypto.randomUUID()` runtime verification)

### Codebase Maps
- `.planning/codebase/ARCHITECTURE.md` — full layered architecture, data flow for capture/fire/launch/unload, error handling patterns, observer pattern in ReminderStore, scheduler 32-bit clamp at line 28
- `.planning/codebase/STRUCTURE.md` — file-by-file summary, naming conventions (`qr-*` CSS, PascalCase classes, camelCase helpers), import graph (no cycles, types.ts is leaf), where-to-add-new-code patterns
- `.planning/codebase/TESTING.md` — Vitest recommendation with full rationale, proposed `vitest.config.ts`, mock patterns for Obsidian `App` / `Notice` / `Notification`, fixture factory pattern for `src/test-utils.ts`, coverage targets per module
- `.planning/codebase/CONVENTIONS.md` — code style, naming, import patterns (read before writing new modules)
- `.planning/codebase/CONCERNS.md` — known concerns including the no-tests gap that Phase 1 closes

### Source Files (Phase 1 modifies these)
- `src/types.ts` — to be expanded with Task discriminated union, Project model, schemaVersion, MigrationError
- `src/store.ts` — to be renamed TaskStore, extended with migration orchestration in init(), debounced mirror, mtime drift detection
- `src/scheduler.ts` — clamp behavior preserved unchanged; only references update from Reminder → Task
- `src/modal.ts` — capture modal rewritten to produce TaskManual; legacy ReminderListModal renamed to TaskListModal; snooze popover added
- `src/view.ts` — renamed TaskView; snooze popover wired in; "Reminders" → "Tasks" label
- `src/parser.ts` — unchanged (pure parser, no Reminder/Task types)
- `src/main.ts` — settings tab renamed; recovery view registration on migration failure; UUID id generation; all wiring updated for renamed classes

### New Files Phase 1 Creates
- `src/migrations/v0-to-v1.ts` — pure migrator function
- `src/migrations/types.ts` — MigrationError class, migration shared types
- `src/migrations/__fixtures__/v0-data.json` — captured v0 fixture (Phase 0 spike)
- `src/util/id.ts` — `newTaskId()` UUID helper
- `src/test-utils.ts` — factory functions for Task, Settings, mock App
- `src/parser.test.ts`, `src/store.test.ts`, `src/scheduler.integration.test.ts`, `src/migrations/v0-to-v1.test.ts` — test suite per D-12/D-13/D-14
- `vitest.config.ts` — at project root

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`ReminderStore` constructor pattern** (`src/store.ts:8-14`) takes `load`/`save` closures rather than the `Plugin` instance. This dependency injection is exactly what makes the migrator unit-testable — the Phase 1 `TaskStore` keeps this pattern; tests pass in-memory stubs for `load`/`save`.
- **Observer pattern** (`src/store.ts:16-32`) with try/catch listener isolation is the right contract for Phase 2's inbox view to subscribe without risk. Phase 1 preserves this surface unchanged.
- **`parseReminder()`** (`src/parser.ts:9`) is a pure chrono-node wrapper with no Obsidian deps. Phase 1's snooze popover custom-time input reuses it directly. No changes needed to this file.
- **`scheduler.scheduleAll()`** (`src/scheduler.ts:15-20`) cancels-then-schedules pattern is correct under migration: after `TaskStore.init()` migrates, the existing `scheduleAll()` call from `main.ts` onload picks up the new task IDs without modification.
- **`formatWhen()`** (`src/view.ts:140`) is a pure formatting helper. Phase 1 keeps it unchanged. Phase 2 may extend with priority/tag rendering.

### Established Patterns

- **No framework, plain DOM via Obsidian helpers** (`createEl`, `createDiv`). The snooze popover uses these same helpers — no need to introduce React/Svelte. Matches existing CSS class convention `qr-*`.
- **Best-effort error handling at boundaries** (per `ARCHITECTURE.md` "Error Handling" section): try/catch at platform boundaries, log to console, surface via `Notice` or fallback. Migration recovery view follows this — caught at the plugin lifecycle boundary, surfaced as a dedicated view rather than a console-only error.
- **All mutations through the store** — no module reads or writes plugin data outside `ReminderStore`/`TaskStore`. Phase 1 keeps this invariant: the migrator is the only OTHER thing that touches the on-disk shape, and only during init().
- **Single-owner persistence with debounced mirror writes** — DATA-05 says 250ms trailing debounce on mirror writes. Apply this to `mirrorToMarkdown()` only; `saveData` (plugin's own JSON) writes synchronously per mutation since it's fast and the source of truth.
- **Permission-aware native notifications** with `Notice` fallback (`src/scheduler.ts:77-102`). Phase 1 preserves NOTIF-01..03 by leaving `showNativeNotification` and its callers unchanged in behavior — only Reminder→Task type references update.

### Integration Points

- **`QuickReminderPlugin.onload()`** in `src/main.ts:22-105` is where Phase 1 wires the new try/catch around `store.init()` and the conditional registration of either the normal view + commands OR the recovery view.
- **`workspace.onLayoutReady()` callback** (`src/main.ts:96-104`) currently runs `requestPermission` → `scanOverdue` → `scheduleAll` → `activateView`. Migration completes BEFORE this callback fires (because `store.init()` is awaited earlier in onload). No re-ordering needed.
- **Settings tab `display()` method** (`src/main.ts:172-237`) is where the mirror file path setting lives — Phase 1 keeps this setting; the only change is the DEFAULT for new installs (Tasks.md) versus existing users keeping their configured value.
- **Editor-menu event handler** (`src/main.ts:81-94`) and `convertSelectionToReminder()` at line 131 — rename to `convertSelectionToTask()`, output a TaskManual instead of Reminder. Behavior unchanged.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly chose `Internal + sidebar/labels` rename over both extremes — they want Phase 1 to communicate "this is now a task system, not just reminders" through the visible UI labels, but they do NOT want to break existing users' mirror file configuration. This balance (rename what's free, preserve what costs the user) should guide all naming decisions in this phase.
- Phase 1 ships **zero net-new visible features** — the user accepted this trajectory explicitly after a back-and-forth scoping conversation (initial brainstorm pivoted from "v0.2 hybrid with clock + polish + recurring + lead-time + inbox" to committing to the existing 5-phase ROADMAP, starting at Phase 1). Plan accordingly: do NOT smuggle in clock countdowns, recurring reminders, or lead-time features. Those are out of scope for Phase 1 and (for recurring) out of scope for v1 entirely per PROJECT.md.
- The migrator MUST be idempotent: running it twice on already-migrated v1 data must be a no-op (because `schemaVersion >= 1` short-circuits before any work). Verify in the integration test.
- The integration test for migration MUST use the captured v0 fixture, not a hand-written one. The fixture is the contract — if the user's actual data has fields the hand-written one missed, the migrator silently drops them. Spike 1 of Phase 0 captures this fixture from the user's real install.

</specifics>

<deferred>
## Deferred Ideas

These came up in scope-conversation or were explicitly excluded by user choice. Don't lose them; don't act on them in Phase 1.

- **Clock countdown UI (status bar + inline)** — User initially asked for this in the v0.2 brainstorm. Pivoted away from it when committing to the existing 5-phase roadmap. If the user revisits, this could become a v1.x or post-v1 polish phase.
- **Recurring reminders** (`every monday 9am`) — Out of scope for v1 entirely per PROJECT.md "Out of Scope". User initially picked spawn-on-fire semantics in the brainstorm but agreed to defer. Re-evaluate post-v1.
- **Pre-reminder lead time** ("notify 15 min before") — Out of scope for v1; could become v1.x.
- **`document.visibilityState`-based timer suspend** — Adaptive countdown perf optimization from the brainstorm. Not relevant to Phase 1 (no countdown UI exists). If the clock countdown ever ships, revisit.
- **Mobile push relay** — Out of scope for v1 entirely (desktop-only constraint). Roadmap idea only.
- **Outlook email-to-task bridge** — Roadmap idea, not v1.
- **AI auto-categorization / auto-tagging / smart scheduling** — Out of scope per PROJECT.md (no LLM dependencies in v1).

</deferred>

---

*Phase: 1-Schema & Store Foundation*
*Context gathered: 2026-04-27*
