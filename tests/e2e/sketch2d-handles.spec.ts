/**
 * 2D sketches: a drawing follows the pointer with no animation loop, and `lab.dragHandle`
 * moves a point in model coordinates and re-runs the sketch.
 */
import { expect, test, type Page } from "@playwright/test";

/** The colour of one canvas pixel, at CSS coordinates inside the canvas. */
const pixel = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => {
  const c = document.querySelector("canvas") as HTMLCanvasElement;
  const k = c.width / c.clientWidth;
  return [...c.getContext("2d")!.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data];
}, [x, y]);

test("a pointer handler's change is drawn with no animate(): a tap drops a point there", async ({ page }) => {
  await page.goto("/testbench.html?page=pointer-2d");
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const at = { x: box.width * 0.5, y: box.height * 0.6 };
  const before = await pixel(page, at.x, at.y);
  await canvas.click({ position: at });
  await expect.poll(() => pixel(page, at.x, at.y)).not.toEqual(before);
});

test("lab.dragHandle: a block dragged in the plan moves in model metres, snapped, and the sketch re-runs", async ({ page }) => {
  await page.goto("/testbench.html?page=axonometric");
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  const status = () => page.evaluate(() => (window as any).__tekto.snapshot({}).then((b: any) => b.markup.logs));
  await expect.poll(async () => (await status()).find((l: any) => l.label === "Hall at")?.value).toBe("2, 2 m");

  // Where the hall's handle is: the plan's view maps metres to pixels.
  const view = await page.evaluate(() => {
    const inst = (window as any).__tekto.owner;
    const h = inst.handleList.find((x: any) => x.name === "hall");
    const v = typeof h.opts.view === "function" ? h.opts.view() : h.opts.view;
    return v;
  });
  const box = (await canvas.boundingBox())!;
  const from = { x: box.x + view.x + 2 * view.scale, y: box.y + view.y - 2 * view.scale };
  await page.mouse.move(from.x, from.y);
  await expect(canvas).toHaveCSS("cursor", "grab");
  await page.mouse.down();
  await page.mouse.move(from.x + 3.2 * view.scale, from.y - 4.9 * view.scale, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await status()).find((l: any) => l.label === "Hall at")?.value).toBe("5, 7 m");   // snapped to 0.5 m
  await page.screenshot({ path: test.info().outputPath("axonometric.png") });
});
