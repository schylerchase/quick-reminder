# Phase 1: Schema & Store Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Phase:** 1-Schema & Store Foundation
**Areas discussed:** Type shape, Backward-compat strategy

---

## Type shape

### Q1: How should the Task discriminated union be modeled in TypeScript?

| Option | Description | Selected |
|--------|-------------|----------|
| True discriminated union | Define TaskManual, TaskMeeting, TaskCode, TaskOwe as separate interfaces (each with its own sourceRef shape), then export Task as the union. TypeScript narrows based on source field. Catches per-source field mismatches at compile time, scales cleanly through phases 2-5. | ✓ |
| Single interface, sourceRef union | One Task interface with all base fields plus sourceRef as union of refs. Simpler to write, weaker type guarantees. Consumers must hand-narrow on source before reading sourceRef fields. | |
| Single interface, freeform sourceRef | One Task interface with sourceRef as Record<string, unknown>. Maximum flexibility, zero type safety. Defers all per-source typing to runtime checks. | |

**User's choice:** True discriminated union
**Notes:** None — direct selection.

### Q2: Lock the sourceRef shape for ALL four sources now, or defer non-manual shapes?

| Option | Description | Selected |
|--------|-------------|----------|
| Lock all four shapes now | Define TaskManual (no sourceRef), TaskMeeting ({calendarEventId, eventStart}), TaskCode ({path, line, originalText}), TaskOwe ({assignee}) in Phase 1 even though only manual is used. Locks migration target — phases 3/4/5 just populate, no schema additions. | ✓ |
| Lock manual + meeting only | Manual + meeting (DASH-05 references calendarEventId in Phase 5). Defer code + owe sourceRef shapes to Phase 3. Less upfront design, slightly more migration risk later. | |
| Defer all non-manual shapes | Phase 1 defines source field as the union literal, but only TaskManual has a concrete shape. Each later phase adds its own variant. Smallest Phase 1 surface, highest risk of schema drift. | |

**User's choice:** Lock all four shapes now
**Notes:** None — direct selection.

### Q3: Phase 1 schema include Phase 2 fields as optional (single migration), or wait for Phase 2?

| Option | Description | Selected |
|--------|-------------|----------|
| Lock full Task shape now | Phase 1 schema includes ALL fields from REQUIREMENTS.md as optional: priority?, status?, completedAt?, projectId?, tags?, allDay?, plus the existing notified boolean kept as-is. Migration runs once in Phase 1. Phase 2 = pure UI/features, no schema work. | ✓ |
| Phase 1 minimal, Phase 2 additive | Phase 1 schema = current Reminder fields + source + sourceRef + UUID id only. Phase 2 adds priority/status/etc. as a second additive migration. Two migrations but cleaner separation. | |
| Lock structure but defer some fields | Phase 1 locks discriminated union + base Task shape with source/sourceRef. Adds optional status (mapping notified appropriately) but defers priority/projectId/tags/allDay to Phase 2. | |

**User's choice:** Lock full Task shape now
**Notes:** Question included disclosure that the legacy `notified` boolean does not map cleanly to the new open/done/cancelled status enum — they are orthogonal (notified = OS fired; status = user action state). The selected option keeps both fields independently.

### Q4: Where does v0→v1 migration run, and how is v0 detected?

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone Migrator module, runs in store.init() | New file src/migrations/v0-to-v1.ts exports `migrate(rawData) -> PluginData`. TaskStore.init() detects v0 (schemaVersion absent OR < 1), writes data.json.pre-v1.bak, calls migrate(), persists, sets schemaVersion=1 last. Migrator is pure (no Obsidian deps) — easily unit-testable per QUAL-02. | ✓ |
| Inline in store.init() | Migration logic lives inside TaskStore.init(). Smaller surface area but harder to test in isolation — QUAL-02 integration test would have to mock more of the store. | |
| Separate plugin lifecycle hook | Migration runs in QuickReminderPlugin.onload() BEFORE store is constructed. Cleaner separation but spreads init logic across two files. | |

**User's choice:** Standalone Migrator module, runs in store.init()
**Notes:** None — direct selection.

---

## Backward-compat strategy

### Q1: How do we wire the new Task shape into existing consumers?

| Option | Description | Selected |
|--------|-------------|----------|
| Rewrite all callsites | Replace every Reminder reference with Task (or TaskManual where source-specific). ~5 files, ~100 lines touched. Cleanest end state — the type rename signals the domain change. Phase 2 starts on a clean slate. | ✓ |
| Type alias `Reminder = TaskManual` | Keep Reminder as a type alias for TaskManual. Existing code reads Reminder and gets a TaskManual at compile time — zero behavioral diff. Smallest diff. Tradeoff: Reminder identifier lingers and may confuse future readers. | |
| Adapter layer | Store internally holds Task[] but exposes a `reminders` getter that returns Reminder[] for legacy consumers. Existing UI completely unchanged. Two parallel views of the same data. Defers the rewrite forever. | |

**User's choice:** Rewrite all callsites
**Notes:** None — direct selection.

### Q2: What gets renamed in Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| Internal-only rename | Rename internal classes (ReminderStore→TaskStore, ReminderView→TaskView, ReminderListModal→TaskListModal) and types (Reminder→Task). User-facing labels unchanged: sidebar still says "Reminders", mirror file default still Reminders.md, commands keep their names. | |
| Internal + sidebar/labels | Rename internal classes AND user-facing labels: sidebar header "Tasks", commands "Show pending tasks", "+ New task". Mirror file default switches to Tasks.md for new installs (existing users keep their configured Reminders.md). Plugin name "Quick Reminder" stays (manifest constraint). | ✓ |
| No renaming — add Task type aside | Keep all existing names intact. Add Task as a new exported type that's structurally identical to Reminder. Defer renaming to a later phase. Conflicts with "Rewrite all callsites" decision. | |

**User's choice:** Internal + sidebar/labels
**Notes:** Confirmed by selection that the user wants the rename to communicate the new task domain through visible UI labels but does NOT want to break existing users' configured mirror file path. Naming guidance: rename what's free, preserve what costs the user.

### Q3: How does migration failure propagate, and what does the user see?

| Option | Description | Selected |
|--------|-------------|----------|
| Throw → main.ts catches → inert plugin + recovery view | Migrator throws a typed MigrationError. store.init() rethrows. main.ts onload() catches — does NOT register sidebar view, commands, scheduler. Instead registers a single "Quick Reminder — Recovery" sidebar view that displays the error + path to .pre-v1.bak + manual recovery instructions. Plugin loads but is otherwise inert until restart. Atomic, no half-state. | ✓ |
| Return error result, register normally with degraded mode | store.init() returns {ok: false, error}. main.ts registers everything but in "degraded mode" — view shows error banner, capture modal disabled, scheduler not armed. Less atomic; risk of partial functionality confusing the user. | |
| Throw → main.ts shows blocking modal on next interaction | Migrator throws. main.ts sets a flag and registers a single command "Show migration error". First user interaction opens a modal explaining failure + .pre-v1.bak path. Plugin is inert until user interacts. Worse UX — user may not know plugin failed until they try to use it. | |

**User's choice:** Throw → main.ts catches → inert plugin + recovery view
**Notes:** None — direct selection.

### Q4: How does the snooze preset picker surface in the rewritten view?

| Option | Description | Selected |
|--------|-------------|----------|
| Snooze button → popover with presets + custom | Single "Snooze" button per row (matches existing pattern). Click opens an inline popover with 4 preset buttons + a custom datetime input. ESC or click-outside dismisses. Custom input parses chrono-node phrases. | ✓ |
| Two buttons: Snooze (default) + Snooze... | Existing Snooze button applies defaultSnoozeMinutes (unchanged behavior). New "Snooze..." button opens preset picker. Two buttons per row. Slightly cluttered, preserves existing single-click muscle memory. | |
| Replace button with dropdown | Snooze button becomes a small select dropdown showing presets. No popover. Most compact, but breaks the existing button pattern — dropdown styling differs from rest of view. | |

**User's choice:** Snooze button → popover with presets + custom
**Notes:** None — direct selection.

---

## Claude's Discretion

The following details were not discussed because the user delegated them to Claude (rationale provided in the recommend-then-confirm flow):

- **Migration recovery UX details** — Banner copy, recovery view layout, auto-vs-manual revert. User confirmed Claude can decide reasonable defaults.
- **Test framework choice** — TESTING.md already researched and recommended Vitest with strong rationale (native ESM, built-in fake timers, mocking API, fast cold-start). Locked without further discussion.
- **Mirror file format change for write-only enforcement (DATA-08)** — Header banner + checkbox-style content + mtime drift detection. Documented in CONTEXT.md "Claude's Discretion" section.
- **Snooze popover styling** — Match existing `qr-*` CSS conventions.
- **`src/migrations/` directory layout** — Documented in CONTEXT.md.
- **UUID generation helper location** — `src/util/id.ts` exporting `newTaskId()`.
- **Scheduler clamp boundary** — Preserve existing 32-bit clamp; do not add background re-arming in Phase 1.
- **`projects: []` exposure in Phase 1** — Stored but no UI; Phase 2 builds CRUD.
- **`schemaVersion` chain strategy beyond v1** — Single integer; future migrators added as needed; no chain orchestration designed in Phase 1.

## Deferred Ideas

Surfaced during the broader scoping conversation that preceded this phase discussion:

- **Clock countdown UI (status bar + inline)** — Initially asked for in v0.2 brainstorm. Pivoted away. Possible v1.x or post-v1 polish phase.
- **Recurring reminders** (`every monday 9am` with spawn-on-fire semantics) — Out of scope for v1 entirely per PROJECT.md. Re-evaluate post-v1.
- **Pre-reminder lead time** ("notify 15 min before") — Out of scope for v1.
- **`document.visibilityState`-based timer suspend** — Adaptive countdown perf optimization; not relevant until clock UI ships.
- **Mobile push relay** — Out of scope for v1 (desktop-only constraint).
- **Outlook email-to-task bridge** — Roadmap idea, not v1.
- **AI auto-categorization / auto-tagging / smart scheduling** — Out of scope per PROJECT.md.
