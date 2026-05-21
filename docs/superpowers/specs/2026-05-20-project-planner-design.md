# Project Planner Design

## Status

Approved direction: hybrid bulk outline plus editable preview.

This feature adds a Project Planner module to Quick Reminder so a user can create a whole project note in one pass instead of creating categories and tasks one click at a time.

## Goal

The Project Planner should turn a rough project outline into normal Obsidian markdown tasks that Quick Reminder already scans. It should not create a separate task database, hidden task store, or cloud dependency.

## Entry Point

Add a `Project Planner` choice to the existing `New` flow in the Quick Reminder task manager.

The planner opens a modal with:

- `Project name`
- `Target note`
- `Bulk outline` textarea
- `Editable preview`
- `Cancel`
- `Copy markdown`
- `Create project note`

The preview should be editable in the first implementation. Phase names and task text use compact text inputs, and task notes or subtasks use small textareas. Dates remain part of task text, with detected date chips shown beside the task so the user can see what Quick Reminder will recognize.

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

The planner writes a normal markdown note:

```markdown
# Client onboarding

## Intake
- [ ] Collect access by Friday 3pm
  - confirm VPN
  - confirm billing contact
- [ ] Review current docs due 2026-05-25

## Build
- [ ] Create runbook tomorrow 10am
- [ ] Validate monitoring

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
  - calls the writer only after explicit save
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

The first slice only needs `todo` output, but the model leaves room for `/` and `x` status support if the parser recognizes those later.

## Error Handling

- Empty project title: keep the save button disabled and show a short inline validation message.
- Empty target note: derive one from the project title.
- Existing note: block save in the first slice with a clear message. Appending to existing notes can be added later with an explicit confirmation flow.
- Parent folders missing: create them before writing the note.
- Parser ambiguity: keep the original outline visible so the user can fix it before saving.

## Testing

Unit tests should cover:

- project/file metadata parsing
- phases and task grouping
- indented subtasks as notes
- rendering to markdown checkboxes
- target path normalization
- empty input validation

Manual verification should cover:

- open Project Planner from `New`
- paste the sample outline
- create a project note in a safe test vault
- scan dashboard and confirm tasks appear under phases
- confirm dated tasks can use the existing `Add reminder` flow
- confirm no reminders are scheduled during bulk creation
