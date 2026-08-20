import { expect, type Locator, type Page } from "@playwright/test";

export async function expectNoDocumentOverflow(page: Page): Promise<void> {
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll<HTMLElement>("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const overflowX = getComputedStyle(element).overflowX;
        return {
          selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.className ? `.${String(element.className).trim().replace(/\s+/g, ".")}` : ""}`,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          overflowX,
        };
      })
      .filter(
        (item) =>
          item.left < -1 ||
          item.right > document.documentElement.clientWidth + 1 ||
          (item.overflowX === "visible" &&
            item.scrollWidth > item.clientWidth + 1),
      )
      .slice(0, 12),
  }));
  expect(
    geometry.scrollWidth,
    `Page overflow offenders: ${JSON.stringify(geometry.offenders)}`,
  ).toBeLessThanOrEqual(geometry.clientWidth + 1);
}

export async function expectTouchTarget(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

export async function expectOneDialog(page: Page): Promise<void> {
  await expect(page.getByRole("dialog")).toHaveCount(1);
}

export async function expectFocusContained(page: Page): Promise<void> {
  const contained = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return Boolean(dialog && dialog.contains(document.activeElement));
  });
  expect(contained).toBe(true);
}

export function intentionalHorizontalScrollers(page: Page): Locator {
  return page.locator("[data-intentional-horizontal-scroll]");
}

export async function expectUsableViewport(locator: Locator): Promise<void> {
  const geometry = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
    };
  });
  expect(geometry.top).toBeGreaterThanOrEqual(-1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
}

export async function touchDrag(
  page: Page,
  locator: Locator,
  deltaX: number,
  deltaY = 0,
): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Touch drag target is not visible");
  const start = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...start, radiusX: 4, radiusY: 4 }],
    });
    await page.waitForTimeout(20);
    for (let step = 1; step <= 5; step += 1) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: start.x + (deltaX * step) / 5,
            y: start.y + (deltaY * step) / 5,
            radiusX: 4,
            radiusY: 4,
          },
        ],
      });
      await page.waitForTimeout(20);
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(50);
  } finally {
    await session.detach();
  }
}
