import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/ct",
  testMatch: "**/*.ct.spec.tsx",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4174/MuPlaytime/playwright/gallery/index.html",
    reuseContext: true,
    serviceWorkers: "block",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile-contract",
      grepInvert: /@landscape|@desktop/,
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "mobile-landscape",
      grep: /@landscape/,
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 812, height: 375 },
      },
    },
    {
      name: "desktop-contract",
      grep: /@desktop/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174/MuPlaytime/playwright/gallery/index.html",
    reuseExistingServer: !process.env.CI,
  },
});
