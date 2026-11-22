/**
 * The menu bar and Undo, the same in every app: the menus are the app's commands (File,
 * Edit, View, then its own), Undo and Redo work over the controls of any sketch, and an app
 * with a document keeps its own undo under the same keys.
 */
import { expect, test, type Page } from "@playwright/test";

const menus = (page: Page) => page.locator("[data-tekto-menubar] button").allTextContents();
const param = (page: Page, name: string) => page.evaluate((n) => (window as any).__tekto.params()[n], name);
const item = async (page: Page, menu: string, label: string) => {
  await page.locator("[data-tekto-menubar]").getByRole("button", { name: menu, exact: true }).click();
  return page.getByRole("menuitem", { name: label, exact: true });
};

test("a 3D sketch: Edit ▸ Undo and Redo over its controls, from the menu and by key", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/testbench.html?page=mesh-factory");
  await page.waitForFunction(() => (window as any).__tekto?.harness === "sketch", null, { timeout: 15_000 });
  expect(await menus(page)).toEqual(["Edit", "View", "Subdiv"]);        // the standard ones first, then the sketch's own

  // The sketch's first slider, by the name `setParams` takes.
  const slider = (await page.evaluate(() => (window as any).__tekto.schema())).find((c: any) => c.type === "int" || c.type === "float");
  const name: string = slider.name;
  const param = (p: Page, n: string) => p.evaluate((nn) => (window as any).__tekto.schema().find((c: any) => c.name === nn).value, n);
  const l0 = await param(page, name);
  await expect(await item(page, "Edit", "Undo")).toBeDisabled();        // nothing to undo yet
  await page.keyboard.press("Escape");
  await page.evaluate(([n, v]) => (window as any).__tekto.setParams({ [n]: v }), [name, l0 + 2] as const);
  await expect.poll(() => param(page, name)).toBe(l0 + 2);

  await (await item(page, "Edit", "Undo")).click();
  await expect.poll(() => param(page, name)).toBe(l0);
  await (await item(page, "Edit", "Redo")).click();
  await expect.poll(() => param(page, name)).toBe(l0 + 2);

  await page.locator("canvas").first().click({ position: { x: 5, y: 60 } });   // focus the app
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => param(page, name)).toBe(l0);
  expect(errors).toEqual([]);
});

test("a 2D sketch: the same Undo; on paper there is no menu bar, and the key still undoes", async ({ page }) => {
  await page.goto("/testbench.html?page=pointer-2d");
  await page.waitForFunction(() => (window as any).__tekto?.harness === "sketch2d", null, { timeout: 15_000 });
  expect(await menus(page)).toEqual(["Edit"]);
  const r0 = await param(page, "Handle radius");
  await page.evaluate(() => (window as any).__tekto.setParams({ "Handle radius": 33 }));
  await (await item(page, "Edit", "Undo")).click();
  await expect.poll(() => param(page, "Handle radius")).toBe(r0);

  await page.goto("/testbench.html?page=lecture-house");               // the paper style: a figure, no menus
  await page.waitForFunction(() => (window as any).__tekto?.harness === "sketch2d", null, { timeout: 15_000 });
  await expect(page.locator("[data-tekto-menubar]")).toHaveCount(0);
  const w0 = await param(page, "House:Width m") ?? await param(page, "Width m");
  await page.evaluate(() => (window as any).__tekto.setParams({ "Width m": 14 }));
  await page.locator("#app canvas").first().click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => await param(page, "House:Width m") ?? await param(page, "Width m")).toBe(w0);
});

test("an app's own commands are its menus: File, Edit, View first, then its own; a document keeps its undo", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/testbench.html?page=site-editor");
  await page.waitForFunction(() => (window as any).siteEditor?.doc.count("blocks") >= 1, null, { timeout: 15_000 });
  expect(await menus(page)).toEqual(["File", "Edit", "View", "Move"]);

  // File: what the app plugged in, with its keys.
  const save = await item(page, "File", "Save JSON");
  await expect(save).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Open JSON…" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-tekto-menu]")).toHaveCount(0);

  // Edit ▸ Add block, then Undo: the document's own undo, not the controls'.
  const count = () => page.evaluate(() => (window as any).siteEditor.doc.count("blocks"));
  const n = await count();
  await (await item(page, "Edit", "Add block")).click();
  expect(await count()).toBe(n + 1);
  await (await item(page, "Edit", "Undo")).click();
  expect(await count()).toBe(n);

  // The sidebar is the model's: no File or History sections left in it.
  await expect(page.locator("#app").getByRole("button", { name: /^(Undo|Redo|Save JSON|Open JSON)$/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the menu bar belongs to the running app: another page brings its own", async ({ page }) => {
  await page.goto("/testbench.html?page=site-editor");
  await expect(page.locator("[data-tekto-menubar]")).toHaveCount(1, { timeout: 15_000 });
  await page.getByRole("combobox").first().selectOption("timber");
  await expect.poll(() => menus(page)).toEqual(["File", "Edit", "View"]);
  await expect(page.locator("[data-tekto-menubar]")).toHaveCount(1);
  await expect(await item(page, "File", "Export IFC")).toBeVisible();   // registered with lab.registerExport
});
