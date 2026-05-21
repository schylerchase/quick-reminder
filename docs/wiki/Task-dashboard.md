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

## Main actions

- **Show** jumps to the source note and line.
- **In progress** marks a checkbox task as `[/]` and adds an in-progress timestamp.
- **To do** returns a task to `[ ]` and removes status timestamps.
- **Done** marks a task `[x]` and adds a completion timestamp.
- **Ignore** hides a task without deleting it.
- **Add reminder** appears when a task contains a future date phrase.

## Sidebar vs dashboard tab

Use the sidebar when working next to a note. Use the main dashboard tab when you want more room for filtering and review.
