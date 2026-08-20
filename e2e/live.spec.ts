import { expect, test, type Page } from "@playwright/test";

const REALTIME_TIMEOUT = 10_000;

function uniqueLabel(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function inviteIsAbsentFromWebStorage(
  page: Page,
  inviteToken: string,
): Promise<boolean> {
  return page.evaluate((secret) => {
    const containsSecret = (storage: Storage) =>
      Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index);
        return key === null ? "" : `${key}:${storage.getItem(key) ?? ""}`;
      }).some(
        (entry) =>
          entry.includes(secret) || entry.includes(encodeURIComponent(secret)),
      );

    return !containsSecret(localStorage) && !containsSecret(sessionStorage);
  }, inviteToken);
}

async function captureEphemeralInvite(page: Page, label: string) {
  const inviteField = page.getByRole("textbox", { name: label });
  await expect(inviteField).toBeVisible();
  const inviteURL = new URL(await inviteField.inputValue());
  const prefix = "#/join/";
  const encodedToken = inviteURL.hash.startsWith(prefix)
    ? inviteURL.hash.slice(prefix.length)
    : "";
  const inviteToken = decodeURIComponent(encodedToken);

  expect(encodedToken.length).toBeGreaterThan(0);
  expect(await inviteIsAbsentFromWebStorage(page, inviteToken)).toBe(true);
  return inviteToken;
}

function trackSuccessfulSnapshots(page: Page): () => number {
  let count = 0;
  page.on("response", (response) => {
    if (
      response.ok() &&
      new URL(response.url()).pathname.endsWith("/rpc/get_room_snapshot")
    ) {
      count += 1;
    }
  });
  return () => count;
}

async function closeSheet(page: Page): Promise<void> {
  await expect(page.locator("[data-dialog-initial-focus]")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test.describe("configured local Supabase", () => {
  test.use({ locale: "en-US", timezoneId: "Asia/Dubai" });

  test("two isolated clients share proposals, responses, and a durable custom reminder", async ({
    browser,
    page: clientA,
  }) => {
    const suffix = uniqueLabel("live");
    const roomName = `Live room ${suffix}`;
    const memberA = `A ${suffix}`;
    const memberB = `B ${suffix}`;
    const gameName = `Game ${suffix}`;
    const clientASnapshots = trackSuccessfulSnapshots(clientA);

    await clientA.goto("./#/", { waitUntil: "networkidle" });
    await expect(
      clientA.getByRole("heading", { name: "Create a room" }),
    ).toBeVisible();
    await clientA.getByLabel("Room name").fill(roomName);
    await clientA.getByLabel("Your name").fill(memberA);
    await clientA.getByLabel("Timezone").selectOption("Asia/Dubai");
    await clientA.getByRole("button", { name: "Create", exact: true }).click();

    const inviteToken = await captureEphemeralInvite(
      clientA,
      "Copy invite link",
    );
    await closeSheet(clientA);
    await expect(
      clientA.getByRole("heading", { name: "Overlap loom" }),
    ).toBeVisible();
    await expect.poll(clientASnapshots).toBeGreaterThanOrEqual(2);

    const baseURL = new URL("./", clientA.url()).toString();
    const contextB = await browser.newContext({
      baseURL,
      locale: "zh-CN",
      timezoneId: "America/New_York",
    });

    try {
      const clientB = await contextB.newPage();
      const clientBSnapshots = trackSuccessfulSnapshots(clientB);
      await clientB.goto("./#/", { waitUntil: "networkidle" });
      await expect(
        clientB.getByRole("heading", { name: "创建房间" }),
      ).toBeVisible();
      await clientB.evaluate((secret) => {
        const browserGlobal = globalThis as unknown as {
          location: { hash: string };
        };
        browserGlobal.location.hash = `#/join/${encodeURIComponent(secret)}`;
      }, inviteToken);

      await expect(
        clientB.getByRole("heading", { name: "加入房间" }),
      ).toBeVisible();
      await clientB.getByLabel("你的名字").fill(memberB);
      await clientB.getByLabel("时区").selectOption("America/New_York");
      await clientB.getByRole("button", { name: "加入", exact: true }).click();

      await expect(clientB).not.toHaveURL(/#\/join\//);
      expect(await inviteIsAbsentFromWebStorage(clientB, inviteToken)).toBe(
        true,
      );
      await closeSheet(clientB);
      await expect(
        clientB.getByRole("heading", { name: "空闲重叠织图" }),
      ).toBeVisible();
      await expect.poll(clientBSnapshots).toBeGreaterThanOrEqual(2);

      await expect(
        clientA.locator(".member-label").filter({ hasText: memberB }),
      ).toBeVisible({ timeout: REALTIME_TIMEOUT });

      await clientB.getByRole("link", { name: "游玩提议" }).first().click();
      await expect(
        clientB.getByRole("heading", { name: "游玩提议" }),
      ).toBeVisible();

      await clientA.getByRole("button", { name: "Propose this time" }).click();
      await clientA.getByLabel("Game name").fill(gameName);
      await clientA.getByRole("button", { name: "Create proposal" }).click();

      await expect(
        clientB.getByRole("heading", { name: gameName }),
      ).toBeVisible({ timeout: REALTIME_TIMEOUT });
      await clientA.getByRole("link", { name: "Proposals" }).first().click();
      await expect(
        clientA.getByRole("heading", { name: gameName }),
      ).toBeVisible();

      await clientA
        .getByRole("button", { name: /^Accept\b/ })
        .first()
        .click();
      await expect(clientB.locator(".accept-count")).toHaveText("1 人接受", {
        timeout: REALTIME_TIMEOUT,
      });

      await clientA.getByLabel("Remind me when X accept").fill("2");
      await clientA.getByRole("button", { name: "Set reminder" }).click();
      await expect(
        clientA.getByText("Watching this option · X=2"),
      ).toBeVisible();

      await clientB.getByRole("button", { name: /^接受/ }).first().click();
      await expect(clientA.locator(".accept-count")).toHaveText("2 accepted", {
        timeout: REALTIME_TIMEOUT,
      });
      await expect(clientB.locator(".accept-count")).toHaveText("2 人接受", {
        timeout: REALTIME_TIMEOUT,
      });
      await expect(clientA.getByText(/Enough people accepted/)).toBeVisible({
        timeout: REALTIME_TIMEOUT,
      });

      await clientA.reload({ waitUntil: "networkidle" });
      await expect(clientA.getByText(/Enough people accepted/)).toBeVisible();
      await clientA.getByRole("button", { name: "Acknowledge" }).click();
      await expect(clientA.getByText(/Enough people accepted/)).toHaveCount(0);

      await clientA.reload({ waitUntil: "networkidle" });
      await expect(clientA.getByText(/Enough people accepted/)).toHaveCount(0);
      await expect(
        clientA.getByRole("button", { name: "Set reminder" }),
      ).toBeVisible();
      expect(await inviteIsAbsentFromWebStorage(clientA, inviteToken)).toBe(
        true,
      );
    } finally {
      await contextB.close().catch(() => undefined);
    }
  });
});
