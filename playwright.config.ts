import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["live.spec.ts", "production.spec.ts"],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://127.0.0.1:4173/MuPlaytime/",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command:
      "VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= VITE_SCHEMA_VERSION= VITE_NORMALIZATION_VERSION= npm run build && npm run preview -- --host 127.0.0.1",
    url: "http://127.0.0.1:4173/MuPlaytime/",
    reuseExistingServer: !process.env.CI,
  },
});
