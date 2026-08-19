import { expect, test } from "@playwright/test";

test("boots the final artifact against the configured Supabase schema", async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  const schemaResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith("/rpc/get_schema_meta"),
  );
  const documentResponse = await page.goto("./#/", {
    waitUntil: "domcontentloaded",
  });
  const schemaResponse = await schemaResponsePromise;

  expect(documentResponse?.ok()).toBe(true);
  expect(schemaResponse.ok()).toBe(true);
  expect(await schemaResponse.json()).toEqual({
    schema_version: process.env.VITE_SCHEMA_VERSION,
    normalization_version: process.env.VITE_NORMALIZATION_VERSION,
  });
  await expect(
    page.getByRole("heading", { name: "Create a room" }),
  ).toBeVisible();
  await expect(page.getByText("Connection setup needed")).toHaveCount(0);
  await expect(
    page.getByText("The app and database schema versions do not match."),
  ).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});
