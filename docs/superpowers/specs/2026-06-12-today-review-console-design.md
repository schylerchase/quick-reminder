# Daily Cockpit / Review Console Design

## Status

Approved direction: `Daily Cockpit MVP first`.

Quick Reminder should open into a small daily execution cockpit: what is due, what matters in the current note or folder, and what needs a quick review. The broader provenance and recovery layer still matters, but it should follow after the opening experience feels obvious enough for daily use.

## Problem

Quick Reminder 1.0 has reliable reminders, task scanning, source-note actions, Project Planner, mobile QA, and release packaging. The next gap is orientation. The user can open the plugin and still feel like they have to find their own starting point.

The new first screen must answer three questions immediately:

- What needs attention today?
- Where am I working?
- What is the next obvious action?

## Anti-Slop Principles

- Do not add AI ranking, fake priority scores, Kanban decoration, or a separate task database.
- Source notes remain the truth. Dashboard state is a view over Markdown, reminders, ignored task records, and local plugin settings.
- Every task-like item shows its source path, heading/category when known, and line number when known.
- Source-changing actions should stay visibly tied to their source, even before the full mutation preview layer ships.
- Recovery should become visible near the action surface in the follow-up safety slice, not hidden in documentation.
- First-run guidance should be operational, not marketing copy.

## MVP Scope

The first implementation slice is `Daily Cockpit`.

Ship now:

- `Today` strip for overdue and due-today work
- `Current context` strip for active note, folder, or last known context
- `Needs review` strip for stale or hidden work that should not disappear forever
- source provenance on every cockpit item
- direct paths into the existing full dashboard
- desktop, phone, and iPad-width layout coverage

Defer:

- mutation preview modals
- undo/recovery log
- richer ignored-task aging and migrations
- AI ranking or prioritization

## First-Open Experience

The default dashboard top section is `Daily Cockpit`.

The section order is fixed:

1. `Today`
2. `Current context`
3. `Needs review`

This order should not depend on AI or hidden scoring. It mirrors the daily habit: handle urgent work, then continue where you are, then clean up anything stale.

Above the strips, show a compact `Where am I?` line. This is orientation, not a separate panel competing with Today.

When a Markdown note is active, the header shows:

- active note path
- parent folder or selected folder context
- small counts for today, current note, current folder, and needs review
- quick scope actions: `This note`, `Folder`, `Whole vault`

When no Markdown note is active, the header shows:

- `No active note`
- last known Markdown context if available
- action to return to the last context
- action to scan whole vault
- action to create/open starter dashboard

The goal is to orient the user and make the first next action obvious before asking them to process the full dashboard.

## Today Console

Show three compact strips:

1. `Today`
   - overdue reminders
   - reminders due today
   - dated tasks whose text parses to today or earlier
2. `Current context`
   - open tasks from current note first
   - then current folder tasks if note count is low
   - in-progress tasks from current note/folder
3. `Needs review`
   - stale in-progress tasks
   - ignored tasks older than the review window
   - tasks with dates in the past but no linked reminder

Each strip should show at most five items on desktop and at most three on phone. Each strip has a clear `View all` path into the existing dashboard scope or filtered section. The full vault task dashboard remains below the cockpit.

## Data Model

Add a pure view-model layer before rendering:

```ts
interface ReviewConsoleModel {
  context: ReviewContext;
  today: ConsoleItem[];
  currentContext: ConsoleItem[];
  needsReview: ConsoleItem[];
  counts: ReviewCounts;
}

interface ReviewContext {
  activeFilePath: string | null;
  folderPath: string | null;
  selectedScope: "active" | "folder" | "vault";
  hasActiveMarkdownFile: boolean;
}

interface ConsoleItem {
  id: string;
  kind: "reminder" | "task" | "ignored-task";
  title: string;
  source: SourceProvenance;
  reason: string;
  actions: ConsoleAction[];
}

interface SourceProvenance {
  filePath: string | null;
  heading: string | null;
  line: number | null;
  taskId: string | null;
}
```

The model should be created in `src/lib/todayReviewConsole.ts` or similar, with focused tests. `src/view.ts` should render the model, not own the triage rules inline.

## Triage Rules

Rules must be deterministic and explainable:

- `Today` includes reminders where `dueAt <= endOfToday`, overdue reminders first.
- Dated tasks use the existing reminder parser. A task appears as dated only when parsing returns a concrete future or past date.
- `Current context` uses current note tasks before folder tasks. If there is no active Markdown note, it uses the last known context and labels that clearly.
- Stale in-progress starts with tasks marked `in-progress`; MVP can use existing inline metadata when present and otherwise fall back to status only. Do not infer hidden start dates if the source does not contain one.
- Ignored review uses stored ignored task IDs and ignored notes. MVP can use a simple review bucket first; adding per-ignore timestamps can be a later storage migration if needed.

If an item qualifies for multiple strips, use the first matching strip in this order: `Today`, `Current context`, `Needs review`.

## Provenance

Every console item shows source in a stable format:

```text
Projects/Client/SOW.md:42 - ## Today
```

When heading is unknown, show file and line. When line is unavailable for reminders, show reminder source task if linked, otherwise `Standalone reminder`.

`Show source` stays the primary provenance action. It should open the note and line before any mutation action when the user needs confidence.

## Mutation Preview

Risky source-note writes get a lightweight preview before mutation in the follow-up safety slice:

- `Done`
- `To do`
- `In progress`
- `Delete`
- text edit
- heading/category rename

Preview content should include:

- source file path and line
- action summary
- before line or block
- after line or block
- explicit note when context notes/subtasks move with the task

For the Daily Cockpit MVP, these actions can keep the existing behavior, but cockpit items must show source provenance beside the action controls so the user understands what note will change.

## Recovery / Undo Log

Add a recent mutation log focused on recovery, not auditing.

Follow-up safety slice:

- Keep the most recent source-note mutation in memory and plugin data.
- Show a small `Last change` row after a mutation.
- Offer `Undo` when Quick Reminder can safely restore the previous content.
- Offer `Show changed source` for all logged mutations.

Later:

- Store a bounded list of recent mutations.
- Include timestamp, action, source file, before text, after text, and whether undo is still available.
- Expire undo when the source no longer matches the expected after state.

Undo must be conservative: if the file changed since the mutation, do not apply the reverse write. Explain that the source changed and open the note instead.

## UI Layout

Desktop main dashboard:

1. Header: `Quick Reminder`
2. Compact `Where am I?` context line
3. Three cockpit strips: `Today`, `Current context`, `Needs review`
4. Existing filters and full task sections
5. History / recent mutations, after the safety slice ships

Sidebar:

- Keep the context line compact.
- Show cockpit strips as stacked sections.
- Prefer two primary actions per item, then a `More` menu or inline wrap for secondary actions.

Mobile:

- Preserve existing compact task-card behavior.
- Context line stays first.
- Console items are collapsed by default after title, reason, and source.
- Touch targets stay at least 44px.
- Mutation preview, after the safety slice ships, uses a modal or bottom-sheet style surface with clear `Cancel` and action buttons.

## Empty, Error, and Degraded States

- No active note: show last context and whole-vault action.
- No due items: show `Nothing due today` and keep `Current context` visible.
- No current context tasks: show `No tasks in this note` with `Folder` and `Whole vault`.
- Scan failed: keep existing data visible if available, show scan failure, and offer `Scan`.
- Source missing: show the item as unavailable, disable mutation actions, keep `Show source` if the file can still be opened.
- Preview cannot be built, after the safety slice ships: block risky mutation and open the source note.
- Undo unavailable, after the safety slice ships: explain that the source changed and offer to show the source.

## Implementation Boundaries

Do not start by rewriting `src/view.ts`.

MVP implementation should:

- add a pure console model helper under `src/lib`
- test triage and provenance rules with unit tests
- add small renderer methods to `ReminderView`
- reuse existing mutation workflows without adding preview/recovery yet
- keep existing dashboard filters, scope settings, and task actions working

Avoid new dependencies. Use Obsidian-native variables and existing Quick Reminder CSS patterns.

## Test Plan

Unit tests:

- builds context from active note, folder, and vault scopes
- places overdue reminders and today reminders in `Today`
- places current note tasks before folder tasks
- places stale in-progress and ignored tasks in `Needs review`
- avoids duplicate items across strips
- formats source provenance consistently
- handles no active note with last-context and whole-vault actions
- preserves phone compact behavior and iPad-width non-phone layout

Workflow tests:

- dashboard `View all` actions move from cockpit strips to the existing full dashboard sections
- source-missing cockpit items disable mutation actions and keep source recovery visible

UI QA:

- desktop main dashboard first viewport shows context line and three cockpit strips
- narrow sidebar wraps actions without overflow
- mobile cockpit cards are reachable and expandable
- iPad-width `is-mobile` without `is-phone` does not use the phone-compressed task layout
- accessibility scan covers focus order and button labels
