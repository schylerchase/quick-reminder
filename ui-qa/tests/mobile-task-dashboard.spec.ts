import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";

const scenarioUrl = pathToFileURL(
  path.join(__dirname, "../scenarios/mobile-task-dashboard.html"),
).toString();
const firstRunScenarioUrl = pathToFileURL(
  path.join(__dirname, "../scenarios/first-run-dashboard.html"),
).toString();
const scopedEmptyScenarioUrl = pathToFileURL(
  path.join(__dirname, "../scenarios/scoped-empty-dashboard.html"),
).toString();
const taskReminderContextScenarioUrl = pathToFileURL(
  path.join(__dirname, "../scenarios/task-reminder-context.html"),
).toString();

test.beforeEach(async ({ page }) => {
  await page.goto(scenarioUrl);
});

test("mobile task cards expand to reveal details and actions", async ({ page }) => {
  const list = page.getByLabel("Open tasks");
  const firstTask = page.locator("[data-qa='task-card']").first();

  await expect(firstTask.locator(".qr-view-row-actions")).toBeHidden();
  await firstTask.locator(".qr-mobile-task-toggle").click();
  await expect(firstTask).toHaveClass(/qr-mobile-task-expanded/);
  await expect(firstTask.locator(".qr-view-row-actions")).toBeVisible();
  await expect(list).toHaveScreenshot("quick-reminder-mobile-task-expanded.png");
});

test.describe("narrow desktop panes", () => {
  test.use({
    viewport: { width: 210, height: 852 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
  });

  test("desktop task action labels stay inside narrow pane buttons", async ({ page }) => {
    await page.evaluate(() => {
      document.body.classList.remove("is-mobile", "is-phone");
      const root = document.querySelector<HTMLElement>("[data-qa='fixture-root']");
      root?.classList.remove("qr-mobile-compact-tasks");

      const buttons = document.querySelectorAll<HTMLButtonElement>(
        "[data-qa='task-card'] .qr-view-row-actions .qr-row-btn",
      );
      const finalButton = buttons.item(7);
      finalButton.disabled = false;
      finalButton.classList.remove("qr-no-time-btn");
      finalButton.textContent = "Add reminder";
      finalButton.setAttribute("aria-label", "Add reminder for this task");
    });

    const firstTask = page.locator("[data-qa='task-card']").first();
    await expect(firstTask.getByRole("button", { name: "Add reminder for this task" })).toBeVisible();

    const layout = await firstTask.locator(".qr-view-row-actions").evaluate((actions) => {
      const buttons = Array.from(actions.querySelectorAll<HTMLButtonElement>(".qr-row-btn"));
      return {
        actionsOverflow: actions.scrollWidth > actions.clientWidth,
        overflowingButtons: buttons
          .filter((button) => button.scrollWidth > button.clientWidth)
          .map((button) => ({
            label: button.textContent?.trim() ?? "",
            clientWidth: button.clientWidth,
            scrollWidth: button.scrollWidth,
          })),
      };
    });

    expect(layout.actionsOverflow).toBe(false);
    expect(layout.overflowingButtons).toEqual([]);
  });
});

test("first-run actions stay reachable on a phone viewport", async ({ page }) => {
  await page.goto(firstRunScenarioUrl);

  const panel = page.locator("[data-qa='first-run-panel']");

  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Start with template" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "New reminder" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "New task" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Project Planner" })).toBeVisible();

  const overflows = await panel.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflows).toBe(false);
});

test("scoped empty dashboard offers reachable vault fallback", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(scopedEmptyScenarioUrl);

  const section = page.locator("[data-qa='scoped-empty-section']");
  const fallback = section.getByRole("button", { name: "Show whole vault" });

  await expect(section).toBeVisible();
  await expect(section.getByText("No tasks in this note.")).toBeVisible();
  await expect(fallback).toBeVisible();

  const overflows = await section.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflows).toBe(false);
});

test("linked task reminder context is visible before expanding mobile actions", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(taskReminderContextScenarioUrl);

  const task = page.locator("[data-qa='linked-reminder-task']");

  await expect(task.getByText("Reminder set")).toBeVisible();
  await expect(task.locator(".qr-view-row-actions")).toBeHidden();
  await expect(task.getByRole("button", { name: "Reminder already added for this task" })).toBeHidden();

  const overflows = await task.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflows).toBe(false);
});

test("show source closes the mobile drawer", async ({ page }) => {
  const firstTask = page.locator("[data-qa='task-card']").first();

  await firstTask.locator(".qr-mobile-task-toggle").click();
  await page.locator("[data-qa='show-source']").click();

  await expect(page.locator("[data-qa='source-note']")).toBeVisible();
  await expect(page.locator("[data-qa='mobile-drawer']")).not.toHaveClass(/is-open/);
});

test("edit task modal fits a phone viewport without auto-focusing notes", async ({ page }) => {
  await page.evaluate(() => (window as unknown as { showEditModal: () => void }).showEditModal());

  const modal = page.locator("[data-qa='edit-modal']");
  await expect(modal).toBeVisible();
  await expect(page.locator("#qa-task-note")).not.toBeFocused();

  const box = await modal.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(852);
  await expect(page.locator("[data-qa='edit-stage']")).toHaveScreenshot("quick-reminder-mobile-edit-modal.png");
});

test("mobile dashboard has no serious accessibility violations", async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .include("[data-qa='fixture-root']")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  const serious = results.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious).toEqual([]);
});
