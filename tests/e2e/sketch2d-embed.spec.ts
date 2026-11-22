/**
 * Several sketch2d apps on one page (a book chapter): with `keys: "app"` each hears its keys
 * only while it has focus, so one Cmd-Z undoes that app alone. In a narrow panel the label
 * column gives way, so a slider's value is not cut off, and the default group sits under the
 * panel's own name without a second "Parameters" heading.
 */
import { expect, test } from "@playwright/test";

// A tekto source module's URL on the dev server (/@fs + its absolute path), from this spec's path.
const srcUrl = (f: string) => "/@fs" + test.info().file.replace(/\\/g, "/").replace(/^(?!\/)/, "/").replace(/tests\/e2e\/[^/]+$/, `src/${f}`);

test("keys: app — Cmd-Z undoes only the app with focus; narrow panels keep the value", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/testbench.html?page=pointer-2d");
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });

  await page.evaluate(async (mod) => {
    const { sketch2d } = await import(/* @vite-ignore */ mod);
    const w = window as any;
    for (const id of ["fig-a", "fig-b"]) {
      const host = document.createElement("div");
      host.id = id;
      host.style.cssText = `position:fixed;left:0;top:${id === "fig-a" ? 0 : 320}px;width:620px;height:300px;z-index:100000;background:#fff;`;
      document.body.appendChild(host);
      w[id] = sketch2d((lab: any) => {
        lab.slider("A rather long label for a slider", 0, 10, 2);
        lab.slider("Other", 0, 10, 2, { group: "More" });
      }, { container: host, title: id, style: "paper", keys: "app", panelWidth: 260 });
    }
  }, srcUrl("2d.ts"));

  const value = (id: string) => page.evaluate((id) => Object.values((window as any)[id].getParams())[0] as number, id);
  for (const id of ["fig-a", "fig-b"]) {
    await page.locator(`#${id} input[type=range]`).first().click({ position: { x: 3, y: 5 } });
    expect(await value(id)).toBeLessThan(1);
  }
  await page.locator("#fig-a canvas").click({ position: { x: 200, y: 150 } });
  await page.keyboard.press("ControlOrMeta+z");
  expect(await value("fig-a")).toBe(2);
  expect(await value("fig-b")).toBeLessThan(1);

  // In a narrow panel the label column gives way, down to 40 % of the row; the value shows whole.
  const row = page.locator("#fig-a input[type=range]").first().locator("..");
  const [label, val] = await row.evaluate((r) => {
    const s = r.querySelectorAll("span");
    const v = s[s.length - 1] as HTMLElement;
    return [(s[0] as HTMLElement).getBoundingClientRect().width / r.getBoundingClientRect().width, v.scrollWidth <= v.clientWidth + 1 ? v.clientWidth : -1];
  });
  expect(label).toBeLessThanOrEqual(0.41);
  expect(val).toBeGreaterThanOrEqual(40);

  // One "Parameters" (the panel's top row is the app's title on paper): no heading over the first group, "More" keeps its own.
  const text = (await page.locator("#fig-a [data-tekto-controls]").innerText()).toUpperCase();
  expect(text).not.toContain("PARAMETERS");
  expect(text).toContain("MORE");
  expect(errors).toEqual([]);
});
