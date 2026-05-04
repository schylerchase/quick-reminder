# Quick Reminder — Engineer Task & Project Management

## What This Is

An Obsidian plugin that acts as a personal task and project management layer for an engineer, extending the existing quick-reminder capture and notification foundation into a unified inbox. It aggregates manual tasks, meeting follow-ups, async commitments, and code TODOs from configured repositories into one sortable, filterable view inside the vault. The vault is the source of truth; calendar feeds are pulled in read-only for daily context.

## Core Value

Every actionable item — manual tasks, meeting follow-ups, code TODOs, things I owe people — is visible and triageable from one unified view inside Obsidian. Nothing falls through the cracks because it lives in a different tool.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. Inferred from existing quick-reminder codebase. -->

- ✓ Global hotkey opens quick-capture modal with live parse preview — existing
- ✓ Natural-language time parsing via chrono-node (`tomorrow 3pm`, `in 2 hours`, `friday morning`) — existing
- ✓ Native OS notifications fire at due time on macOS, Windows, Linux — existing
- ✓ Markdown mirror file (`Reminders.md`) kept in sync with pending + notified reminders — existing
- ✓ Launch-time catch-up fires any reminders that went overdue while Obsidian was closed — existing
- ✓ Sidebar view shows pending + history with inline snooze/delete/re-add actions — existing
- ✓ JSON persistence via plugin data (`loadData`/`saveData`) with single-owner store + observer pattern — existing
- ✓ Settings tab for snooze default, mirror path, notification preferences — existing

### Active

<!-- Current scope. Hypotheses until shipped and validated. -->

- [ ] Unified task inbox view merging four sources: manual tasks, meeting follow-ups, code TODOs, async owes — sortable and filterable
- [ ] Task model extends reminder model with: project link, priority, source (manual/meeting/code/owe), owes-to field
- [ ] Projects as first-class containers (name, status, optional note link, task list)
- [ ] Calendar merge: Google Calendar (OAuth) + Outlook (ICS feed) pulled into a single read-only today view
- [ ] Morning dashboard block auto-rendered into the active daily note — today's meetings, tasks due, stale owes
- [ ] Code TODO scanner walks configured absolute paths for `// TODO:` / `# TODO:` / `TODO(...)` comments and surfaces them as tasks
- [ ] Meeting follow-up capture: after or during a calendar event, capture action items tagged to that event
- [ ] Async owes tracking with configurable staleness threshold — surfaces in dashboard and fires a native notification when past threshold
- [ ] Pending reminders absorbed as one task type among many — existing UI either replaced by the inbox view or preserved as a filtered variant

### Out of Scope

<!-- Explicit boundaries with reasoning to prevent re-adding. -->

- Team collaboration, shared task visibility, multi-user sync — personal workflow only; adding sync introduces auth, conflict resolution, and a backend that is explicitly unwanted
- Mobile support — desktop-only constraint is inherited (Electron notification API, Node `fs` for TODO scan)
- Cloud backend of any kind — vault is source of truth by design
- Bidirectional Jira, Linear, or Asana sync — increases surface area and couples the tool to employer-specific systems
- Outlook OAuth app registration — corporate IT rarely grants it; ICS feed is the supported path
- Recurring reminders — deferred; one-shot tasks cover v1 needs
- Email-to-task bridge — Outlook email bridge is a roadmap idea, not v1
- AI summarilization or auto-categorilization of tasks — no LLM dependencies in v1

## Context

**Technical environment:**

- Obsidian plugin API (desktop), TypeScript compiled via esbuild
- Existing layered architecture: UI (modals, view) → Plugin orchestrator → Domain (Store, Scheduler, Parser) → Platform APIs (Obsidian, Electron Notification)
- Single-owner persistence: `ReminderStore` holds all data, emits change events, persists via `plugin.loadData` + markdown mirror
- Existing dependencies: `chrono-node` for NLP, `obsidian` peer dep, Electron `Notification` global

**Prior work:**

- `/gsd-map-codebase` produced six analysis documents under `.planning/codebase/` (ARCHITECTURE, CONCERNS, CONVENTIONS, INTEGRATIONS, STACK, STRUCTURE, TESTING). Reuse as warm-start for phase research.
- README roadmap ideas covered recurring reminders, pre-reminder lead time, Outlook bridge, mobile push, daily agenda — superseded or subsumed by the PM direction.

**user context:**

- Senior engineer using Obsidian as primary knowledge base and daily note runtime of truth
- Pain points driving this work: tasks scattered across tools, slow morning triage, context loss between sessions, slipping async follow-ups
- Work context mixes personal and corporate systems — hence gcal + Outlook merged view

## Constraints

- **Tech stack**: TypeScript + Obsidian plugin API — dictated by hosting environment; no framework (React/Vue), plain DOM construction via Obsidian's `createEl` helpers matching existing patterns
- **Platform**: Desktop-only (macOS, Windows, Linux) — Electron notification API and Node `fs` are unavailable on Obsidian mobile; TODO scanner requires filesystem access
- **Persistence**: Local JSON via `plugin.loadData` + markdown mirror files in vault — no external database, no cloud storage
- **Privacy**: All data stays local except read-only calendar pulls; no whiteetry, no third-party services beyond calendar providers
- **Performance**: TODO scanner must not block the plugin thread; single full-vault TODO scan under 2 seconds for a typical monorepo
- **Compatibility**: Keep the existing `Reminder` data shape migratable — do not break user data on upgrade; additive schema changes only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Extend quick-reminder plugin rather than fork or build separate plugin | Scheduler, capture modal, notifications, persistence, and sidebar view are directly reusable; a task with a due time is a reminder | — Pending |
| Unified inbox view is the v1 load-bearing feature | Every other capability feeds it; validates the "one place for actionable items" thesis | — Pending |
| Outlook integration uses ICS feed, not OAuth | Corporate IT rarely grants app registration; ICS works today with a paste-in URL | — Pending |
| Google Calendar uses OAuth | gcal's ICS secret URLs are acceptable but OAuth gives future write-back optionality | — Pending |
| Code TODO scanner uses explicit configured paths, not auto-detect | Deterministic, low-magic, respects the user's trust boundary; avoids walking unintended directories | — Pending |
| Daily note is the dashboard surface, not a dedicated view | Leverages existing daily note habit; the vault is already where triage happens | — Pending |
| No recurring reminders in v1 | Out-of-scope deferral; adds cron-like state management that distracts from inbox core value | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-19 after initialization*
