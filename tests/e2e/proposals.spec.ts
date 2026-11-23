/**
 * Proposals in the House page: an agent proposes through the page, a person reviews in the bar.
 */
import { expect, test, type Page } from "@playwright/test";

async function open(page: Page) {
  await page.goto("/testbench.html?page=house");
  await page.waitForFunction(() => (window as any).house?.building.storeys.length === 2, null, { timeout: 30_000 });
}
const propose = (page: Page, patch: object, label: string, note?: string) =>
  page.evaluate(([p, l, n]) => (window as any).__tekto.doc.propose(p, l, "Claude", n), [patch, label, note] as const);
const width = (page: Page) => page.evaluate(() => (window as any).house.doc.get("openings", "entry").width);

test("a proposal waits in the bar with what it changes; Accept is one undo step, and undo reopens it", async ({ page }) => {
  await open(page);
  const bar = page.getByRole("region", { name: "Proposals" });
  await expect(bar).toBeHidden();
  const r = await propose(page, { update: { "openings/entry": { width: 1.3 } }, set: { "openings/nw9": { wall: "n", kind: "window", at: 8.5, width: 1 } } }, "Wider entrance, a north window", "The entrance is narrow for a wheelchair.");
  expect(r).toMatchObject({ ok: true, issues: [] });
  await expect(bar).toBeVisible();
  await expect(bar).toContainText("Claude proposes");
  await expect(bar).toContainText("Wider entrance, a north window");
  await expect(bar).toContainText("The entrance is narrow for a wheelchair.");
  await expect(bar.getByRole("button", { name: "Changes openings/entry" })).toContainText("width: 1.1 → 1.3");
  await expect(bar.getByRole("button", { name: "Adds openings/nw9" })).toBeVisible();
  expect(await width(page)).toBe(1.1);                                  // nothing has changed yet
  await page.screenshot({ path: test.info().outputPath("proposal-bar.png") });

  await bar.getByRole("button", { name: "Changes openings/entry" }).click();   // a click selects the record in the view
  expect(await page.evaluate(() => (window as any).house.selection.keys())).toEqual(["openings/entry"]);

  await bar.getByRole("button", { name: "Accept" }).click();
  await expect(bar).toBeHidden();
  expect(await width(page)).toBe(1.3);
  expect(await page.evaluate(() => (window as any).house.doc.undoLabel())).toBe("Accept: Wider entrance, a north window");
  await page.evaluate(() => (window as any).house.doc.undo());
  await expect(bar).toBeVisible();
  expect(await width(page)).toBe(1.1);
  expect(await page.evaluate(() => (window as any).house.doc.has("openings", "nw9"))).toBe(false);
});

test("Reject keeps the reason for the agent; several proposals are stepped through", async ({ page }) => {
  await open(page);
  const bar = page.getByRole("region", { name: "Proposals" });
  await propose(page, { remove: ["openings/d1"] }, "No door to the living room");
  await propose(page, { update: { "walls/p1": { thickness: 0.3 } } }, "Thicker partition");
  await expect(bar).toContainText("1 of 2");
  await expect(bar).toContainText("No door to the living room");
  await bar.getByRole("button", { name: "Next proposal" }).click();
  await expect(bar).toContainText("Thicker partition");
  await bar.getByRole("button", { name: "Previous proposal" }).click();
  await bar.getByLabel("Reason for rejecting").fill("The living room needs its door.");
  await bar.getByRole("button", { name: "Reject" }).click();
  await expect(bar).toContainText("Thicker partition");
  await expect(bar).not.toContainText("of 2");
  const all = await page.evaluate(() => (window as any).__tekto.doc.proposals("all"));
  expect(all.map((p: any) => [p.label, p.status, p.reason])).toEqual([["No door to the living room", "rejected", "The living room needs its door."], ["Thicker partition", "open", undefined]]);
  expect(await page.evaluate(() => (window as any).house.doc.has("openings", "d1"))).toBe(true);
});
