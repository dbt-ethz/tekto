/**
 * The frame of a 3D sketch, and its Export / Import menus.
 *
 * A grid: an optional title bar (the sketch's name, LIVE, and the menus on the right —
 * suppressed inside a shell that has its own bar), the control panel on the left (the sketch
 * gives it its `panelFrame`: resize, fold, automatic width) and the viewport with its log
 * overlay. The sketch mounts its ControlPanel and renderer into it.
 */
import type { Theme } from "../gui/theme";
import { download } from "../io/download";
import type { SketchConfig, ExportRegistration, ImportRegistration } from "./SketchTypes";

export interface SketchLayout {
  root: HTMLElement;
  /** Where the Export / Import menus go — null without a title bar (a shell shows them). */
  fileMenusEl: HTMLElement | null;
  panelEl: HTMLElement;
  viewportEl: HTMLElement;
  /** The viewport's container: the 3D view, overlays laid over it, the log overlay. */
  viewportWrap: HTMLElement;
  logEl: HTMLElement;
  /** The title bar's height in px (0 without one): where the panel starts. */
  headerHeight: number;
}

/** Build the frame into `container`. */
export function buildSketchLayout(container: HTMLElement, config: SketchConfig, t: Theme): SketchLayout {
  // Default the internal header off when the container is tagged by a
  // shell (`<div data-shell="testbench">…</div>`) — the shell's top bar
  // already shows the page title, so the sketch's own 44 px title bar
  // would be redundant. Sketches can still force-show with
  // `{ showHeader: true }`.
  const inShell = container instanceof HTMLElement && container.dataset.shell != null;
  const showHeader = config.showHeader ?? !inShell;
  const headerRow = showHeader ? "44px " : "";

  let fileMenusEl: HTMLElement | null = null;

  // Root
  const root = document.createElement("div");
  root.style.cssText = `
    display:grid; grid-template-columns:320px 1fr; grid-template-rows:${headerRow}1fr;
    height:100%; width:100%; overflow:hidden; position:relative;
    background:${t.bg};
    color:${t.text};
    font-family:${t.font};
  `;

  // Header (the sketch's own title bar; suppressed when host shell
  // already shows a top bar). White chrome — see CLAUDE.md "GUI defaults".
  if (showHeader) {
    const header = document.createElement("div");
    header.style.cssText = `
      grid-column:1/-1; display:flex; align-items:center; padding:0 16px; gap:12px;
      background:${t.panelBg};
      border-bottom:1px solid ${t.border};
    `;
    header.innerHTML = `
      <span style="font-weight:600;font-size:14px;color:${t.accent}">
        &#x2B21; ${config.title ?? "Tekto Sketch"}
      </span>
      <span style="font-size:9px;padding:2px 6px;border-radius:3px;
        background:${t.hoverBg};color:${t.accent}">LIVE</span>
    `;
    fileMenusEl = document.createElement("div");
    fileMenusEl.style.cssText = "margin-left:auto;display:flex;gap:8px;position:relative;";
    header.appendChild(fileMenusEl);
    root.appendChild(header);
  }

  // Panel
  const panelEl = document.createElement("div");
  panelEl.style.cssText = `
    overflow-y:auto; overflow-x:hidden; padding:0;
    background:${t.panelBg};
    border-right:1px solid ${t.border};
    position:relative; grid-column:1;
  `;
  root.appendChild(panelEl);

  // Viewport container (holds 3D canvas + log overlay). Grid column pinned explicitly: when the
  // panel collapses via display:none it leaves the grid flow, and without the pin the viewport
  // auto-places into column 1 (the slim rail) leaving column 2 black.
  const vpWrap = document.createElement("div");
  vpWrap.style.cssText = "position:relative;overflow:hidden;grid-column:2;";

  const viewportEl = document.createElement("div");
  // Its own stacking context: what the 3D view puts in its corners (the axis widget) stays
  // with the 3D view, under any overlay laid over it.
  viewportEl.style.cssText = "width:100%;height:100%;isolation:isolate;";
  vpWrap.appendChild(viewportEl);

  // Log overlay
  const logEl = document.createElement("div");
  logEl.style.cssText = `
    position:absolute; bottom:12px; left:12px;
    padding:8px 12px; border-radius:6px;
    background:rgba(7,8,14,.85); backdrop-filter:blur(8px);
    font-size:11px; line-height:1.7; color:#7a80a0;
    pointer-events:none; max-width:300px;
    border:1px solid rgba(22,24,42,.8);
    display:none;
  `;
  vpWrap.appendChild(logEl);

  root.appendChild(vpWrap);

  // Mount
  if (container === document.body) {
    container.style.margin = "0";
    container.style.height = "100vh";
    container.style.overflow = "hidden";
  }
  container.appendChild(root);
  return { root, fileMenusEl, panelEl, viewportEl, viewportWrap: vpWrap, logEl, headerHeight: showHeader ? 44 : 0 };
}

/**
 * Export ▾ / Import ▾ in the sketch's own header, from `lab.registerExport/registerImport`.
 * Without a header (inside a shell) the shell's top bar shows them instead. Rebuilt only
 * when the registered names change, not on every re-run.
 */
export function renderFileMenus(host: HTMLElement, exports: ExportRegistration[], imports: ImportRegistration[], t: Theme): void {
  host.innerHTML = "";
  const menu = (label: string, items: { name: string; title?: string; run: () => void | Promise<void> }[]) => {
    if (!items.length) return;
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:relative;";
    const btn = document.createElement("button");
    btn.textContent = `${label} ▾`;
    btn.style.cssText = `font:12px ${t.font};padding:4px 10px;border-radius:4px;cursor:pointer;
      background:${t.panelBg};color:${t.text};border:1px solid ${t.controlBorder};`;
    const list = document.createElement("div");
    list.style.cssText = `position:absolute;right:0;top:calc(100% + 4px);min-width:180px;z-index:30;display:none;
      background:${t.panelBg};border:1px solid ${t.controlBorder};border-radius:6px;padding:4px;box-shadow:0 4px 16px rgba(0,0,0,.3);`;
    for (const it of items) {
      const b = document.createElement("button");
      b.textContent = it.name;
      if (it.title) b.title = it.title;
      b.style.cssText = `display:block;width:100%;text-align:left;font:12px ${t.font};padding:6px 10px;border:0;border-radius:4px;
        background:transparent;color:${t.text};cursor:pointer;`;
      b.addEventListener("mouseenter", () => { b.style.background = t.hoverBg; });
      b.addEventListener("mouseleave", () => { b.style.background = "transparent"; });
      b.addEventListener("click", async () => {
        list.style.display = "none";
        try { await it.run(); } catch (e) { console.error(`tekto ${label.toLowerCase()} "${it.name}":`, e); }
      });
      list.appendChild(b);
    }
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = list.style.display === "none";
      for (const l of host.querySelectorAll<HTMLElement>("[data-tekto-menu]")) l.style.display = "none";
      list.style.display = open ? "block" : "none";
    });
    list.dataset.tektoMenu = "";
    document.addEventListener("click", () => { list.style.display = "none"; });
    wrap.append(btn, list);
    host.appendChild(wrap);
  };
  menu("Export", exports.map(it => ({
    name: it.name, title: `Download as ${it.fileName}`,
    run: async () => download(await it.handler(), it.fileName, it.mimeType ? { type: it.mimeType } : {}),
  })));
  menu("Import", imports.map(it => ({
    name: it.name,
    run: () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = it.accept ?? "";
      input.onchange = async () => { const f = input.files?.[0]; if (f) await it.handler(f); };
      input.click();
    },
  })));
}
