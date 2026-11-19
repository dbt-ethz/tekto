/**
 * The frame of a 3D sketch, and the File menu's entries for its exports and imports.
 *
 * A grid: an optional title bar (the sketch's name, LIVE, and the menu bar —
 * suppressed inside a shell that has its own bar), the control panel on the left (the sketch
 * gives it its `panelFrame`: resize, fold, automatic width) and the viewport with its log
 * overlay. The sketch mounts its ControlPanel and renderer into it.
 */
import type { Theme } from "../gui/theme";
import { download } from "../io/download";
import type { SketchConfig, ExportRegistration, ImportRegistration } from "./SketchTypes";
import type { Command } from "../gui/Commands";

export interface SketchLayout {
  root: HTMLElement;
  /** Where the menu bar goes — null without a title bar (a shell has a slot for it). */
  menuHost: HTMLElement | null;
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

  let menuHost: HTMLElement | null = null;

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
    menuHost = document.createElement("div");
    menuHost.style.cssText = "display:flex;align-items:center;margin-left:8px;";
    header.appendChild(menuHost);
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
  return { root, menuHost, panelEl, viewportEl, viewportWrap: vpWrap, logEl, headerHeight: showHeader ? 44 : 0 };
}

/**
 * The File menu's entries for what a sketch registered (`lab.registerExport/registerImport`):
 * a command each, so the menu bar lists them and an agent can run them.
 */
export function fileCommands(exports: ExportRegistration[], imports: ImportRegistration[]): Command[] {
  const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const verb = (v: string, name: string) => (new RegExp(`^${v}\\b`, "i").test(name) ? name : `${v} ${name}`);
  return [
    ...imports.map((it): Command => ({
      id: `file.import.${slug(it.name)}`, label: verb("Import", it.name), group: "File",
      run: () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = it.accept ?? "";
        input.onchange = async () => { const f = input.files?.[0]; if (f) await it.handler(f); };
        input.click();
      },
    })),
    ...exports.map((it): Command => ({
      id: `file.export.${slug(it.name)}`, label: verb("Export", it.name), group: "File",
      run: async () => download(await it.handler(), it.fileName, it.mimeType ? { type: it.mimeType } : {}),
    })),
  ];
}
