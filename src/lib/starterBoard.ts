import { DEFAULT_STARTER_BOARD_FILE_PATH } from "../types";
import { insertEmptyManagedBlock } from "./managedTasksBlock";
import { regenerateManagedBlock } from "./managedTasksOps";

export { DEFAULT_STARTER_BOARD_FILE_PATH };

export const STARTER_BOARD_HEADINGS = [
  "Today",
  "In Progress",
  "Waiting",
  "Someday",
  "Completed",
];

/**
 * Build the opt-in first-run dashboard.
 *
 * The tasks above the managed block are canonical. The managed block mirrors
 * those tasks so users get a ready-made dashboard without a hidden database or
 * surprise automation. Everything in this file is intentionally replaceable.
 */
export function buildStarterBoardMarkdown(now = new Date()): string {
  const completedStamp = formatMarkdownDateTime(now);
  const sourceBoard = [
    "# Quick Reminder Dashboard",
    "",
    "> This is a replaceable starter board. Edit, delete, or rename anything here once your real workflow takes over.",
    "",
    "## Today",
    "",
    "- [ ] Capture one real task with a date, e.g. `send status update tomorrow 9am`",
    "- [ ] Open the Quick Reminder dashboard and try **Add reminder** on a dated task",
    "",
    "## In Progress",
    "",
    "- [/] Customize this starter board for your workflow",
    "",
    "## Waiting",
    "",
    "- [ ] Waiting on someone? Add the follow-up here, e.g. `follow up Friday 2pm`",
    "",
    "## Someday",
    "",
    "- [ ] Replace these samples with your own low-pressure backlog",
    "",
    "## Completed",
    "",
    `- [x] Installed Quick Reminder [completion:: ${completedStamp}]`,
    "",
  ].join("\n");

  const boardWithManagedBlock = regenerateManagedBlock(
    insertEmptyManagedBlock(sourceBoard),
  ).trimEnd();

  return `${boardWithManagedBlock}

## How this board works

- The tasks above the \`<!-- qr:tasks:start -->\` marker are the source of truth.
- The managed block mirrors those tasks so the note behaves like a small task board.
- You can replace every sample task with your own tasks.
- You can rename the headings, add new headings, or delete this whole file when you outgrow it.

`;
}

function formatMarkdownDateTime(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}
