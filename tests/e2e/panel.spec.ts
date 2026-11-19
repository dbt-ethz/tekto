/**
 * The control panel's frame and looks, the same in every harness: tabs down the side, a
 * width that fits the controls, the fold chevron at the panel's corner, and the paper style.
 */
import { expect, test, type Page } from "@playwright/test";

async function open(page: Page, slug: string): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`/testbench.html?page=${slug}`);
  await expect(page.locator("#app canvas").first()).toBeVisible({ timeout: 15_000 });
  return errors;
}

const leaf = (page: Page, text: string) => page.locator("#app span", { hasText: new RegExp(`^${text}$`) });

test("tabs down the side: one tab at a time, an untabbed control above them", async ({ page }) => {
  const errors = await open(page, "panel-tabs");
  const tabs = page.locator("#app nav[data-tekto-tabs=side]");
  await expect(tabs.locator("button")).toHaveCount(3);
  await expect(tabs.locator("button[aria-pressed=true]")).toContainText("Building");
  await expect(leaf(page, "Storeys")).toBeVisible();
  await expect(leaf(page, "Dimensions")).toBeVisible();

  await tabs.locator("button", { hasText: "Windows" }).click();
  await expect(leaf(page, "Windows per floor")).toBeVisible();
  await expect(leaf(page, "Storeys")).toHaveCount(0);
  await expect(leaf(page, "Dimensions")).toBeVisible();   // pinned: in every tab
  await expect(tabs.locator("button[aria-pressed=true]")).toContainText("Windows");
  expect(errors).toEqual([]);
});

test("an automatic width fits the longest label on one line, with nothing cut off", async ({ page }) => {
  await open(page, "panel-tabs");
  await page.locator("#app nav[data-tekto-tabs=side] button", { hasText: "Windows" }).click();
  const label = leaf(page, "Sill above the floor m");
  await expect(label).toBeVisible();
  expect((await label.boundingBox())!.height).toBeLessThan(20);   // one line of 11 px text
  // every slider's value ends inside the panel
  const overflow = await page.evaluate(() => {
    const fold = document.querySelector<HTMLElement>("#app [data-tekto-panel-fold]")!;
    const edge = fold.getBoundingClientRect().right + 6;   // the chevron sits 6 px inside the panel's edge
    return [...document.querySelectorAll<HTMLElement>("#app input[type=range]")]
      .map((i) => i.nextElementSibling!.getBoundingClientRect().right - edge)
      .filter((d) => d > 0);
  });
  expect(overflow).toEqual([]);
});

for (const slug of ["panel-tabs", "primitives", "site-editor"]) {
  test(`the chevron at the panel's corner folds and unfolds it (${slug})`, async ({ page }) => {
    await open(page, slug);
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("tekto.panel")) localStorage.removeItem(k); });
    await page.reload();
    const canvas = page.locator("#app canvas").first();
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    const fold = page.locator("#app [data-tekto-panel-fold]");
    await expect(fold).toHaveCount(1);
    await expect(fold).toHaveAttribute("aria-expanded", "true");
    const wide = (await canvas.boundingBox())!.x;

    await fold.click();
    await expect(fold).toHaveAttribute("aria-expanded", "false");
    await expect.poll(async () => (await canvas.boundingBox())!.x).toBeLessThan(40);   // the slim rail is left

    await fold.click();
    await expect(fold).toHaveAttribute("aria-expanded", "true");
    await expect.poll(async () => (await canvas.boundingBox())!.x).toBe(wide);
  });
}

test("the paper style: white, labels as written, the status line under the drawing", async ({ page }) => {
  const errors = await open(page, "lecture-house");
  const label = leaf(page, "Width m");
  await expect(label).toBeVisible();
  const style = await label.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { transform: cs.textTransform, color: cs.color };
  });
  expect(style).toEqual({ transform: "none", color: "rgb(17, 17, 17)" });

  const status = page.locator("#app [data-tekto-status]");
  await expect(status).toContainText("Floor area");
  const c = (await page.locator("#app canvas").first().boundingBox())!;
  const s = (await status.boundingBox())!;
  expect(s.y).toBeGreaterThanOrEqual(c.y + c.height - 1);   // below the canvas, not over it
  expect(errors).toEqual([]);
});
