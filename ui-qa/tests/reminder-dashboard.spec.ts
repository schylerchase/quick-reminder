import { expect, test } from "@playwright/test";
import { pathToFileURL } from "node:url";
import path from "node:path";

const scenarioUrl = pathToFileURL(
  path.join(__dirname, "../scenarios/reminder-dashboard.html"),
).toString();

test("dashboard reminder row keeps text readable beside lifecycle actions", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 860 });
  await page.goto(scenarioUrl);

  const row = page.locator("[data-qa='upcoming-reminder-row']");
  const body = page.locator("[data-qa='upcoming-reminder-body']");
  const title = row.getByText("Codex disposable lifecycle reminder");
  const actions = page.locator("[data-qa='upcoming-reminder-actions']");

  await expect(title).toBeVisible();
  for (const name of ["Done", /Snooze/, "Edit", "Delete"]) {
    await expect(actions.getByRole("button", { name })).toBeVisible();
  }

  const layout = await row.evaluate((el) => {
    const bodyEl = el.querySelector<HTMLElement>("[data-qa='upcoming-reminder-body']");
    const titleEl = bodyEl?.querySelector<HTMLElement>(".qr-view-row-text");
    const actionsEl = el.querySelector<HTMLElement>("[data-qa='upcoming-reminder-actions']");
    if (!bodyEl || !titleEl || !actionsEl) return null;
    const rowBox = el.getBoundingClientRect();
    const bodyBox = bodyEl.getBoundingClientRect();
    const titleBox = titleEl.getBoundingClientRect();
    const actionsBox = actionsEl.getBoundingClientRect();
    return {
      bodyWidth: bodyBox.width,
      titleHeight: titleBox.height,
      titleWidth: titleBox.width,
      actionsBelowBody: actionsBox.top >= bodyBox.bottom - 1,
      rowOverflows: el.scrollWidth > Math.ceil(rowBox.width),
    };
  });

  expect(layout).not.toBeNull();
  expect(layout?.bodyWidth).toBeGreaterThan(220);
  expect(layout?.titleWidth).toBeGreaterThan(220);
  expect(layout?.titleHeight).toBeLessThan(80);
  expect(layout?.actionsBelowBody).toBe(true);
  expect(layout?.rowOverflows).toBe(false);
});
