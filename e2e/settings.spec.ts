import { expect, test } from "@playwright/test";
import { installBrowserMocks } from "./fixtures";
import { DEFAULT_SCHEDULER_PREFERENCES } from "@/lib/scheduler/types";

test.describe("Settings controls", () => {
  test("uses a dropdown for the planning timezone", async ({ page }) => {
    await installBrowserMocks(page);
    await page.goto("/settings");

    const timezone = page.locator("select#settings-planning-timezone");
    await expect(timezone).toBeVisible();
    await expect(timezone).toHaveValue("UTC");
    await expect(timezone.locator('option[value="Asia/Dhaka"]')).toHaveCount(1);

    await timezone.selectOption("Asia/Dhaka");
    await expect(timezone).toHaveValue("Asia/Dhaka");
  });

  test("marks manual windows that Night Owl moves to the next weekday", async ({ page }) => {
    await installBrowserMocks(page, {
      schedulerSettings: {
        ...DEFAULT_SCHEDULER_PREFERENCES,
        workWindows: {
          ...DEFAULT_SCHEDULER_PREFERENCES.workWindows,
          "1": [
            { start: "00:00", end: "15:00" },
            { start: "13:00", end: "18:00" },
          ],
        },
      },
    });
    await page.goto("/settings");

    const monday = page.locator(".hu-work-window-row").filter({ has: page.getByText("Monday", { exact: true }) });
    await expect(monday.locator(".hu-work-window")).toHaveCount(2);
    await expect(monday.locator(".hu-work-window").nth(0).locator(".hu-work-window-night-owl")).toHaveCount(0);

    await page.locator("#night-owl-mode").check();
    await expect(monday.locator(".hu-work-window").nth(0).locator(".hu-work-window-night-owl")).toHaveAttribute(
      "aria-label",
      "Night Owl moves this window to Tuesday.",
    );
    await expect(monday.locator(".hu-work-window").nth(0).locator(".hu-work-window-night-owl")).toHaveAttribute(
      "title",
      "Night Owl moves this window to Tuesday.",
    );
    await expect(monday.locator(".hu-work-window").nth(1).locator(".hu-work-window-night-owl")).toHaveCount(0);

    await page.locator("#settings-day-start").fill("07:00");
    await expect(monday.locator(".hu-work-window").nth(0).locator(".hu-work-window-night-owl")).toHaveAttribute(
      "aria-label",
      "Night Owl moves this window to Tuesday.",
    );

    await monday.locator('input[aria-label="Monday window 1 start"]').fill("07:00");
    await expect(monday.locator(".hu-work-window").nth(0).locator(".hu-work-window-night-owl")).toHaveCount(0);

    await page.locator("#night-owl-mode").uncheck();
    await expect(monday.locator(".hu-work-window").nth(0).locator(".hu-work-window-night-owl")).toHaveCount(0);
  });
});
