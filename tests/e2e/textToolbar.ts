/**
 * The text toolbar (`viewerToolbar`: Light · Mode · Cam · Cut ▾ · Sun ▾) on the open app.
 *
 * Apps show the viewer's tools as icons in the view's header; the text toolbar is the older
 * bar, still exported for apps with their own chrome (`appShell({ topBar: true })`, React's
 * `ViewerToolbar`). A test that covers it mounts it here, over the page.
 */
import { test, type Locator, type Page } from "@playwright/test";

export async function mountTextToolbar(page: Page): Promise<Locator> {
  // The module's URL on the playground's dev server (/@fs + its absolute path), from this file's own path.
  const url = "/@fs" + test.info().file.replace(/\\/g, "/").replace(/^(?!\/)/, "/").replace(/tests\/e2e\/[^/]+$/, "src/sketch/ViewerToolbar.ts");
  await page.evaluate(async (u) => {
    const { viewerToolbar } = await import(/* @vite-ignore */ u);
    const owner = (window as any).__tekto.owner;
    const bar = viewerToolbar(owner.scene, owner.renderer);
    bar.el.id = "text-toolbar";
    bar.el.style.cssText += "position:fixed;top:0;left:0;right:0;height:36px;margin:0;padding:0 12px;z-index:100000;background:#0c0d16;font:12px monospace;";
    document.body.appendChild(bar.el);
  }, url);
  return page.locator("#text-toolbar");
}
