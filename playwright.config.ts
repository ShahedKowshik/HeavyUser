import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3100",
    channel: "chrome",
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    command: "NEXT_PUBLIC_HEAVYUSER_E2E=1 NEXT_PUBLIC_SUPABASE_URL=https://e2e.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=e2e-publishable-key ./node_modules/.bin/next dev --webpack -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
