# Managed Task Boards

Managed task boards are Markdown files with a generated task mirror block.

## Delimiters

Quick Reminder recognizes this block:

```md
<!-- qr:tasks:start -->
...
<!-- qr:tasks:end -->
```

## How it works

Tasks above the block are canonical. Quick Reminder regenerates the managed block from those source tasks when requested by commands or UI actions.

This keeps the dashboard Markdown-native:

- no hidden task database;
- no surprise rewrites of unrelated notes;
- easy replacement by the user;
- easy backup through normal vault sync.

## Commands

| Command | Behavior |
|---|---|
| Insert managed tasks block here | Adds a block if the current note has tasks |
| Regenerate managed tasks block | Rebuilds the block from tasks above it |
| Remove managed tasks block | Removes the generated block |

## Auto-insert

Settings can auto-insert managed blocks for notes in selected folders. This is off by default. Use it only for folders where you want Quick Reminder to manage task-board structure.

## Safe editing rule

Edit tasks above the block. Treat the block itself as generated output unless you are deliberately replacing the board design.
