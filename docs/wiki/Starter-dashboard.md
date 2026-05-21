# Starter Dashboard

The starter dashboard is an opt-in first-run board for new users who want a working task dashboard immediately.

## Create it

Use either path:

- Command palette -> **Quick Reminder: Start with template dashboard**
- Settings -> **Quick Reminder -> Starter dashboard -> Create/open starter board**

By default the file is:

```text
Quick Reminder Dashboard.md
```

If the file already exists, Quick Reminder opens it instead of overwriting it.

## What gets configured

When you start with the template, Quick Reminder:

- creates a managed Markdown board with sample tasks;
- configures the task headings to `Today`, `In Progress`, `Waiting`, `Someday`, and `Completed`;
- opens the board in the main pane;
- opens the Quick Reminder dashboard focused on that board.

## Replace the samples

The starter board is not sacred machinery. Treat it like a seed crystal:

1. Rename headings to match your workflow.
2. Replace sample tasks with real tasks.
3. Delete sections you do not need.
4. Keep the managed block if you like the generated mirror.
5. Delete the whole file when you outgrow it.

## Source of truth

Tasks above the managed block are the source of truth. The block between these delimiters is generated:

```md
<!-- qr:tasks:start -->
...
<!-- qr:tasks:end -->
```

Prefer editing tasks above the block. The generated block is the dashboard mirror.
