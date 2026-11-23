/**
 * The frame of the control panel, the same in `sketch`, `sketch2d` and `appShell`.
 *
 * The panel is the first column of its root's grid. Its top row is the frame's: the panel's
 * name on the left and, at the right, the chevron that folds the panel away; the controls
 * start below it, so nothing of the app's ever sits beside the chevron. The row is as high as
 * the viewer's header, so the two read as one band across the app. The panel's right edge
 * drags to resize it (double-click: back to the default), and with `width: "auto"` it is as
 * wide as its controls need. Folded, the panel takes no room at all: the view has the whole
 * width, and the chevron that brings the panel back sits in the view's top left corner (in
 * the viewer header, which moves its own content aside for it). A dragged width and the folded state are remembered per
 * `storageKey`. A panel with nothing in it is not there at all: no column, no row, no
 * chevron, and the view has the whole width — until the app puts something in it.
 *
 * Stable hooks for restyling an embedded app (they stay across releases; the DOM between
 * them may change): on the root `data-tekto-panel="open" | "folded" | "none"`; the top row
 * `[data-tekto-panel-top]`; the chevron `[data-tekto-panel-fold]`; the controls column
 * `[data-tekto-controls]`; a sketch2d's status line `[data-tekto-status]`. CSS variables, set
 * on the app's container or any ancestor: `--tekto-panel-bg`, `--tekto-panel-border`,
 * `--tekto-status-bg`, and `--tekto-label-w` (the label column; in a narrow panel it gives way to the control, down to 40 % of a row).
 */
import type { Theme } from "../gui/theme";

/** Narrowest and widest panel, dragged or automatic. */
const MIN_WIDTH = 180, MAX_WIDTH = 800;
/** What the chevron of a folded panel takes of the viewer header's left end. */
const FOLDED_INSET = 32;

/** A folded panel's chevron lies over the view's corner: the viewer header keeps that corner free. */
function ensureFoldedStyle(): void {
  if (document.getElementById("tekto-panel-folded")) return;
  const style = document.createElement("style");
  style.id = "tekto-panel-folded";
  style.textContent = `[data-tekto-panel=folded] [data-tekto-viewer-header]{padding-left:${FOLDED_INSET}px !important}`
    + `[data-tekto-panel=folded] [data-tekto-shading-bar]:not([data-tekto-viewer-header]){margin-left:${FOLDED_INSET - 6}px}`;
  document.head.appendChild(style);
}
/** The height of the panel's top row: the viewer header's (`VIEWER_HEADER_H`). */
export const PANEL_TOP_H = 34;

export interface PanelFrameOptions {
  /** A grid whose first column is the panel and whose second is the view. */
  root: HTMLElement;
  panelEl: HTMLElement;
  theme: Theme;
  /** The panel's top in the root, in px (the height of a header row above it). */
  top: number;
  /** The default width in px, or "auto": what `preferred()` says. */
  width: number | "auto";
  /** Names the remembered width and folded state (an app's title). */
  storageKey: string;
  /** The panel's name, in its top row (a paper figure: its title). Empty: the row stays free. */
  title?: string;
  /** The width the panel's controls need, for `width: "auto"`. */
  preferred?: () => number;
  /** The view changed size (the panel was resized, folded or unfolded). */
  onResize?: () => void;
}

export interface PanelFrame {
  /** Re-read `preferred()`: call after the controls changed. Leaves a dragged width alone. */
  fit(): void;
  dispose(): void;
}

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null): void {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

/** Give `panelEl` its resize handle and fold chevron, and size the root's first column. */
export function panelFrame(o: PanelFrameOptions): PanelFrame {
  const { root, panelEl, theme: t } = o;
  const widthKey = `tekto.panelWidth.${o.storageKey}`;
  const foldKey = `tekto.panelCollapsed.${o.storageKey}`;
  const clamp = (w: number) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(w)));

  const dragged = parseInt(read(widthKey) ?? "", 10);
  /** A width the person chose by dragging; null: the default. */
  let chosen: number | null = Number.isFinite(dragged) ? clamp(dragged) : null;
  let folded = read(foldKey) === "1";
  const defaultWidth = () => clamp(o.width === "auto" ? (o.preferred?.() ?? 260) : o.width);
  let width = chosen ?? defaultWidth();

  // The handle: a hairline on the panel's edge, wider to grab than to look at.
  const handle = document.createElement("div");
  handle.title = "Drag to resize the panel · double-click to reset";
  const idle = "transparent", hover = t.isDark ? "rgba(255,255,255,.3)" : "rgba(0,0,0,.25)";
  handle.style.cssText = `position:absolute;top:${o.top}px;bottom:0;width:6px;cursor:col-resize;z-index:10;background:${idle};transition:background .15s;`;
  handle.addEventListener("mouseenter", () => { handle.style.background = hover; });
  handle.addEventListener("mouseleave", () => { handle.style.background = idle; });
  handle.addEventListener("dblclick", () => { chosen = null; write(widthKey, null); width = defaultWidth(); apply(); });
  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = width;
    const move = (ev: MouseEvent) => { chosen = width = clamp(w0 + ev.clientX - x0); write(widthKey, String(width)); apply(); };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });

  // The top row: the panel's name, and room for the chevron. It does not scroll with the controls.
  const top = document.createElement("div");
  top.dataset.tektoPanelTop = "";
  const named = !!o.title;
  top.style.cssText = `
    position:absolute; left:0; top:${o.top}px; height:${PANEL_TOP_H}px; box-sizing:border-box; z-index:9;
    display:flex; align-items:center; padding:0 32px 0 14px; overflow:hidden; user-select:none;
    background:var(--tekto-panel-bg, ${t.panelBg}); border-right:1px solid var(--tekto-panel-border, ${t.border});
    border-bottom:1px solid ${t.plain && !named ? "transparent" : `var(--tekto-panel-border, ${t.border})`};
  `;
  const name = document.createElement("span");
  name.textContent = o.title ?? "";
  name.title = o.title ?? "";
  name.style.cssText = t.plain
    ? `font:600 13px/1 ${t.font};color:${t.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`
    : `font:500 10px/1 ${t.font};letter-spacing:1.6px;text-transform:uppercase;color:${t.textDim};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
  top.appendChild(name);
  panelEl.style.marginTop = `${PANEL_TOP_H}px`;
  // Stable hooks for an embedder (see the frame's doc): the controls column, its colours as variables.
  panelEl.dataset.tektoControls = "";
  panelEl.style.background = `var(--tekto-panel-bg, ${t.panelBg})`;
  panelEl.style.borderRightColor = `var(--tekto-panel-border, ${t.border})`;

  // The chevron: at the right of the top row, and in the view's top left corner when folded.
  const chevron = document.createElement("button");
  chevron.type = "button";
  chevron.dataset.tektoPanelFold = "";
  chevron.style.cssText = `
    position:absolute; top:${o.top + (PANEL_TOP_H - 24) / 2}px; width:20px; height:24px; z-index:11; padding:0;
    display:flex; align-items:center; justify-content:center; cursor:pointer;
    font:13px/1 ui-monospace,monospace; border-radius:4px;
    border:1px solid ${t.controlBorder}; background:${t.panelBg}; color:${t.accent};
  `;
  chevron.addEventListener("click", () => { folded = !folded; write(foldKey, folded ? "1" : "0"); apply(); });

  /** Nothing to show: no text and no control in the panel (an app without parameters). */
  const isEmpty = () => !panelEl.textContent?.trim() && !panelEl.querySelector("input,button,select,textarea,canvas,svg,img");
  let empty = isEmpty();

  ensureFoldedStyle();
  const apply = () => {
    root.style.gridTemplateColumns = `${empty || folded ? 0 : width}px 1fr`;
    root.dataset.tektoPanel = empty ? "none" : folded ? "folded" : "open";
    panelEl.style.display = folded || empty ? "none" : "";
    chevron.style.display = empty ? "none" : "flex";
    top.style.display = empty || folded ? "none" : "flex";
    top.style.width = `${width}px`;
    chevron.style.zIndex = folded ? "30" : "11";       // folded: over the viewer header (and ✎ Markup's layer)
    handle.style.display = folded || empty ? "none" : "";
    handle.style.left = `${width - 3}px`;
    chevron.style.left = `${folded ? 6 : width - 26}px`;
    chevron.textContent = folded ? "›" : "‹";
    chevron.title = folded ? "Show the panel" : "Hide the panel";
    chevron.setAttribute("aria-label", chevron.title);
    chevron.setAttribute("aria-expanded", String(!folded));
    // The view's ResizeObserver usually sees the reflow; the event makes it certain.
    requestAnimationFrame(() => { window.dispatchEvent(new Event("resize")); o.onResize?.(); });
  };

  root.append(top, handle, chevron);
  apply();

  // The app fills its panel as it runs (a sketch declares its controls then), and may empty it again.
  const sync = () => { const now = isEmpty(); if (now !== empty) { empty = now; apply(); } };
  let queued = 0;
  const watch = new MutationObserver(() => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; sync(); }); });
  watch.observe(panelEl, { childList: true, subtree: true, characterData: true });

  return {
    fit() {
      sync();
      if (chosen !== null || o.width !== "auto") return;
      const w = defaultWidth();
      if (w !== width) { width = w; apply(); }
    },
    dispose() {
      watch.disconnect();
      if (queued) cancelAnimationFrame(queued);
      top.remove(); handle.remove(); chevron.remove();
      panelEl.style.marginTop = "";
    },
  };
}
