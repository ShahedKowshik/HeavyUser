import { expect, test } from "@playwright/test";
import { installBrowserMocks } from "./fixtures";

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
});
