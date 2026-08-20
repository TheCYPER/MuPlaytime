import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";

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

function activeDialog(page: Page) {
  return page.getByRole("dialog");
}

async function captureInvite(page: Page, label: string): Promise<string> {
  const dialog = activeDialog(page);
  await expect(dialog).toHaveCount(1);
  const field = dialog.getByRole("textbox", { name: label });
  await expect(field).toBeVisible();
  const url = new URL(await field.inputValue());
  const token = decodeURIComponent(url.hash.replace(/^#\/join\//, ""));
  expect(token.length).toBeGreaterThan(20);
  expect(await inviteIsAbsentFromWebStorage(page, token)).toBe(true);
  return token;
}

async function closeSheet(page: Page): Promise<void> {
  await expect(activeDialog(page)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(activeDialog(page)).toHaveCount(0);
}

async function newMobileContext(
  browser: Browser,
  options: {
    width: 375 | 430;
    height: 812 | 932;
    locale: "zh-CN" | "en-US";
    timezoneId: string;
    baseURL: string;
  },
): Promise<BrowserContext> {
  return browser.newContext({
    ...devices["Pixel 5"],
    viewport: { width: options.width, height: options.height },
    locale: options.locale,
    timezoneId: options.timezoneId,
    baseURL: options.baseURL,
    serviceWorkers: "block",
  });
}

test.describe.serial("configured mobile release journey", () => {
  test("375px Chinese and 430px English clients complete the shared mobile core", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("mobile live baseURL is required");
    const suffix = uniqueLabel("mobile-release");
    const roomName = `移动联机 ${suffix}`;
    const memberZH = `上海成员 ${suffix}`;
    const memberEN = `Dubai member ${suffix}`;
    const gameName = `Mobile game ${suffix}`;
    const zhContext = await newMobileContext(browser, {
      width: 375,
      height: 812,
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
      baseURL,
    });
    const enContext = await newMobileContext(browser, {
      width: 430,
      height: 932,
      locale: "en-US",
      timezoneId: "Asia/Dubai",
      baseURL,
    });

    try {
      const zh = await zhContext.newPage();
      const en = await enContext.newPage();
      await zh.goto("./#/", { waitUntil: "networkidle" });
      await zh.getByLabel("房间名称", { exact: true }).fill(roomName);
      await zh.getByLabel("你的名字", { exact: true }).fill(memberZH);
      await zh.getByLabel("时区").selectOption("Asia/Shanghai");
      await zh.getByRole("button", { name: "创建", exact: true }).click();
      const inviteToken = await captureInvite(zh, "复制邀请链接");
      await closeSheet(zh);
      await expect(
        zh.getByRole("heading", { name: "空闲重叠织图" }),
      ).toBeVisible();

      await en.goto(`./#/join/${encodeURIComponent(inviteToken)}`, {
        waitUntil: "networkidle",
      });
      await en.getByLabel("Your name", { exact: true }).fill(memberEN);
      await en.getByLabel("Timezone").selectOption("Asia/Dubai");
      await en.getByRole("button", { name: "Join", exact: true }).click();
      await captureInvite(en, "Copy invite link");
      await closeSheet(en);
      expect(await inviteIsAbsentFromWebStorage(en, inviteToken)).toBe(true);

      await zh.getByRole("link", { name: "我的排期" }).last().click();
      await zh.getByRole("button", { name: "添加时间" }).click();
      let zhDialog = activeDialog(zh);
      await expect(zhDialog).toHaveAccessibleName("添加时间");
      await zhDialog.getByLabel("开始", { exact: true }).fill("06:00");
      await zhDialog.getByLabel("结束", { exact: true }).fill("07:00");
      await zhDialog.getByRole("button", { name: "保存修改" }).click();
      await expect(activeDialog(zh)).toHaveCount(0);
      await expect(
        zh.getByRole("button", { name: "修改", exact: true }).first(),
      ).toBeVisible();
      await zh
        .getByRole("button", { name: "修改", exact: true })
        .first()
        .click();
      zhDialog = activeDialog(zh);
      await zhDialog.getByLabel("开始", { exact: true }).fill("06:30");
      await zhDialog.getByLabel("结束", { exact: true }).fill("07:30");
      await zhDialog.getByRole("button", { name: "保存修改" }).click();
      await expect(activeDialog(zh)).toHaveCount(0);
      await zh
        .getByRole("button", { name: "修改", exact: true })
        .first()
        .click();
      zhDialog = activeDialog(zh);
      await zhDialog.getByRole("button", { name: "清除这段排期" }).click();
      await zhDialog.getByRole("button", { name: "确认清除排期" }).click();
      await expect(activeDialog(zh)).toHaveCount(0);

      await zh.getByRole("button", { name: "添加时间" }).click();
      zhDialog = activeDialog(zh);
      await zhDialog.getByLabel("开始", { exact: true }).fill("23:30");
      await zhDialog.getByLabel("结束", { exact: true }).fill("00:30");
      await zhDialog.getByLabel("结束时间在次日", { exact: true }).check();
      await zhDialog.getByRole("button", { name: "保存修改" }).click();
      await expect(activeDialog(zh)).toHaveCount(0);

      await zh.getByRole("tab", { name: "具体日期例外" }).click();
      await zh.getByRole("button", { name: "添加时间" }).click();
      zhDialog = activeDialog(zh);
      await zhDialog.getByLabel("开始", { exact: true }).fill("12:00");
      await zhDialog.getByLabel("结束", { exact: true }).fill("13:00");
      await zhDialog.getByRole("button", { name: "保存修改" }).click();
      await zh
        .getByRole("listitem")
        .filter({ hasText: "12:00–13:00" })
        .getByRole("button", { name: "修改", exact: true })
        .click();
      zhDialog = activeDialog(zh);
      await zhDialog.getByLabel("开始", { exact: true }).fill("12:30");
      await zhDialog.getByLabel("结束", { exact: true }).fill("13:30");
      await zhDialog.getByRole("button", { name: "保存修改" }).click();
      await zh
        .getByRole("listitem")
        .filter({ hasText: "12:30–13:30" })
        .getByRole("button", { name: "修改", exact: true })
        .click();
      zhDialog = activeDialog(zh);
      await zhDialog.getByRole("button", { name: "清除这段排期" }).click();
      await zhDialog.getByRole("button", { name: "确认清除排期" }).click();
      await expect(
        zh.getByRole("button", { name: "恢复每周模板" }),
      ).toBeVisible();
      await zh.getByRole("button", { name: "恢复每周模板" }).click();
      await zh.getByRole("button", { name: "确认操作" }).click();
      await expect(
        zh.getByRole("button", { name: "恢复每周模板" }),
      ).toHaveCount(0);

      await zh.getByRole("tab", { name: "时区", exact: true }).click();
      await zh.getByRole("button", { name: "查看时区变更" }).click();
      zhDialog = activeDialog(zh);
      await zhDialog.getByLabel("时区").selectOption("Asia/Dubai");
      await zhDialog.getByRole("button", { name: "更改我的查看时区" }).click();
      await expect(activeDialog(zh)).toHaveCount(0);
      await zh.getByRole("button", { name: "查看时区变更" }).click();
      zhDialog = activeDialog(zh);
      await zhDialog.getByLabel("时区").selectOption("Asia/Tokyo");
      await zhDialog
        .getByLabel("迁移排期，并保留本地星期、日期和钟点", {
          exact: true,
        })
        .check();
      await zhDialog.getByRole("button", { name: "确认迁移" }).click();
      await expect(activeDialog(zh)).toHaveCount(0);

      await zh.getByRole("link", { name: "大家" }).last().click();
      await zh.getByRole("button", { name: "查看详情" }).last().click();
      zhDialog = activeDialog(zh);
      await expect(zhDialog).toHaveAccessibleName("已选时间");
      await zhDialog.getByRole("button", { name: "提议这个时间" }).click();
      zhDialog = activeDialog(zh);
      await zhDialog.getByLabel("游戏名称", { exact: true }).fill(gameName);
      await zhDialog.getByRole("button", { name: "创建提议" }).click();
      await expect(activeDialog(zh)).toHaveCount(0);

      await en.getByRole("link", { name: "Proposals" }).last().click();
      const summary = en.getByRole("link", { name: new RegExp(gameName) });
      await expect(summary).toBeVisible();
      await summary.click();
      let enDialog = activeDialog(en);
      await expect(enDialog).toHaveAccessibleName(gameName);
      const directDetailUrl = en.url();
      await enDialog
        .getByRole("button", { name: "Suggest another time" })
        .click();
      enDialog = activeDialog(en);
      await enDialog
        .getByRole("button", { name: "Suggest another time" })
        .click();
      enDialog = activeDialog(en);
      await expect(enDialog.locator(".option-card")).toHaveCount(2);
      await enDialog
        .getByRole("button", { name: "Withdraw my option" })
        .click();
      await enDialog.getByRole("button", { name: "Confirm action" }).click();
      await enDialog
        .getByRole("button", { name: /Accept/ })
        .first()
        .click();
      await enDialog.getByRole("button", { name: "Clear response" }).click();
      await expect(
        enDialog.getByRole("button", { name: "Clear response" }),
      ).toHaveCount(0);
      await enDialog
        .getByRole("button", { name: /Accept/ })
        .first()
        .click();
      await enDialog.getByRole("button", { name: /Maybe/ }).first().click();
      await enDialog
        .getByRole("button", { name: /Accept/ })
        .first()
        .click();
      await enDialog
        .getByRole("spinbutton", {
          name: "Remind me when X accept",
          exact: true,
        })
        .fill("3");
      await enDialog.getByRole("button", { name: "Set reminder" }).click();
      await expect(
        enDialog.getByText(/Watching this option · X=3/),
      ).toBeVisible();
      await enDialog
        .getByRole("spinbutton", { name: "People", exact: true })
        .fill("2");
      await enDialog.getByRole("button", { name: "Set reminder" }).click();
      await expect(
        enDialog.getByText(/Watching this option · X=2/),
      ).toBeVisible();

      await zh.getByRole("link", { name: "游玩提议" }).last().click();
      await zh.getByRole("link", { name: new RegExp(gameName) }).click();
      zhDialog = activeDialog(zh);
      await zhDialog.getByRole("button", { name: /^接受/ }).first().click();
      await expect(enDialog.getByText(/Enough people accepted/)).toBeVisible();
      await enDialog.getByRole("button", { name: "Acknowledge" }).click();

      await en.goBack();
      await expect(activeDialog(en)).toHaveCount(0);
      await expect(summary).toBeFocused();
      await en.goto(directDetailUrl, { waitUntil: "networkidle" });
      enDialog = activeDialog(en);
      await enDialog.getByRole("button", { name: "Close" }).click();
      await expect(en).toHaveURL(/#\/room\/[^/]+\/proposals$/);

      await zhDialog
        .getByRole("button", { name: "确认这个时间" })
        .first()
        .click();
      await zhDialog.getByRole("button", { name: "确认操作" }).click();
      await zhDialog.getByRole("button", { name: "提议操作" }).click();
      await zhDialog.getByRole("button", { name: "取消提议" }).click();
      await zhDialog.getByRole("button", { name: "确认操作" }).click();

      await enContext.setOffline(true);
      await expect(en.getByText(/Offline/)).toBeVisible();
      await enContext.setOffline(false);
      await en.reload({ waitUntil: "networkidle" });
      const showHistory = en.getByRole("button", { name: /Show History/ });
      await expect(showHistory).toBeVisible();
      await showHistory.click();
      await expect(
        en.getByRole("link", { name: new RegExp(gameName) }),
      ).toBeVisible();
      expect(await inviteIsAbsentFromWebStorage(en, inviteToken)).toBe(true);
    } finally {
      await Promise.all([
        zhContext.close().catch(() => undefined),
        enContext.close().catch(() => undefined),
      ]);
    }
  });

  test("same-name clients retain and deliberately rebase a stale schedule draft", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("mobile live baseURL is required");
    const suffix = uniqueLabel("mobile-conflict");
    const roomName = `Conflict room ${suffix}`;
    const memberName = `Same member ${suffix}`;
    const clientAContext = await newMobileContext(browser, {
      width: 375,
      height: 812,
      locale: "en-US",
      timezoneId: "Asia/Dubai",
      baseURL,
    });
    const clientBContext = await newMobileContext(browser, {
      width: 430,
      height: 932,
      locale: "en-US",
      timezoneId: "Asia/Dubai",
      baseURL,
    });

    let holdClientBSnapshot = false;
    let cachedSnapshot:
      | { body: Buffer; headers: Record<string, string>; status: number }
      | undefined;

    async function snapshotRoute(route: Route) {
      if (holdClientBSnapshot && cachedSnapshot) {
        await route.fulfill(cachedSnapshot);
        return;
      }
      const response = await route.fetch();
      const body = await response.body();
      cachedSnapshot = {
        body,
        headers: response.headers(),
        status: response.status(),
      };
      await route.fulfill({ response, body });
    }

    try {
      const clientA = await clientAContext.newPage();
      const clientB = await clientBContext.newPage();
      await clientB.route("**/rpc/get_room_snapshot", snapshotRoute);

      await clientA.goto("./#/", { waitUntil: "networkidle" });
      await clientA.getByLabel("Room name", { exact: true }).fill(roomName);
      await clientA.getByLabel("Your name", { exact: true }).fill(memberName);
      await clientA.getByLabel("Timezone").selectOption("Asia/Dubai");
      await clientA
        .getByRole("button", { name: "Create", exact: true })
        .click();
      const inviteToken = await captureInvite(clientA, "Copy invite link");
      await closeSheet(clientA);

      await clientB.goto(`./#/join/${encodeURIComponent(inviteToken)}`, {
        waitUntil: "networkidle",
      });
      await clientB.getByLabel("Your name", { exact: true }).fill(memberName);
      await clientB.getByLabel("Timezone").selectOption("Asia/Dubai");
      await clientB.getByRole("button", { name: "Join", exact: true }).click();
      await captureInvite(clientB, "Copy invite link");
      await closeSheet(clientB);

      await clientA.getByRole("link", { name: "My schedule" }).last().click();
      await clientA.getByRole("button", { name: "Add time" }).click();
      let clientADialog = activeDialog(clientA);
      await clientADialog.getByLabel("Start", { exact: true }).fill("06:00");
      await clientADialog.getByLabel("End", { exact: true }).fill("07:00");
      await clientADialog.getByRole("button", { name: "Save changes" }).click();
      await expect(activeDialog(clientA)).toHaveCount(0);

      await clientB.getByRole("link", { name: "My schedule" }).last().click();
      await expect(clientB.getByRole("button", { name: "Edit" })).toBeVisible();
      holdClientBSnapshot = true;
      await clientB.getByRole("button", { name: "Edit" }).click();
      const clientBDialog = activeDialog(clientB);
      await clientBDialog.getByLabel("Start", { exact: true }).fill("06:30");

      await clientA.getByRole("button", { name: "Add time" }).click();
      clientADialog = activeDialog(clientA);
      await clientADialog.getByLabel("Start", { exact: true }).fill("12:00");
      await clientADialog.getByLabel("End", { exact: true }).fill("13:00");
      await clientADialog.getByRole("button", { name: "Save changes" }).click();
      await expect(activeDialog(clientA)).toHaveCount(0);

      await clientBDialog.getByRole("button", { name: "Save changes" }).click();
      await expect(
        clientBDialog.getByText(/Someone changed this schedule first/),
      ).toBeVisible();
      await expect(
        clientBDialog.getByLabel("Start", { exact: true }),
      ).toHaveValue("06:30");

      holdClientBSnapshot = false;
      await clientBContext.setOffline(true);
      await clientBContext.setOffline(false);
      const retry = clientBDialog.getByRole("button", {
        name: "Review and retry with latest version",
      });
      await expect(retry).toBeVisible();
      await expect(
        clientBDialog.getByRole("button", { name: "Save changes" }),
      ).toBeDisabled();
      await retry.click();
      await expect(
        clientBDialog.getByLabel("Start", { exact: true }),
      ).toHaveValue("06:30");
      await clientBDialog.getByRole("button", { name: "Save changes" }).click();
      await expect(activeDialog(clientB)).toHaveCount(0);

      await clientB.reload({ waitUntil: "networkidle" });
      await clientB.getByRole("link", { name: "My schedule" }).last().click();
      const intervalList = clientB.getByRole("list").filter({
        has: clientB.getByRole("button", { name: "Edit", exact: true }),
      });
      await expect(
        intervalList.getByText("06:30–07:00", { exact: true }),
      ).toBeVisible();
      await expect(
        intervalList.getByText("12:00–13:00", { exact: true }),
      ).toBeVisible();
    } finally {
      await Promise.all([
        clientAContext.close().catch(() => undefined),
        clientBContext.close().catch(() => undefined),
      ]);
    }
  });
});
