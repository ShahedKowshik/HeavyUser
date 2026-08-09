import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  FROZEN_NOW,
  getTaskRow,
  installBrowserMocks,
  makeBlock,
  makeManualSummary,
  makeSession,
  makeStatus,
  makeTask,
  openTaskWorkspace,
} from "./fixtures";

test.describe("task capture, views, editing, and keyboard safety", () => {
  test("captures validation outcomes, filters, completion, accessibility, and responsive screenshots", async ({ page }, testInfo) => {
    await installBrowserMocks(page, {
      tasks: [
        makeTask({ id: "task-focus", title: "Focus task", status: "focus", priority: "normal" }),
        makeTask({ id: "task-overdue", title: "Overdue task", status: "open", priority: "high", startDate: null, deadline: "2026-07-31" }),
        makeTask({ id: "task-upcoming", title: "Upcoming task", status: "open", priority: "low", startDate: "2026-08-03", deadline: "2026-08-10" }),
        makeTask({ id: "task-done", title: "Completed task", status: "done", priority: "low", startDate: null, deadline: "2026-07-30" }),
      ],
    });
    await openTaskWorkspace(page);

    await expect(getTaskRow(page, "Focus task")).toBeVisible();
    await expect(getTaskRow(page, "Overdue task")).toHaveAttribute("aria-label", "Overdue task, overdue");

    await page.locator("button.hu-add-button").click();
    const form = page.getByRole("form", { name: "Add task" });
    const titleInput = form.locator("#new-task-title");

    await titleInput.fill("   ");
    await form.getByRole("button", { name: "Add task", exact: true }).click();
    await expect(form.getByRole("alert")).toHaveText("Enter a task title.");

    await titleInput.fill("x".repeat(300));
    await expect(titleInput).toHaveValue("x".repeat(240));

    await titleInput.fill("Reversed dates");
    await form.locator('input[aria-label="Task start date"]').fill("02 Aug 26");
    await form.locator('input[aria-label="Task due date"]').fill("01 Aug 26");
    await form.getByRole("button", { name: "Add task", exact: true }).click();
    await expect(form.getByRole("alert")).toHaveText("The start date must be on or before the due date.");

    await titleInput.fill("Emoji 🚀 [edge] / unusual characters");
    await form.locator('input[aria-label="Task start date"]').fill("");
    await form.locator('input[aria-label="Task due date"]').fill("01 Aug 26");
    await form.getByLabel("Task duration in minutes").fill("10080");
    await form.getByRole("button", { name: "Add task", exact: true }).click();

    await expect(getTaskRow(page, "Emoji 🚀 [edge] / unusual characters")).toBeVisible();
    await expect(getTaskRow(page, "Emoji 🚀 [edge] / unusual characters").getByRole("button", { name: /Priority: Normal/ })).toBeVisible();

    const completedFilter = page.getByLabel("Show completed tasks");
    await completedFilter.focus();
    await page.keyboard.press("Space");
    await expect(completedFilter).toBeChecked();
    await page.keyboard.press("Space");
    await expect(completedFilter).not.toBeChecked();
    await page.getByLabel("Show completed tasks").check();
    await expect(getTaskRow(page, "Completed task")).toBeVisible();
    await page.getByLabel("Show completed tasks").uncheck();

    await page.getByRole("tab", { name: /Today/ }).click();
    await expect(getTaskRow(page, "Overdue task")).toBeVisible();
    await page.getByRole("tab", { name: /Upcoming/ }).click();
    await expect(getTaskRow(page, "Upcoming task")).toBeVisible();
    await page.getByRole("tab", { name: /Backlog/ }).click();
    await expect(page.getByRole("tabpanel")).toContainText("No tasks here yet.");
    await page.getByRole("tab", { name: /All tasks/ }).click();

    const focusRow = getTaskRow(page, "Focus task");
    await focusRow.getByRole("button", { name: "Complete Focus task" }).click();
    await page.getByLabel("Show completed tasks").check();
    await expect(getTaskRow(page, "Focus task")).toHaveClass(/is-done-row/);

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);

    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const hasNoHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      await expect(hasNoHorizontalScroll).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`task-screen-${width}.png`),
        fullPage: false,
        animations: "disabled",
        caret: "hide",
      });
    }
  });

  test("keeps focus single, protects nested controls, and supports inline and keyboard editing", async ({ page }) => {
    await installBrowserMocks(page, {
      tasks: [
        makeTask({ id: "task-focus", title: "Focus task", status: "focus", priority: "normal", duration: 30 }),
        makeTask({ id: "task-no-duration", title: "No duration task", status: "open", priority: "normal", duration: null, startDate: null, deadline: null }),
        makeTask({ id: "task-secondary", title: "Secondary task", status: "open", priority: "normal", duration: 45, startDate: "2026-08-01", deadline: "2026-08-02" }),
        makeTask({ id: "task-done", title: "Done task", status: "done", priority: "low" }),
      ],
    });
    await openTaskWorkspace(page);

    const secondaryRow = getTaskRow(page, "Secondary task");
    await secondaryRow.getByRole("button", { name: "Priority: Normal. Change priority" }).click();
    const priorityMenu = page.getByRole("menu", { name: "Change priority for Secondary task" });
    await expect(priorityMenu).toBeVisible();
    await expect(priorityMenu.getByRole("menuitemradio", { name: "Urgent" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(priorityMenu.getByRole("menuitemradio", { name: "High" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: "Change priority for Secondary task" })).toHaveCount(0);
    await expect(secondaryRow.getByRole("button", { name: "Priority: Normal. Change priority" })).toBeFocused();
    await secondaryRow.getByRole("button", { name: "Priority: Normal. Change priority" }).click();
    await page.getByRole("menuitemradio", { name: "Urgent" }).click();
    await expect(secondaryRow.getByRole("button", { name: "Priority: Urgent. Change priority" })).toBeVisible();
    await expect(getTaskRow(page, "Focus task")).toHaveAttribute("aria-current", "true");

    const focusTitleButton = getTaskRow(page, "Focus task").getByRole("button", { name: "Edit title for Focus task" });
    await focusTitleButton.click();
    const inlineTitle = page.getByRole("textbox", { name: "Edit title for Focus task" });
    await inlineTitle.fill("Discarded title");
    await inlineTitle.press("Escape");
    await expect(getTaskRow(page, "Focus task")).toBeVisible();
    await expect(getTaskRow(page, "Discarded title")).toHaveCount(0);

    await getTaskRow(page, "Focus task").getByRole("button", { name: "Edit title for Focus task" }).click();
    await page.getByRole("textbox", { name: "Edit title for Focus task" }).fill("Renamed focus task");
    await page.getByRole("textbox", { name: "Edit title for Focus task" }).press("Enter");
    await expect(getTaskRow(page, "Renamed focus task")).toBeVisible();

    const durationRow = getTaskRow(page, "No duration task");
    await durationRow.getByRole("button", { name: "Add duration" }).click();
    await expect(page.getByRole("dialog", { name: "Set duration for No duration task" })).toBeVisible();
    await page.getByRole("dialog", { name: "Set duration for No duration task" }).getByRole("button", { name: "1h", exact: true }).click();
    await expect(durationRow.getByRole("button", { name: "Edit duration: 01h 00m" })).toBeVisible();

    await durationRow.getByRole("button", { name: "Add due date" }).click();
    const datePopover = page.getByRole("dialog", { name: "Set due date for No duration task" });
    await datePopover.getByRole("button", { name: "Tomorrow" }).click();
    await expect(durationRow.getByRole("button", { name: /Edit due date:/ })).toBeVisible();

    await getTaskRow(page, "Renamed focus task").focus();
    await getTaskRow(page, "Renamed focus task").press("ArrowDown");
    await expect(getTaskRow(page, "Renamed focus task")).toHaveAttribute("aria-current", "true");

    const editTaskButton = getTaskRow(page, "Renamed focus task").getByRole("button", { name: "Edit Renamed focus task" });
    await editTaskButton.click();
    const dialog = page.getByRole("dialog", { name: "Edit task" });
    await expect(dialog.locator("input").first()).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await dialog.getByRole("group", { name: "Start date" }).getByRole("button", { name: "Custom" }).click();
    await dialog.getByRole("group", { name: "Due date" }).getByRole("button", { name: "Custom" }).click();
    await dialog.locator('input[aria-label="Custom task start date"]').fill("03 Aug 26");
    await dialog.locator('input[aria-label="Custom task due date"]').fill("02 Aug 26");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("The start date must be on or before the due date.");

    await dialog.getByLabel("Minimum calendar block in minutes").fill("10");
    await dialog.getByLabel("Maximum calendar block in minutes").fill("5");
    await dialog.locator('input[aria-label="Custom task start date"]').fill("01 Aug 26");
    await dialog.locator('input[aria-label="Custom task due date"]').fill("02 Aug 26");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("The minimum block must be shorter than the maximum block.");

    await dialog.getByRole("button", { name: "Close edit task dialog" }).click();
    await expect(page.getByRole("dialog", { name: "Edit task" })).toHaveCount(0);
    await expect(editTaskButton).toBeFocused();
  });
});

test.describe("planner statuses and failure states", () => {
  test("shows every planner status and past or locked block result in the task dialog", async ({ page }) => {
    const tasks = [
      makeTask({ id: "task-needs-duration", title: "Needs duration", duration: null, status: "open" }),
      makeTask({ id: "task-scheduled", title: "Scheduled", status: "open" }),
      makeTask({ id: "task-risk", title: "At risk", status: "open" }),
      makeTask({ id: "task-locked", title: "Locked", status: "open" }),
      makeTask({ id: "task-awaiting", title: "Awaiting completion", status: "open" }),
      makeTask({ id: "task-paused", title: "Paused", status: "open" }),
      makeTask({ id: "task-calendar-error", title: "Calendar error", status: "open" }),
    ];
    await installBrowserMocks(page, {
      tasks,
      scheduleStatuses: [
        makeStatus("task-scheduled", "scheduled"),
        makeStatus("task-risk", "at_risk"),
        makeStatus("task-locked", "locked"),
        makeStatus("task-awaiting", "awaiting_completion"),
        makeStatus("task-paused", "paused"),
        makeStatus("task-calendar-error", "calendar_error"),
      ],
      scheduleBlocks: [
        makeBlock("task-locked", { id: "block-future-locked", state: "locked", start: "2026-08-01T11:00:00.000Z", end: "2026-08-01T11:30:00.000Z" }),
        makeBlock("task-scheduled", { id: "block-past", start: "2026-08-01T09:00:00.000Z", end: "2026-08-01T09:30:00.000Z" }),
      ],
    });
    await openTaskWorkspace(page);

    for (const [title, label] of [
      ["Needs duration", "Needs duration"],
      ["Scheduled", "Scheduled"],
      ["At risk", "At risk"],
      ["Locked", "Locked"],
      ["Awaiting completion", "Awaiting completion"],
      ["Paused", "Paused"],
      ["Calendar error", "Calendar error"],
    ] as const) {
      await getTaskRow(page, title).hover();
      await getTaskRow(page, title).getByRole("button", { name: `Edit ${title}` }).click();
      const dialog = page.getByRole("dialog", { name: "Edit task" });
      await expect(dialog.getByText(label, { exact: true }).first()).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel" }).click();
    }

    await getTaskRow(page, "Locked").hover();
    await getTaskRow(page, "Locked").getByRole("button", { name: "Edit Locked" }).click();
    const lockedDialog = page.getByRole("dialog", { name: "Edit task" });
    await expect(lockedDialog.getByText("Locked", { exact: true }).first()).toBeVisible();
    await lockedDialog.getByRole("button", { name: "Cancel" }).click();

    await getTaskRow(page, "Scheduled").hover();
    await getTaskRow(page, "Scheduled").getByRole("button", { name: "Edit Scheduled" }).click();
    const pastDialog = page.getByRole("dialog", { name: "Edit task" });
    await expect(pastDialog.getByText("Past", { exact: true })).toBeVisible();
    await pastDialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("announces planner and network failures instead of going silent", async ({ page }) => {
    const mock = await installBrowserMocks(page, { tasks: [makeTask()] });
    mock.failures.set("/api/scheduler/status", { status: 502, body: { error: "Planner is temporarily unavailable." } });
    mock.failures.set("/api/timer/status", { status: 401, body: { error: "Session expired." } });
    await openTaskWorkspace(page);
    await expect(page.locator(".hu-calendar-alert")).toContainText("Planner is temporarily unavailable.");

    mock.failures.delete("/api/scheduler/status");
    mock.abortedPaths.add("/api/google/calendar/events");
    await page.getByRole("button", { name: "Refresh Google Calendar" }).click();
    await expect(page.locator(".hu-calendar-alert")).toContainText("Failed to fetch");
  });
});

test.describe("timer and work history", () => {
  test("handles add time, estimate reached, stop, and the visible timer state", async ({ page }) => {
    const task = makeTask({ id: "task-focus", title: "Timer task", status: "focus", duration: 30 });
    const activeSession = { session: makeSession({ taskId: task.id, state: "running", stoppedAt: null, originalStoppedAt: null, workedSeconds: 1_200 }), elapsedSeconds: 20, serverNow: FROZEN_NOW };
    const mock = await installBrowserMocks(page, { tasks: [task], activeSession });
    await openTaskWorkspace(page);

    await expect(page.locator(".hu-active-timer-bar").getByText("Working now", { exact: true })).toBeVisible();
    const addTimeDialog = page.waitForEvent("dialog").then(async (dialog) => {
      expect(dialog.type()).toBe("prompt");
      await dialog.accept("15");
    });
    await page.getByRole("button", { name: "Add time" }).click();
    await addTimeDialog;
    await expect(page.getByText("More time added.", { exact: true })).toBeVisible();

    mock.timerStopResponses.push(
      { status: 409, body: { code: "estimate_reached" } },
      { status: 200, body: { warning: "Work saved." } },
    );
    const stopConfirmation = page.waitForEvent("dialog").then(async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      await dialog.accept();
    });
    await page.locator(".hu-active-timer-bar").getByRole("button", { name: "Stop", exact: true }).click();
    await stopConfirmation;
    await expect(page.getByText("Work saved.", { exact: true })).toBeVisible();
    await expect(page.locator(".hu-active-timer-bar")).toHaveCount(0);

    mock.timerStopResponses.push(
      { status: 409, body: { code: "overrun_review" } },
      { status: 200, body: { warning: "Work saved after split." } },
    );
    await getTaskRow(page, task.title).hover();
    await getTaskRow(page, task.title).getByRole("button", { name: `Start timer for ${task.title}` }).click();
    await expect(page.getByText("Timer started.", { exact: true })).toBeVisible();
    const overrunConfirmation = page.waitForEvent("dialog").then(async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      await dialog.accept();
    });
    await page.locator(".hu-active-timer-bar").getByRole("button", { name: "Stop", exact: true }).click();
    await overrunConfirmation;
    await expect(page.getByText("Work saved after split.", { exact: true })).toBeVisible();
  });

  test("handles busy-calendar confirmation, invalid manual work, correction, deletion, and missed time", async ({ page }) => {
    const task = makeTask({ id: "task-focus", title: "History task", status: "focus", duration: 30 });
    const mock = await installBrowserMocks(page, {
      tasks: [task],
      sessionsByTask: {
        [task.id]: makeManualSummary(task.id),
        "deleted-task-12345678": makeManualSummary("deleted-task-12345678", makeSession({ taskId: "deleted-task-12345678", source: "manual" })),
      },
      missedBlocks: [{ id: "missed-e2e", taskId: task.id, spaceId: task.spaceId, calendarId: "calendar-work", start: "2026-07-31T09:00:00.000Z", end: "2026-07-31T09:30:00.000Z", minutes: 30, state: "missed" }],
    });
    mock.timerStartResponse = { status: 409, body: { code: "busy_now" } };
    await openTaskWorkspace(page);
    await expect(page.getByRole("heading", { name: "Saved work from deleted tasks" })).toBeVisible();
    await page.getByText("Deleted task · 12345678", { exact: true }).click();
    await expect(page.getByText("30m worked", { exact: true })).toBeVisible();

    const busyConfirmation = page.waitForEvent("dialog").then(async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      await dialog.accept();
    });
    await getTaskRow(page, task.title).hover();
    await getTaskRow(page, task.title).getByRole("button", { name: `Start timer for ${task.title}` }).click();
    await busyConfirmation;
    await expect(page.getByText("Timer started.", { exact: true })).toBeVisible();

    await getTaskRow(page, task.title).hover();
    await getTaskRow(page, task.title).getByRole("button", { name: `Edit ${task.title}` }).click();
    const dialog = page.getByRole("dialog", { name: "Edit task" });
    await expect(dialog.getByText("30m missed", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Log work" }).first().click();
    await dialog.getByLabel("Minutes worked").fill("0");
    await dialog.getByRole("button", { name: "Save work" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Enter a number from 1 to 1440 minutes.");
    await dialog.getByLabel("Minutes worked").fill("45");
    await dialog.getByRole("button", { name: "Save work" }).click();
    await expect(page.getByText("Work logged.", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await getTaskRow(page, task.title).hover();
    await getTaskRow(page, task.title).getByRole("button", { name: `Edit ${task.title}` }).click();
    const historyDialog = page.getByRole("dialog", { name: "Edit task" });
    await historyDialog.getByRole("button", { name: /Correct 30 minute work entry/ }).click();
    await historyDialog.getByLabel("Corrected work minutes").fill("60");
    await historyDialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Session corrected and recorded.", { exact: true })).toBeVisible();
    await historyDialog.getByRole("button", { name: "Cancel" }).click();

    await getTaskRow(page, task.title).hover();
    await getTaskRow(page, task.title).getByRole("button", { name: `Edit ${task.title}` }).click();
    const deleteDialog = page.getByRole("dialog", { name: "Edit task" });
    await deleteDialog.getByRole("button", { name: "Delete work entry" }).click();
    await deleteDialog.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Work entry removed.", { exact: true })).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Cancel" }).click();
  });
});

test("keeps the local task safe while a failed cloud save retries", async ({ page }) => {
  const mock = await installBrowserMocks(page, { tasks: [makeTask({ title: "Saved task" })], failTaskSave: true });
  await openTaskWorkspace(page);
  await page.locator("button.hu-add-button").click();
  const form = page.getByRole("form", { name: "Add task" });
  await form.locator("#new-task-title").fill("Should roll back");
  await form.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(getTaskRow(page, "Should roll back")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Your changes are safe on this device. Cloud sync failed and will retry.", { timeout: 5_000 });
  await expect(getTaskRow(page, "Should roll back")).toBeVisible();
  expect(mock.requests.some((request) => request.path === "/rest/v1/tasks" && request.method === "POST")).toBe(true);
});
