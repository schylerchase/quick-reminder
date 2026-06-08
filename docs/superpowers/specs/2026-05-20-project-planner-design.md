# Project Planner Design

## Status

Approved direction: hybrid bulk outline plus editable preview.

Implementation status: built in Quick Reminder. The planner opens from `New`, writes a new Markdown note, opens the note, refreshes the dashboard, and protects existing target notes from overwrite.

This feature adds a Project Planner module to Quick Reminder so a user can create a whole project note in one pass instead of creating categories and tasks one click at a time.

## Goal

The Project Planner turns a rough project outline into normal Obsidian Markdown tasks that Quick Reminder already scans. It does not create a separate task database, hidden task store, or cloud dependency.

## Entry Point

The existing `New` flow in the Quick Reminder task manager includes a `Project Planner` choice.

The planner opens a modal with:

- `Project name`
- `Target note`
- `Bulk outline` textarea
- `Editable preview`
- `Cancel`
- `Copy markdown`
- `Create project note`

The preview is editable. Phase names and task text use compact text inputs, and task notes or subtasks use small textareas. Dates remain part of task text, with detected date chips shown beside the task so the user can see what Quick Reminder will recognize.

## Input Format

The parser accepts a forgiving markdown-like outline:

```text
Project: Client onboarding
File: Projects/Client onboarding.md

## Intake
- Collect access by Friday 3pm
  - confirm VPN
  - confirm billing contact
- Review current docs due 2026-05-25

## Build
- Create runbook tomorrow 10am
- Validate monitoring
```

Supported fields:

- `Project:` sets the project title.
- `File:` sets the target note path.
- `## Heading` creates a phase or category.
- `- task text` creates a checkbox task.
- Indented bullets below a task become task context notes or subtasks.
- Natural-language dates stay in the task text so existing Quick Reminder date detection can find them.

## Output Format

The planner writes a normal markdown note. The example uses `[todo]`
markers so this spec does not appear in editor task indexes; generated project
notes should render those entries as unchecked markdown tasks.

```text
# Client onboarding

## Intake
- [todo] Collect access by Friday 3pm
  - confirm VPN
  - confirm billing contact
- [todo] Review current docs due 2026-05-25

## Build
- [todo] Create runbook tomorrow 10am
- [todo] Validate monitoring

<!-- qr:tasks:start -->
<!-- qr:tasks:end -->
```

After writing, the existing scanner reads these tasks and the dashboard shows them with normal task actions.

## Reminder Behavior

Bulk creation should not schedule reminders automatically.

Tasks with detectable future dates should appear in the dashboard with the existing `Add reminder` action. This keeps bulk project creation safe and avoids accidentally scheduling many notifications from a pasted outline.

## Architecture

Add a small parser/writer layer, separate from the modal:

- `projectPlanner.ts`
  - parses outline text into a `ProjectPlan`
  - renders `ProjectPlan` back to markdown
  - normalizes target note paths
  - validates empty title, empty tasks, and invalid target paths
- `ProjectPlannerModal`
  - owns UI state
  - updates parsed preview as the outline changes
  - calls the writer only after explicit copy or save
- `ReminderView`
  - adds the planner entry point to the `New` flow
  - refreshes scanned tasks after project creation

Keep all parsing and rendering pure so it can be tested without Obsidian.

## Data Model

```ts
interface ProjectPlan {
  title: string;
  filePath: string;
  phases: ProjectPhase[];
}

interface ProjectPhase {
  name: string;
  tasks: ProjectTask[];
}

interface ProjectTask {
  text: string;
  notes: string[];
  status: "todo" | "in-progress" | "completed";
}
```

The planner renders `todo`, `/`, and `x` statuses when the outline contains checkbox syntax.

## Error Handling

- Empty project title: keep the save button disabled and show a short inline validation message.
- Empty target note: derive one from the project title.
- Existing note: block save with a clear message so Project Planner never overwrites or appends to a note without an explicit new target path.
- Parent folders missing: create them before writing the note.
- Parser ambiguity: keep the original outline visible so the user can fix it before saving.

## Testing

Unit tests should cover:

- project/file metadata parsing
- phases and task grouping
- indented subtasks as notes
- rendering to markdown checkboxes
- target path normalization and vault-relative validation
- empty input validation

Manual verification should cover:

- open Project Planner from `New`
- paste the sample outline
- create a project note in a safe test vault
- scan dashboard and confirm tasks appear under phases
- confirm dated tasks can use the existing `Add reminder` flow
- confirm no reminders are scheduled during bulk creation
- verify the modal on narrow mobile width so the action buttons remain reachable
