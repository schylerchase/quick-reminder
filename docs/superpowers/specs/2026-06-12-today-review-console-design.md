# Today / Review Console Design

## Status

Approved direction: `Where Am I? + Today Strips`.

Quick Reminder should open by telling the user where they are in the vault, then show what needs attention from that context. The design keeps source notes as truth, shows provenance before action, and adds recovery affordances around note mutations.

## Problem

Quick Reminder 1.0 has reliable reminders, task scanning, source-note actions, Project Planner, mobile QA, and release packaging. The next gap is orientation. The user can open the plugin and still feel like they have to find their own starting point.

The new first screen must answer three questions immediately:

- Where am I working?
- What needs attention from here?
- What will Quick Reminder change if I click this action?

## Anti-Slop Principles

- Do not add AI ranking, fake priority scores, Kanban decoration, or a separate task database.
- Source notes remain the truth. Dashboard state is a view over Markdown, reminders, ignored task records, and local plugin settings.
- Every task-like item shows its source path, heading/category when known, and line number when known.
- Actions that mutate source notes explain the target and change before they run.
- Recovery is visible near the action surface, not hidden in documentation.
- First-run guidance should be operational, not marketing copy.

## First-Open Experience

The default dashboard top section is `Where Am I?`.

When a Markdown note is active, the header shows:

- active note path
- parent folder or selected folder context
- counts for current note tasks, folder tasks, overdue reminders, dated tasks, stale in-progress tasks, and ignored tasks due for review
- quick scope actions: `Work this note`, `Folder`, `Whole vault`

When no Markdown note is active, the header shows:

- `No active note`
- last known Markdown context if available
- action to return to the last context
- action to scan whole vault
- action to create/open starter dashboard

The goal is to orient the user before asking them to process a list.

## Today Console

Below `Where Am I?`, show three compact strips:

1. `Due now`
   - overdue reminders
   - reminders due today
   - dated tasks whose text parses to today or earlier
2. `This context`
   - open tasks from current note first
   - then current folder tasks if note count is low
   - in-progress tasks from current note/folder
3. `Needs review`
   - stale in-progress tasks
   - ignored tasks older than the review window
   - tasks with dates in the past but no linked reminder

Each strip should show a small number of items, with a clear path to expand into the existing full dashboard sections. The full vault task dashboard remains available below these strips or through the scope control.

## Data Model

Add a pure view-model layer before rendering:

```ts
interface ReviewConsoleModel {
  context: ReviewContext;
  dueNow: ConsoleItem[];
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

- `Due now` includes reminders where `dueAt <= endOfToday`, overdue reminders first.
- Dated tasks use the existing reminder parser. A task appears as dated only when parsing returns a concrete future or past date.
- `This context` uses current note tasks before folder tasks. If there is no active Markdown note, it uses the last known context and labels that clearly.
- Stale in-progress starts with tasks marked `in-progress`; MVP can use existing inline metadata when present and otherwise fall back to status only. Do not infer hidden start dates if the source does not contain one.
- Ignored review uses stored ignored task IDs and ignored notes. MVP can use a simple review bucket first; adding per-ignore timestamps can be a later storage migration if needed.

If an item qualifies for multiple strips, use the first matching strip in this order: `Due now`, `This context`, `Needs review`.

## Provenance

Every console item shows source in a stable format:

```text
Projects/Client/SOW.md:42 - ## Today
```

When heading is unknown, show file and line. When line is unavailable for reminders, show reminder source task if linked, otherwise `Standalone reminder`.

`Show source` stays the primary provenance action. It should open the note and line before any mutation action when the user needs confidence.

## Mutation Preview

Risky source-note writes get a lightweight preview before mutation:

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

Low-risk reminder-only actions such as snooze or restore can stay single-click, but they still need visible source or reminder identity.

## Recovery / Undo Log

Add a recent mutation log focused on recovery, not auditing.

MVP:

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
2. `Where Am I?` context panel
3. Three console strips: `Due now`, `This context`, `Needs review`
4. Existing filters and full task sections
5. History / recent mutations

Sidebar:

- Keep the context panel compact.
- Show console strips as stacked sections.
- Prefer two primary actions per item, then a `More` menu or inline wrap for secondary actions.

Mobile:

- Preserve existing compact task-card behavior.
- Context panel stays first.
- Console items are collapsed by default after title, reason, and source.
- Touch targets stay at least 44px.
- Mutation preview uses a modal or bottom-sheet style surface with clear `Cancel` and action buttons.

## Empty, Error, and Degraded States

- No active note: show last context and whole-vault action.
- No due items: show `Nothing due in this context` and keep `This context` visible.
- No current context tasks: show `No tasks in this note` with `Folder` and `Whole vault`.
- Scan failed: keep existing data visible if available, show scan failure, and offer `Scan`.
- Source missing: show the item as unavailable, disable mutation actions, keep `Show source` if the file can still be opened.
- Preview cannot be built: block risky mutation and open the source note.
- Undo unavailable: explain that the source changed and offer to show the source.

## Implementation Boundaries

Do not start by rewriting `src/view.ts`.

MVP implementation should:

- add a pure console model helper under `src/lib`
- test triage and provenance rules with unit tests
- add small renderer methods to `ReminderView`
- wrap existing mutation workflows with preview/recovery where needed
- keep existing dashboard filters, scope settings, and task actions working

Avoid new dependencies. Use Obsidian-native variables and existing Quick Reminder CSS patterns.

## Test Plan

Unit tests:

- builds context from active note, folder, and vault scopes
- places overdue reminders and today reminders in `Due now`
- places current note tasks before folder tasks
- places stale in-progress and ignored tasks in `Needs review`
- avoids duplicate items across strips
- formats source provenance consistently
- blocks undo when expected after text no longer matches source

Workflow tests:

- preview for `Done` shows before/after source line
- confirmed `Done` writes the source and records last mutation
- undo restores the prior source line when safe
- delete preview includes context-note/subtask movement or removal
- source-missing mutation fails with recovery notice

UI QA:

- desktop main dashboard first viewport shows context panel and three strips
- narrow sidebar wraps actions without overflow
- mobile console cards are reachable and expandable
- mutation preview modal is usable at phone width
- accessibility scan covers focus order and button labels

## MVP Scope

Ship `Where Am I? + Today Strips` first:

- context panel
- due/current/review strips
- deterministic triage helper
- source provenance on every console item
- preview for checkbox status changes and delete
- last mutation undo for checkbox status changes

Defer:

- multi-entry recovery log
- per-ignore review timestamps
- full one-task-at-a-time review mode
- configurable review windows
- AI or priority ranking
