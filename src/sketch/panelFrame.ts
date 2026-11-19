/**
 * The frame of the control panel, the same in `sketch`, `sketch2d` and `appShell`.
 *
 * The panel is the first column of its root's grid. Its right edge drags to resize it
 * (double-click: back to the default), a chevron at its top right corner folds it to a slim
 * rail, and with `width: "auto"` it is as wide as its controls need. A dragged width and the
 * folded state are remembered per `storageKey`.
 */
import type { Theme } from "../gui/theme";

/** Narrowest and widest panel, dragged or automatic. */
const MIN_WIDTH = 180, MAX_WIDTH = 800;
/** What a folded panel leaves: room for the chevron that unfolds it. */
const RAIL = 28;

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

  // The chevron: at the panel's top right corner, and on the rail when folded.
  const chevron = document.createElement("button");
  chevron.type = "button";
  chevron.dataset.tektoPanelFold = "";
  chevron.style.cssText = `
    position:absolute; top:${o.top + 6}px; width:20px; height:24px; z-index:11; padding:0;
    display:flex; align-items:center; justify-content:center; cursor:pointer;
    font:13px/1 ui-monospace,monospace; border-radius:4px;
    border:1px solid ${t.controlBorder}; background:${t.panelBg}; color:${t.accent};
  `;
  chevron.addEventListener("click", () => { folded = !folded; write(foldKey, folded ? "1" : "0"); apply(); });

  const apply = () => {
    root.style.gridTemplateColumns = `${folded ? RAIL : width}px 1fr`;
    panelEl.style.display = folded ? "none" : "";
    handle.style.display = folded ? "none" : "";
    handle.style.left = `${width - 3}px`;
    chevron.style.left = `${folded ? 4 : width - 26}px`;
    chevron.textContent = folded ? "›" : "‹";
    chevron.title = folded ? "Show the panel" : "Hide the panel";
    chevron.setAttribute("aria-label", chevron.title);
    chevron.setAttribute("aria-expanded", String(!folded));
    // The view's ResizeObserver usually sees the reflow; the event makes it certain.
    requestAnimationFrame(() => { window.dispatchEvent(new Event("resize")); o.onResize?.(); });
  };

  root.append(handle, chevron);
  apply();

  return {
    fit() {
      if (chosen !== null || o.width !== "auto") return;
      const w = defaultWidth();
      if (w !== width) { width = w; apply(); }
    },
    dispose() { handle.remove(); chevron.remove(); },
  };
}
