# Project Planner

Project Planner creates a new project note from a rough outline.

## Open it

1. Open **Quick Reminder: Open reminder manager**.
2. Click **New**.
3. Choose **Project Planner**.

## Outline format

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

Supported lines:

- `Project:` sets the note title.
- `File:` sets the vault-relative target note path.
- `## Heading` creates a phase.
- `- task text` creates a task.
- Indented bullets become notes or subtasks under the previous task.

## Before saving

Use the editable preview to adjust phase names, task text, and notes before creating the note. Detected dates appear beside task text so you can see what the normal **Add reminder** flow can recognize later.

## What gets created

Project Planner writes a normal Markdown note with unchecked tasks and a managed task block. The dashboard scans the new note after saving.

It does not schedule reminders automatically, and it does not append into existing notes. If the target note already exists, choose a different file path.
