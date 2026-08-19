import { expect, test } from "@playwright/test";

test("loads from the GitHub Pages project prefix with a clear config boundary", async ({
  page,
}) => {
  const response = await page.goto("./#/", { waitUntil: "networkidle" });
  expect(response?.ok()).toBeTruthy();
  await expect(
    page.getByRole("heading", { name: "Connection setup needed" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("service_role");
  expect(new URL(page.url()).pathname).toBe("/MuPlaytime/");
});

test("language switch works at the mobile acceptance viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("./#/", { waitUntil: "networkidle" });
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(
    page.getByRole("heading", { name: "需要连接配置" }),
  ).toBeVisible();
});
