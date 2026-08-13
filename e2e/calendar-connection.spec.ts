import { expect, test } from "@playwright/test";
import { installBrowserMocks, openTaskWorkspace } from "./fixtures";

test.describe("Google Calendar connection recovery", () => {
  test("shows reconnect instead of repeatedly treating an expired connection as active", async ({ page }) => {
    await installBrowserMocks(page, {
      connection: {
        status: "error",
        requiresReconnect: true,
        lastError: "Google Calendar authorization expired or was removed. Reconnect Google Calendar to continue.",
      },
    });
    await openTaskWorkspace(page);

    await expect(page.getByRole("button", { name: "Reconnect Google Calendar" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh Google Calendar" })).toHaveCount(0);
    await expect(page.getByText("Google Calendar needs reconnecting")).toBeVisible();
  });

  test("disconnects from the planner and keeps Spaces marked for reconnect", async ({ page }) => {
    const mock = await installBrowserMocks(page);
    await openTaskWorkspace(page);

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Disconnect" }).click();

    await expect(page.locator(".hu-calendar-alert.is-info")).toContainText("Google Calendar disconnected.");
    await expect(page.getByRole("button", { name: "Connect Google Calendar" }).first()).toBeVisible();
    await expect.poll(() => mock.connection).toBeNull();
    await expect.poll(() => mock.spaces[0]?.status).toBe("disconnected");
  });

  test("provides the same connection controls in Spaces settings", async ({ page }) => {
    await installBrowserMocks(page);
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "Your calendars and projects" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Calendar connected" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();
  });

  test("keeps the connection when safe disconnect cleanup is refused", async ({ page }) => {
    await installBrowserMocks(page, {
      disconnectResponse: {
        status: 409,
        body: { error: "The active timer could not be saved safely, so Calendar was not disconnected." },
      },
    });
    await openTaskWorkspace(page);

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Disconnect" }).click();

    await expect(page.locator(".hu-calendar-alert")).toHaveText("The active timer could not be saved safely, so Calendar was not disconnected.");
    await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();
  });
});
