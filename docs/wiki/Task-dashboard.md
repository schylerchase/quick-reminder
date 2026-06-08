# Task Dashboard

The task dashboard scans Markdown notes for task-like lines and lets you work them without moving away from your current note.

## Supported task lines

```md
- [ ] To do item
- [/] In progress item
- [x] Completed item
TODO: marker item
FIXME: marker item
TASK: marker item
```

It also understands status metadata such as:

```md
[completion:: 2026-05-21 14:30]
[inProgress:: 2026-05-21 14:30]
```

## Scopes

| Scope | Meaning |
|---|---|
| Current file | Show tasks from the active Markdown note |
| Current folder | Show tasks under the active or selected folder |
| Whole vault | Show tasks from all Markdown notes |

If **Current file** or **Current folder** is empty while matching vault tasks exist elsewhere, the empty task section shows **Show whole vault**.

The dashboard remembers the last scope, search, source filter, sort order, and active note context. If the remembered file or folder is gone, it falls back to **Whole vault** rather than opening into a confusing empty list.

## Filters and sorting

- The search box filters by task text, file path, category, project, status, and source context.
- **All sources**, **Checkboxes**, and **markers** switch between markdown checkbox tasks and `TODO:` / `FIXME:` / `TASK:` lines.
- **Page order** keeps tasks grouped by note and heading.
- **Priority** sorts the visible cards by priority signals such as Tasks-style priority fields, priority tags, `p0`/`p1`, exclamation markers, or priority emoji, then falls back to page order.

## Main actions

- **New** creates a task, reminder task, or Project Planner note.
- **Show** jumps to the source note and line.
- **Edit** updates the task line in the source note. If Tasks plugin integration is enabled and available, Quick Reminder opens the Tasks editor; otherwise it uses its own inline text editor.
- **Note** edits dashboard-only task notes stored beside the source task.
- **In progress** marks a checkbox task as `[/]` and adds an in-progress timestamp.
- **To do** returns a task to `[ ]` and removes status timestamps.
- **Done** marks a task `[x]` and adds a completion timestamp.
- **Delete** removes the task line from the source note.
- **Ignore** hides a task without deleting it.
- **Add reminder** appears when a task contains a future date phrase.
- **Reminder set** appears on a task card after a linked reminder exists.

Once **Reminder set** appears, Quick Reminder blocks another active linked reminder for that same source task. Complete, restore, or delete the existing reminder from the manager before creating another one.

Right-click a file or folder in Obsidian's file explorer to show that file or folder in Quick Reminder. The **Reveal active file in file explorer** command expands and highlights the current note when the Files core plugin is available.

## Sidebar vs dashboard tab

Use the sidebar when working next to a note. Use the main dashboard tab when you want more room for filtering and review.

## Project Planner handoff

Project Planner creates normal Markdown task lines, opens the new note, and refreshes the dashboard. Dated tasks then use the same **Add reminder** action as manually written tasks.
