import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";

const scenarioUrl = pathToFileURL(
  path.join(__dirname, "../scenarios/quick-capture.html"),
).toString();

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(scenarioUrl);
});

test("quick capture modal keeps preview and actions reachable on a small phone", async ({ page }) => {
  const modal = page.locator("[data-qa='quick-capture']");
  const actions = page.locator("[data-qa='capture-actions']");

  await expect(modal.getByRole("heading", { name: "New reminder" })).toBeVisible();
  await expect(page.getByLabel("Reminder")).toBeVisible();
  await expect(page.getByText("Ready to create")).toBeVisible();
  await expect(actions.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Create reminder" })).toBeVisible();

  const overflowing = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-qa='fixture-root']");
    if (!root) return ["missing fixture root"];
    const rootBox = root.getBoundingClientRect();
    return Array.from(root.querySelectorAll<HTMLElement>("*"))
      .filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && (box.left < rootBox.left - 1 || box.right > rootBox.right + 1);
      })
      .map((node) => node.className || node.tagName);
  });
  expect(overflowing).toEqual([]);

  const actionBox = await actions.boundingBox();
  expect(actionBox).not.toBeNull();
  expect((actionBox?.y ?? 0) + (actionBox?.height ?? 0)).toBeLessThanOrEqual(720);
});

test("quick capture modal has no serious accessibility violations", async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .include("[data-qa='fixture-root']")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  const serious = results.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious).toEqual([]);
});
