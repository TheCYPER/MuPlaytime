import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  expectFocusContained,
  expectNoDocumentOverflow,
  expectOneDialog,
  expectTouchTarget,
  expectUsableViewport,
  intentionalHorizontalScrollers,
  touchDrag,
} from "../helpers/mobile";

const widths = [320, 360, 375, 390, 430] as const;
const locales = ["en", "zh-CN"] as const;
const heights = { 320: 568, 360: 800, 375: 812, 390: 844, 430: 932 } as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("muplaytime.locale.v1");
  });
});

test.describe("mobile entry reflow", () => {
  for (const locale of locales) {
    for (const width of widths) {
      test(`${locale} at ${width}px`, async ({ page, mount }) => {
        await page.addInitScript((nextLocale) => {
          localStorage.setItem("muplaytime.locale.v1", nextLocale);
        }, locale);
        await page.setViewportSize({ width, height: heights[width] });
        const component = await mount("test/MobileContracts/EntryStory", {
          mode: "create",
        });
        await expect(
          component.getByRole("heading", { level: 1 }),
        ).toBeVisible();
        await expectNoDocumentOverflow(page);
        await expectTouchTarget(component.getByRole("button").last());
        await component.unmount();

        const join = await mount("test/MobileContracts/EntryStory", {
          mode: "join",
        });
        await expect(join.getByRole("heading", { level: 1 })).toBeVisible();
        await expectNoDocumentOverflow(page);
        await expectTouchTarget(join.getByRole("button").last());
      });
    }
  }
});

test("entry artwork and wordmark reflow at 320px with 200 percent text", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const component = await mount("test/MobileContracts/EntryStory", {
    mode: "create",
  });
  await page.locator("html").evaluate((element) => {
    element.style.fontSize = "200%";
  });
  await expectNoDocumentOverflow(page);
  const artwork = await component.locator(".entry-hero").evaluate((hero) => {
    const heroRect = hero.getBoundingClientRect();
    const threadRect = hero
      .querySelector(".thread-sample")!
      .getBoundingClientRect();
    return {
      decorationDisplay: getComputedStyle(hero, "::after").display,
      heroBottom: heroRect.bottom,
      threadBottom: threadRect.bottom,
    };
  });
  expect(artwork.decorationDisplay).toBe("none");
  expect(artwork.threadBottom).toBeLessThanOrEqual(artwork.heroBottom + 1);
});

test("connection configuration reflows at 320px with 200 percent text", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const component = await mount("test/MobileContracts/ConfigurationStateStory");
  await page.locator("html").evaluate((element) => {
    element.style.fontSize = "200%";
  });
  await expect(
    component.getByRole("heading", { name: "Connection setup needed" }),
  ).toBeVisible();
  await expectNoDocumentOverflow(page);
  for (const content of [
    component.locator(".eyebrow"),
    component.getByRole("heading"),
    component.locator("code"),
  ]) {
    expect(
      await content.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
  }
});

test("compact shell keeps the intentional rail isolated", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const component = await mount("test/MobileContracts/ShellStory");
  await expect(component.locator(".mobile-nav")).toBeVisible();
  await expectNoDocumentOverflow(page);
  const rail = component.locator("[data-intentional-horizontal-scroll]");
  await expect(rail).toBeVisible();
  expect(
    await rail.evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
  await expectTouchTarget(component.getByRole("slider").first());
  await expectTouchTarget(component.locator(".mobile-wordmark"));
  expect(
    (await new AxeBuilder({ page }).include("#root").analyze()).violations,
  ).toEqual([]);
});

test("board labels and actions stay outside the rail at 320px with large text", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const component = await mount("test/MobileContracts/ShellStory");
  await page.locator("html").evaluate((element) => {
    element.style.fontSize = "200%";
  });
  await expectNoDocumentOverflow(page);
  const geometry = await component.evaluate((root) => {
    const rail = root.querySelector<HTMLElement>(".loom-scroll")!;
    const dock = root.querySelector<HTMLElement>(".selection-dock")!;
    const label = root.querySelector<HTMLElement>(".member-label")!;
    const memberName = label.querySelector<HTMLElement>("strong")!;
    const railRect = rail.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    return {
      railBottom: railRect.bottom + window.scrollY,
      dockTop: dockRect.top + window.scrollY,
      dockPosition: getComputedStyle(dock).position,
      labelHeight: label.getBoundingClientRect().height,
      memberNameHeight: memberName.getBoundingClientRect().height,
    };
  });
  expect(geometry.dockPosition).toBe("static");
  expect(geometry.dockTop).toBeGreaterThanOrEqual(geometry.railBottom - 1);
  expect(geometry.memberNameHeight).toBeLessThanOrEqual(
    geometry.labelHeight + 1,
  );
});

test("safe-area measurement reserves exactly the rendered bottom navigation", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator("html").evaluate((element) => {
    element.style.setProperty("--safe-bottom", "34px");
  });
  const component = await mount("test/MobileContracts/ShellStory");
  await expect
    .poll(() =>
      component.evaluate((root) => {
        const shell = root.querySelector<HTMLElement>(".app-shell")!;
        const nav = root.querySelector<HTMLElement>(".mobile-nav")!;
        return Math.abs(
          Number.parseFloat(getComputedStyle(shell).paddingBottom) -
            nav.getBoundingClientRect().height,
        );
      }),
    )
    .toBeLessThanOrEqual(1);
});

test("touch handles change only one instant while rail panning preserves both", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const component = await mount("test/MobileContracts/ShellStory");
  const rail = intentionalHorizontalScrollers(page);
  const handle = component.getByRole("slider").first();
  const endHandle = component.getByRole("slider").last();
  const beforeStart = Number(await handle.getAttribute("aria-valuenow"));
  const beforeEnd = Number(await endHandle.getAttribute("aria-valuenow"));
  await touchDrag(page, handle, 2);
  expect(Number(await handle.getAttribute("aria-valuenow"))).toBe(beforeStart);
  await touchDrag(page, handle, 50);
  await expect
    .poll(async () => Number(await handle.getAttribute("aria-valuenow")))
    .not.toBe(beforeStart);

  const selectedAfterHandle = [
    Number(await handle.getAttribute("aria-valuenow")),
    Number(await endHandle.getAttribute("aria-valuenow")),
  ];
  expect(selectedAfterHandle[1]).toBe(beforeEnd);
  const scrollBefore = await rail.evaluate((element) => element.scrollLeft);
  await rail.evaluate((element) => element.scrollBy({ left: 100 }));
  await expect
    .poll(async () => rail.evaluate((element) => element.scrollLeft))
    .not.toBe(scrollBefore);
  expect([
    Number(await handle.getAttribute("aria-valuenow")),
    Number(await endHandle.getAttribute("aria-valuenow")),
  ]).toEqual(selectedAfterHandle);
});

test("board datetime fields require explicit DST fold and gap choices", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const fold = await mount("test/MobileContracts/ShellStory", {
    boardTimeZone: "America/New_York",
  });
  await fold
    .getByRole("textbox", { name: "Start", exact: true })
    .fill("2026-11-01T01:30");
  await expect(fold.getByRole("radio")).toHaveCount(2);
  await expect(fold.getByText(/Occurrence/).first()).toBeVisible();
  await expect(
    fold.getByRole("button", { name: "Propose this time" }),
  ).toBeDisabled();
  await fold.unmount();

  const gap = await mount("test/MobileContracts/ShellStory", {
    boardTimeZone: "America/New_York",
  });
  await gap
    .getByRole("textbox", { name: "Start", exact: true })
    .fill("2026-03-08T02:30");
  await expect(gap.getByText(/does not exist/)).toBeVisible();
  await expect(gap.locator(".gap-warning button").first()).toBeVisible();
  await expect(
    gap.getByRole("button", { name: "Propose this time" }),
  ).toBeDisabled();
});

test("schedule exposes edit and clear in one modal", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const component = await mount("test/MobileContracts/ScheduleStory");
  await component.getByLabel("Weekday").selectOption("1");
  await component.getByRole("button", { name: "Edit" }).first().click();
  await expectOneDialog(page);
  await expect(
    page.getByRole("button", { name: "Clear this time" }),
  ).toBeVisible();
  await expectFocusContained(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("date overrides use the same explicit edit and clear sheet", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const component = await mount("test/MobileContracts/ScheduleStory", {
    withOverride: true,
  });
  await component.getByRole("tab", { name: "Date exception" }).click();
  await component.getByRole("button", { name: "Edit" }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Start")).toHaveValue("12:00");
  await dialog.getByLabel("Start").fill("12:30");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await component.getByRole("button", { name: "Edit" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Clear this time" }).click();
  await expect(
    page.getByRole("button", { name: "Clear schedule" }),
  ).toBeVisible();
});

test("offline schedule drafts remain editable while writes stay disabled", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const component = await mount("test/MobileContracts/ScheduleStory", {
    online: false,
  });
  await component.getByLabel("Weekday").selectOption("1");
  await component.getByRole("button", { name: "Edit" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Start").fill("16:00");
  await expect(dialog.getByLabel("Start")).toHaveValue("16:00");
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
});

test("quick paint owns the full form width without page overflow", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const component = await mount("test/MobileContracts/ScheduleStory");
  const normalColumns = await component
    .locator(".quick-paint:visible .day-paint-cell")
    .evaluateAll((cells) => {
      const firstTop = cells[0]?.getBoundingClientRect().top;
      return cells.filter(
        (cell) =>
          Math.abs(cell.getBoundingClientRect().top - (firstTop ?? 0)) <= 1,
      ).length;
    });
  expect(normalColumns).toBe(4);
  await page.locator("html").evaluate((element) => {
    element.style.fontSize = "200%";
  });
  await expectNoDocumentOverflow(page);
  const containment = await component
    .locator(".quick-paint:visible")
    .evaluate((paint) => {
      const outer = paint.getBoundingClientRect();
      const cells = [...paint.querySelectorAll<HTMLElement>(".day-paint-cell")];
      return {
        cellsFit: cells.every((cell) => {
          const rect = cell.getBoundingClientRect();
          return rect.left >= outer.left - 1 && rect.right <= outer.right + 1;
        }),
        labelsFit: cells.every((cell) => {
          const label = cell.querySelector<HTMLElement>("small")!;
          return (
            label.scrollWidth <= label.clientWidth + 1 &&
            label.getBoundingClientRect().right <=
              cell.getBoundingClientRect().right + 1
          );
        }),
      };
    });
  expect(containment.cellsFit).toBe(true);
  expect(containment.labelsFit).toBe(true);
});

test("200 percent text keeps adjacent schedule controls inside the sheet", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const component = await mount("test/MobileContracts/ScheduleStory", {
    withAdjacentSegments: true,
  });
  await page.locator("html").evaluate((element) => {
    element.style.fontSize = "200%";
  });
  await component.getByLabel("Weekday").selectOption("1");
  await component.getByRole("button", { name: "Edit" }).last().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Adjacent saved segment")).toBeVisible();
  await expectNoDocumentOverflow(page);
  const geometry = await dialog.evaluate((element) => {
    const content = element.querySelector<HTMLElement>(".modal-sheet-content")!;
    const contentRect = content.getBoundingClientRect();
    const controls = [
      ...content.querySelectorAll<HTMLElement>(
        ".schedule-interval-form input, .schedule-interval-form select, .adjacent-segment-choices",
      ),
    ];
    return {
      contentFits: content.scrollWidth <= content.clientWidth + 1,
      controlsFit: controls.every((control) => {
        const rect = control.getBoundingClientRect();
        return (
          control.scrollWidth <= control.clientWidth + 1 &&
          rect.left >= contentRect.left - 1 &&
          rect.right <= contentRect.right + 1
        );
      }),
    };
  });
  expect(geometry.contentFits).toBe(true);
  expect(geometry.controlsFit).toBe(true);
});

test("large-text room status scrolls with an open schedule draft", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const component = await mount("test/MobileContracts/ScheduleStory", {
    statusError: true,
  });
  await page.locator("html").evaluate((element) => {
    element.style.fontSize = "200%";
  });
  await component.getByLabel("Weekday").selectOption("1");
  await component.getByRole("button", { name: "Edit" }).first().click();
  const dialog = page.getByRole("dialog");
  const status = dialog.getByRole("alert");
  await expect(status).toHaveCSS("position", "static");
  const retry = dialog.getByRole("button", { name: "Retry" });
  await retry.scrollIntoViewIfNeeded();
  await retry.click();
  const start = dialog.getByLabel("Start");
  await start.scrollIntoViewIfNeeded();
  await start.fill("16:00");
  await expect(start).toHaveValue("16:00");
  await expectNoDocumentOverflow(page);
});

test("sheet actions remain usable at a keyboard-height surrogate", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 375, height: 430 });
  const component = await mount("test/MobileContracts/ScheduleStory");
  await component.getByLabel("Weekday").selectOption("1");
  await component.getByRole("button", { name: "Edit" }).first().click();
  await expectUsableViewport(page.getByRole("dialog"));
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
});

test("200 percent text keeps compact room actions reachable", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const component = await mount("test/MobileContracts/ShellStory");
  await page.locator("html").evaluate((element) => {
    element.style.fontSize = "200%";
  });
  await component.getByRole("button", { name: "More" }).click();
  const dialog = page.getByRole("dialog", { name: "More" });
  await expect(dialog).toBeVisible();
  await expectTouchTarget(dialog.getByLabel("Language"));
  await expect(component.locator(".mobile-nav")).toBeVisible();
  await expectNoDocumentOverflow(page);
});

test("proposal detail keeps responses and custom reminders reachable", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mount("test/MobileContracts/ProposalDetailStory");
  await expectOneDialog(page);
  await expect(page.getByRole("button", { name: /Accept/ })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: /People/ })).toBeVisible();
  await page.getByRole("spinbutton", { name: /People/ }).fill("3");
  await expect(page.getByText(/above the current room size/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm this time" }).click();
  await expect(page.getByText(/makes the selected time final/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm action" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Proposal actions" }).click();
  await page.getByRole("button", { name: "Cancel proposal" }).click();
  await expect(page.getByText(/Cancel this proposal/)).toBeVisible();
  await expectNoDocumentOverflow(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("proposal detail header and actions reflow at 320px with 200 percent text", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mount("test/MobileContracts/ProposalDetailStory");
  await page.locator("html").evaluate((element) => {
    element.style.fontSize = "200%";
  });
  const dialog = page.getByRole("dialog");
  await expectTouchTarget(dialog.getByRole("button", { name: "Close" }));
  await expectNoDocumentOverflow(page);
  const geometry = await dialog.evaluate((element) => {
    const content = element.querySelector<HTMLElement>(".modal-sheet-content")!;
    const header = element.querySelector<HTMLElement>(".modal-sheet-header")!;
    const responseButtons = [
      ...element.querySelectorAll<HTMLElement>(".response-bar button"),
    ];
    return {
      dialogHeight: element.getBoundingClientRect().height,
      headerHeight: header.getBoundingClientRect().height,
      contentHeight: content.getBoundingClientRect().height,
      contentFits: content.scrollWidth <= content.clientWidth + 1,
      responseLabelsFit: responseButtons.every(
        (button) => button.scrollWidth <= button.clientWidth + 1,
      ),
      overflowSources: [...content.querySelectorAll<HTMLElement>("*")]
        .filter(
          (child) =>
            child.scrollWidth > child.clientWidth + 1 ||
            child.getBoundingClientRect().right >
              content.getBoundingClientRect().right + 1,
        )
        .map((child) => ({
          className: child.className,
          tagName: child.tagName,
          clientWidth: child.clientWidth,
          scrollWidth: child.scrollWidth,
          right: child.getBoundingClientRect().right,
        }))
        .slice(0, 12),
    };
  });
  expect(geometry.headerHeight).toBeLessThan(geometry.dialogHeight);
  expect(geometry.contentHeight).toBeGreaterThanOrEqual(44);
  expect(geometry.contentFits, JSON.stringify(geometry.overflowSources)).toBe(
    true,
  );
  expect(geometry.responseLabelsFit).toBe(true);
});

test("selection detail lists the full window and hands off without nesting", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mount("test/MobileContracts/SelectionDetailStory");
  await expectOneDialog(page);
  await expect(page.getByText(/minimum 2\/2/)).toBeVisible();
  await expect(
    page.getByText(/Percy with a deliberately long/).first(),
  ).toBeVisible();
  await expect(page.getByText(/London friend/).first()).toBeVisible();
  await page.getByRole("button", { name: "Propose this time" }).click();
  await expectOneDialog(page);
  await expect(page.getByRole("textbox", { name: "Game name" })).toBeFocused();
  await expect(page.getByLabel("Start")).toHaveValue("2026-08-24T19:30");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("proposal action failures stay beside their origin and offline controls are explicit", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const failing = await mount("test/MobileContracts/ProposalDetailStory", {
    failActions: true,
  });
  await page.getByRole("button", { name: /Accept/ }).click();
  await expect(page.getByText(/action was not saved/)).toBeVisible();
  await expectOneDialog(page);
  await failing.unmount();

  await mount("test/MobileContracts/ProposalDetailStory", {
    online: false,
  });
  await expect(page.getByRole("button", { name: /Accept/ })).toBeDisabled();
  await expect(page.getByRole("spinbutton", { name: /People/ })).toBeEnabled();
  await page.getByRole("spinbutton", { name: /People/ }).fill("4");
  await expect(page.getByRole("spinbutton", { name: /People/ })).toHaveValue(
    "4",
  );
  await expect(
    page.getByRole("button", { name: "Set reminder" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Suggest another time" }),
  ).toBeEnabled();
});

test("modal traps focus, blocks the app, and passes a representative axe scan", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount("test/MobileContracts/InviteModalStory");
  await expectOneDialog(page);
  await expectFocusContained(page);
  await expect(page.locator("#root")).toHaveAttribute("inert", "");
  const close = page.getByRole("button", { name: "Close" });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Copy invite link" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("invite share cancellation, failure, copy fallback, and unavailable state are explicit", async ({
  page,
  mount,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => Promise.reject(new DOMException("cancelled", "AbortError")),
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });
  });
  const component = await mount("test/MobileContracts/InviteModalStory");
  await page.getByRole("button", { name: "Share invite" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => Promise.reject(new Error("share failed")),
    });
  });
  await page.getByRole("button", { name: "Share invite" }).click();
  await expect(page.getByText(/Sharing was unavailable/)).toBeVisible();
  await page.getByRole("button", { name: "Copy invite link" }).click();
  await expect(
    page.getByRole("button", { name: "Invite copied" }),
  ).toBeVisible();
  await component.unmount();

  await mount("test/MobileContracts/InviteModalStory", { token: null });
  await expect(
    page.getByText(/no longer available after a refresh/),
  ).toBeVisible();
});

test("@landscape compact flow preserves controls and reflow", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 812, height: 375 });
  const component = await mount("test/MobileContracts/ShellStory");
  await expect(component.getByRole("slider").first()).toBeVisible();
  await expectNoDocumentOverflow(page);
  await component.unmount();

  const schedule = await mount("test/MobileContracts/ScheduleStory");
  await schedule.getByLabel("Weekday").selectOption("1");
  await schedule.getByRole("button", { name: "Edit" }).first().click();
  await expect(
    page.getByRole("button", { name: "Clear this time" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await schedule.unmount();

  await mount("test/MobileContracts/ProposalDetailStory");
  await expect(page.getByRole("button", { name: /Accept/ })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: /People/ })).toBeVisible();
  await expectNoDocumentOverflow(page);
});

test("@desktop core stories retain the expanded layout", async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const component = await mount("test/MobileContracts/ProposalStory");
  await expect(component.locator(".proposal-heading")).toBeVisible();
  await expect(component.locator(".proposal-mobile-summary")).toBeHidden();
  await expectNoDocumentOverflow(page);
});

test("@desktop compact layout has no cliff above the documented 840px boundary", async ({
  page,
  mount,
}) => {
  const component = await mount("test/MobileContracts/ShellStory");
  for (const width of [841, 900, 1024]) {
    await page.setViewportSize({ width, height: 720 });
    const topbar = component.locator(".topbar");
    await expect(topbar).toBeVisible();
    await expect(component.locator(".mobile-room-header")).toBeHidden();
    expect((await topbar.boundingBox())?.height).toBeLessThanOrEqual(96);
    await expect(
      component.getByRole("button", { name: "Invite" }),
    ).toBeVisible();
    await expectNoDocumentOverflow(page);
    const actionsFit = await topbar.evaluate((element) => {
      const topbarRect = element.getBoundingClientRect();
      return [
        ...element.querySelectorAll<HTMLElement>(".topbar-actions > *"),
      ].every((child) => {
        const rect = child.getBoundingClientRect();
        return (
          rect.left >= topbarRect.left - 1 && rect.right <= topbarRect.right + 1
        );
      });
    });
    expect(actionsFit).toBe(true);
  }
  await expect(component.locator(".claimed-name")).toHaveAttribute(
    "title",
    /Percy with a deliberately long/,
  );

  await page.setViewportSize({ width: 840, height: 720 });
  await expect(component.locator(".topbar")).toBeHidden();
  await expect(component.locator(".mobile-room-header")).toBeVisible();
  await expectTouchTarget(component.locator(".mobile-wordmark"));
  await expectNoDocumentOverflow(page);
});
