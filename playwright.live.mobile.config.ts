import { defineConfig, devices } from "@playwright/test";

const requiredPublicEnvironment = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SCHEMA_VERSION",
  "VITE_NORMALIZATION_VERSION",
] as const;

const missingPublicEnvironment = requiredPublicEnvironment.filter(
  (name) => !process.env[name],
);

if (missingPublicEnvironment.length > 0) {
  throw new Error(
    `Live mobile Playwright tests require: ${missingPublicEnvironment.join(", ")}`,
  );
}

const port = process.env.PLAYWRIGHT_LIVE_MOBILE_PORT ?? "4177";
const baseURL = `http://127.0.0.1:${port}/MuPlaytime/`;
const supabaseOrigin = new URL(process.env.VITE_SUPABASE_URL as string).origin;
const realtimeOrigin = supabaseOrigin.replace(/^http/, "ws");
const cspPatchScript = [
  'const fs = require("node:fs");',
  'const path = "dist/index.html";',
  'const source = fs.readFileSync(path, "utf8");',
  `const next = source.replace("connect-src 'self'", "connect-src 'self' ${supabaseOrigin} ${realtimeOrigin}");`,
  'if (next === source) throw new Error("Live CSP patch point missing");',
  "fs.writeFileSync(path, next);",
].join("");
const patchLiveCsp = `node -e ${JSON.stringify(cspPatchScript)}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "live.mobile.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 12_000 },
  reporter: "line",
  use: {
    ...devices["Pixel 5"],
    baseURL,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: `npm run build && ${patchLiveCsp} && npm run preview -- --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
