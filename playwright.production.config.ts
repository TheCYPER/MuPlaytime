import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PRODUCTION_PORT ?? "4176";
const baseURL = `http://127.0.0.1:${port}/MuPlaytime/`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "production.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 15_000 },
  reporter: "line",
  use: {
    baseURL,
    locale: "en-US",
    timezoneId: "Asia/Dubai",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    { name: "desktop-production", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-production", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
