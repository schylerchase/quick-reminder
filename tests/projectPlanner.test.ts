import test from "node:test";
import assert from "node:assert/strict";
import {
  parseProjectOutline,
  renderProjectPlanMarkdown,
  normalizeProjectFilePath,
  validateProjectPlan,
} from "../src/lib/projectPlanner";
import {
  DELIMITER_END,
  DELIMITER_START,
} from "../src/lib/managedTasksBlock";

const sampleOutline = [
  "Project: Client onboarding",
  "File: Projects/Client onboarding.md",
  "",
  "## Intake",
  "- Collect access by Friday 3pm",
  "  - confirm VPN",
  "  - confirm billing contact",
  "- Review current docs due 2026-05-25",
  "",
  "## Build",
  "- Create runbook tomorrow 10am",
  "- Validate monitoring",
].join("\n");

test("parses project metadata, phases, tasks, and indented notes", () => {
  const plan = parseProjectOutline(sampleOutline);

  assert.equal(plan.title, "Client onboarding");
  assert.equal(plan.filePath, "Projects/Client onboarding.md");
  assert.deepEqual(
    plan.phases.map((phase) => phase.name),
    ["Intake", "Build"],
  );
  assert.equal(plan.phases[0].tasks[0].text, "Collect access by Friday 3pm");
  assert.deepEqual(plan.phases[0].tasks[0].notes, [
    "confirm VPN",
    "confirm billing contact",
  ]);
  assert.equal(plan.phases[1].tasks[1].status, "todo");
});

test("renders a normal project note with source tasks and an empty managed block", () => {
  const plan = parseProjectOutline(sampleOutline);
  const markdown = renderProjectPlanMarkdown(plan);

  assert.equal(
    markdown,
    [
      "# Client onboarding",
      "",
      "## Intake",
      "- [ ] Collect access by Friday 3pm",
      "  - confirm VPN",
      "  - confirm billing contact",
      "- [ ] Review current docs due 2026-05-25",
      "",
      "## Build",
      "- [ ] Create runbook tomorrow 10am",
      "- [ ] Validate monitoring",
      "",
      DELIMITER_START,
      DELIMITER_END,
      "",
    ].join("\n"),
  );
});

test("normalizes target paths and derives a note path from the project title", () => {
  assert.equal(
    normalizeProjectFilePath(" Projects\\Client onboarding ", "Fallback"),
    "Projects/Client onboarding.md",
  );
  assert.equal(
    normalizeProjectFilePath("", "Client onboarding"),
    "Client onboarding.md",
  );
  assert.equal(
    normalizeProjectFilePath("Projects/Already.md", "Fallback"),
    "Projects/Already.md",
  );
});

test("validates title, tasks, and unsafe target paths", () => {
  assert.deepEqual(validateProjectPlan(parseProjectOutline("")), [
    "Add a project name.",
    "Add at least one task.",
  ]);

  const unsafe = parseProjectOutline([
    "Project: Escape attempt",
    "File: ../outside.md",
    "## Tasks",
    "- Do the thing",
  ].join("\n"));

  assert.deepEqual(validateProjectPlan(unsafe), [
    "Use a vault-relative note path.",
  ]);

  const absolute = parseProjectOutline([
    "Project: Absolute attempt",
    "File: /Projects/outside.md",
    "## Tasks",
    "- Do the thing",
  ].join("\n"));

  assert.deepEqual(validateProjectPlan(absolute), [
    "Use a vault-relative note path.",
  ]);
});
