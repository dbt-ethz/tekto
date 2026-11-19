// Shared helpers for the lecture apps: a black-and-white palette that follows
// the reader's light/dark toggle, a fit-to-canvas view transform, a few line
// drawing primitives, and `mount`, which turns an app definition into a
// tekto sketch2d inside a <div data-app="..."> on the page.
//
// These apps come from the lecture script "Digital Theory and Culture in
// Architecture" (ETH Zurich, chapter 5), where each one sits in the text of a
// Quarto book. In the playground, `page` mounts one of them on its own.

import { sketch2d } from "../../../src";
import type { Sketch2DFn, Sketch2DInstance, ParamStore } from "../../../src";

// tekto keeps a sketch's parameter values in a private ParamStore. We read it
// only to carry the values across a re-mount (light/dark switch).
const storeOf = (i: Sketch2DInstance) => (i as unknown as { store: ParamStore }).store;

// ── Palette ──────────────────────────────────────────────────────────────

export interface Palette {
  dark: boolean;
  ink: string;
  paper: string;
  /** Mix between paper (0) and ink (1). */
  grey(t: number): string;
  /** Ink with alpha. */
  inkA(a: number): string;
  /** The two colours as numbers, for comparing against a canvas fill. */
  rgb: { ink: RGB; paper: RGB };
}

type RGB = [number, number, number];

function parseRGB(css: string): RGB | null {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(",").map((s) => parseFloat(s));
  if (p.length === 4 && p[3] === 0) return null;
  return [p[0], p[1], p[2]];
}

/** True in the playground: black ink on white paper, whatever the page's own background. */
let standalone = false;

function makePalette(): Palette {
  const dark = !standalone && document.body.classList.contains("quarto-dark");
  const ink: RGB = dark ? [242, 242, 242] : [17, 17, 17];
  const paper: RGB = standalone ? [255, 255, 255]
    : parseRGB(getComputedStyle(document.body).backgroundColor) ?? (dark ? [34, 34, 34] : [255, 255, 255]);
  const hex = (c: RGB) => `rgb(${c.map((v) => Math.round(v)).join(",")})`;
  return {
    dark,
    ink: hex(ink),
    paper: hex(paper),
    grey: (t) => hex([0, 1, 2].map((i) => paper[i] + (ink[i] - paper[i]) * t) as RGB),
    inkA: (a) => `rgba(${ink.join(",")},${a})`,
    rgb: { ink, paper },
  };
}

/** The current palette. Re-read whenever the reader switches theme. */
export let P: Palette = makePalette();

/**
 * Height the apps keep free at the bottom of the canvas for the status bar. In
 * the lecture book (tekto 0.5) the bar lies over the canvas and this is 34;
 * here the status line is a row of its own under the canvas.
 */
export const BAR = 0;

export const FONT = `11px "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;
export const FONT_SMALL = `10px "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;

// ── App definition + mounting ────────────────────────────────────────────

export interface Env {
  /** True while the app is on screen. Animated apps pause when it is false. */
  readonly visible: boolean;
}

export interface AppDef {
  title: string;
  fn: Sketch2DFn;
  /** Height of the whole app in px (header + canvas). */
  height?: number;
  panelWidth?: number;
  /** Height of the drawing in px when the panel moves below it (narrow column). Default 360. */
  narrowCanvas?: number;
}

export type AppFactory = (env: Env) => AppDef;

/**
 * Mount an app into `el`. The app is created lazily when it first scrolls
 * near the viewport, and re-mounted when the reader toggles between light and
 * dark: its state lives in the factory's closure and its slider values are
 * copied across.
 */
export function mount(el: HTMLElement, factory: AppFactory): void {
  const env = { visible: false };
  let def: AppDef | null = null;
  let inst: Sketch2DInstance | null = null;
  let mode: boolean | null = null;

  const host = document.createElement("div");
  el.appendChild(host);
  const NARROW = 600;
  const setNarrow = () => el.classList.toggle("narrow", el.clientWidth > 0 && el.clientWidth < NARROW);
  setNarrow();
  new ResizeObserver(setNarrow).observe(el);

  const start = () => {
    P = makePalette();
    mode = P.dark;
    if (!def) def = factory(env);
    host.style.height = `${def.height ?? 480}px`;
    el.classList.toggle("dark", P.dark);
    el.classList.toggle("light", !P.dark);
    // the panel's text uses the same ink as the drawing (see STYLE in main.ts)
    el.style.setProperty("--app-ink", P.ink);
    el.style.setProperty("--app-canvas", `${def.narrowCanvas ?? 360}px`);
    const saved = inst ? storeOf(inst).toJSON() : null;
    inst?.dispose();
    inst = sketch2d(def.fn, {
      container: host,
      title: def.title,
      theme: P.dark ? "dark" : "light",
      panelWidth: def.panelWidth ?? 230,
      background: P.paper,
    });
    if (saved) {
      // twice: a restored select (e.g. a mode) can declare new params on the next run
      const s = storeOf(inst);
      s.loadJSON(saved);
      setTimeout(() => s.loadJSON(saved), 60);
    }
  };

  new IntersectionObserver((entries) => {
    for (const e of entries) {
      env.visible = e.isIntersecting;
      if (e.isIntersecting && !inst) start();
    }
  }, { rootMargin: "200px" }).observe(el);

  new MutationObserver(() => {
    const dark = document.body.classList.contains("quarto-dark");
    if (inst && dark !== mode) start();
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
}

/**
 * A playground page for one lecture app, in tekto's paper style: the drawing
 * first, black on white, the panel as wide as its controls need. It is always
 * running (there is no scrolling page to pause it).
 */
export function page(factory: AppFactory): (container: HTMLElement) => Sketch2DInstance {
  return (container) => {
    standalone = true;
    P = makePalette();
    const def = factory({ visible: true });
    return sketch2d(def.fn, { container, title: def.title, style: "paper", background: P.paper });
  };
}

// ── View transform ───────────────────────────────────────────────────────

export interface View {
  s: number;
  X(x: number): number;
  Y(y: number): number;
  /** Screen → world. */
  inv(px: number, py: number): [number, number];
}

/** Fit a world box (y up) into a screen rectangle, keeping proportions. */
export function fit(
  minx: number, miny: number, maxx: number, maxy: number,
  rx: number, ry: number, rw: number, rh: number, pad = 16,
): View {
  const w = Math.max(maxx - minx, 1e-9), h = Math.max(maxy - miny, 1e-9);
  const s = Math.min((rw - 2 * pad) / w, (rh - 2 * pad) / h);
  const ox = rx + (rw - w * s) / 2 - minx * s;
  const oy = ry + (rh + h * s) / 2 + miny * s;
  return {
    s,
    X: (x) => ox + x * s,
    Y: (y) => oy - y * s,
    inv: (px, py) => [(px - ox) / s, (oy - py) / s],
  };
}

// ── Drawing primitives ───────────────────────────────────────────────────

export type Pt = [number, number];

export function path(ctx: CanvasRenderingContext2D, pts: Pt[], close = false): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
}

export function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** Parallel hatching clipped to a screen-space polygon. */
export function hatch(ctx: CanvasRenderingContext2D, pts: Pt[], spacing = 5, angle = Math.PI / 4, width = 0.8): void {
  if (pts.length < 3) return;
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of pts) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); }
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
  const r = Math.hypot(maxx - minx, maxy - miny) / 2 + spacing;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  ctx.save();
  path(ctx, pts, true);
  ctx.clip();
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let t = -r; t <= r; t += spacing) {
    const px = cx - dy * t, py = cy + dx * t;
    ctx.moveTo(px - dx * r, py - dy * r);
    ctx.lineTo(px + dx * r, py + dy * r);
  }
  ctx.stroke();
  ctx.restore();
}

export function text(
  ctx: CanvasRenderingContext2D, s: string, x: number, y: number,
  align: CanvasTextAlign = "left", baseline: CanvasTextBaseline = "alphabetic", font = FONT,
): void {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  const fill = ctx.fillStyle;
  const lift = isGreyLabel(fill);
  if (lift) ctx.fillStyle = P.ink;
  ctx.fillText(s, x, y);
  if (lift) ctx.fillStyle = fill;
}

/**
 * Text is black or white, like the panel beside it. Many labels are drawn in a
 * mid grey (captions, hints, axis labels), which read as a third, washed-out
 * colour; text() draws those in ink instead. Left alone: paper-coloured text,
 * which sits on a dark fill; very faint greys, which are deliberate ghosts;
 * translucent and real colours. textgen.ts draws its prompt grey on purpose
 * (grey is what you wrote, ink what the model wrote) and does not use text().
 */
function isGreyLabel(fill: string | CanvasGradient | CanvasPattern): boolean {
  if (typeof fill !== "string") return false;
  const m = fill.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);   // opaque fills read back as hex
  if (!m) return false;
  const c = [1, 2, 3].map((i) => parseInt(m[i], 16));
  if (Math.max(...c) - Math.min(...c) > 8) return false;                // a colour, not a grey
  const { ink, paper } = P.rgb;
  const t = [0, 1, 2].reduce((s, i) => s + (c[i] - paper[i]) / ((ink[i] - paper[i]) || 1), 0) / 3;
  return t >= 0.25 && t < 0.97;
}

export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill = true): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) ctx.fill(); else ctx.stroke();
}

/** Clear the canvas and set ink as the default stroke/fill. */
export function clear(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = P.paper;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = P.ink;
  ctx.fillStyle = P.ink;
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setLineDash([]);
}

// ── Small maths ──────────────────────────────────────────────────────────

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pointInPoly(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function segIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/** Rectangle (as polygon) fully inside a simple polygon. */
export function polyInPoly(inner: Pt[], outer: Pt[]): boolean {
  for (const p of inner) if (!pointInPoly(p[0], p[1], outer)) return false;
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i], b = inner[(i + 1) % inner.length];
    for (let j = 0; j < outer.length; j++) {
      if (segIntersect(a, b, outer[j], outer[(j + 1) % outer.length])) return false;
    }
  }
  return true;
}

export function orientedRect(cx: number, cy: number, len: number, wid: number, ang: number): Pt[] {
  const ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
  const a = len / 2, b = wid / 2;
  return [
    [cx - ux * a - vx * b, cy - uy * a - vy * b],
    [cx + ux * a - vx * b, cy + uy * a - vy * b],
    [cx + ux * a + vx * b, cy + uy * a + vy * b],
    [cx - ux * a + vx * b, cy - uy * a + vy * b],
  ];
}
