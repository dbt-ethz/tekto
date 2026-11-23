/**
 * A Sheet as pixels — the PNG output beside `toSVG` and `toDXF`, with no browser.
 *
 * An agent working on a file in Node cannot open an SVG and look at it; an image it can see.
 * `rasterizeSheet` draws the sheet's exploded primitives (the same list every output draws)
 * into an RGBA buffer, and `sheetToPNG` packs it as a PNG file. Text is drawn with a small
 * built-in stroke font (Latin letters, digits, the usual signs, umlauts), so the result is the
 * same on every machine and needs no fonts installed.
 *
 *   const png = await sheet.toPNG({ width: 1600 });      // Uint8Array, in Node and in the browser
 */
import { boundsOf, DASH_PATTERNS, type Pt, type Sheet } from "./Sheet";

/** Options for `rasterizeSheet` and `sheet.toPNG`: the image's size, its margin and its paper colour. */
export interface SheetRasterOptions {
  /** Width of the image in pixels (default 1600). The height follows from the drawing. */
  width?: number;
  /** The image is scaled down to stay under this height in pixels (default 2400). */
  maxHeight?: number;
  /** Margin around the drawing in paper millimetres (default 8). */
  margin?: number;
  /** Paper colour (default "#ffffff"). */
  background?: string;
}

/** A drawn sheet: `data` is RGBA, row by row from the top, as `ImageData` takes it. */
export interface SheetRaster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  /** Sheet (model) coordinates → pixel, for finding a drawn thing in the image. */
  toPixel(p: Pt): Pt;
}

type RGB = [number, number, number];

const NAMED: Record<string, string> = { black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff", grey: "#808080", gray: "#808080" };

/** "#rgb", "#rrggbb" or one of a few names → [r, g, b]; anything else is drawn black. */
function parseColor(c: string): RGB {
  let s = (NAMED[c.toLowerCase()] ?? c).trim();
  if (/^#[0-9a-f]{3}$/i.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(s);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}

// ── The stroke font ───────────────────────────────────────────────────────────
// Glyphs on a 4 × 6 grid (baseline 0, x-height 4, capitals 6, descenders to −2): polylines
// "x,y x,y" separated by ";". A stroke of one point's length is a dot.

const GLYPHS: Record<string, string> = {
  A: "0,0 2,6 4,0;0.67,2 3.33,2", B: "0,0 0,6 3,6 4,5 4,4 3,3 0,3;3,3 4,2 4,1 3,0 0,0", C: "4,5 3,6 1,6 0,5 0,1 1,0 3,0 4,1",
  D: "0,0 0,6 2.5,6 4,4.5 4,1.5 2.5,0 0,0", E: "4,6 0,6 0,0 4,0;0,3 3,3", F: "4,6 0,6 0,0;0,3 3,3",
  G: "4,5 3,6 1,6 0,5 0,1 1,0 3,0 4,1 4,3 2,3", H: "0,0 0,6;4,0 4,6;0,3 4,3", I: "2,0 2,6;1,0 3,0;1,6 3,6",
  J: "0,1 1,0 2.5,0 3.5,1 3.5,6", K: "0,0 0,6;4,6 0,2.5;1.3,3.6 4,0", L: "0,6 0,0 4,0", M: "0,0 0,6 2,2.5 4,6 4,0",
  N: "0,0 0,6 4,0 4,6", O: "1,0 0,1 0,5 1,6 3,6 4,5 4,1 3,0 1,0", P: "0,0 0,6 3,6 4,5 4,4 3,3 0,3",
  Q: "1,0 0,1 0,5 1,6 3,6 4,5 4,1 3,0 1,0;2.5,1.5 4,0", R: "0,0 0,6 3,6 4,5 4,4 3,3 0,3;2,3 4,0",
  S: "4,5 3,6 1,6 0,5 0,4 1,3 3,3 4,2 4,1 3,0 1,0 0,1", T: "0,6 4,6;2,6 2,0", U: "0,6 0,1 1,0 3,0 4,1 4,6", V: "0,6 2,0 4,6",
  W: "0,6 1,0 2,4 3,0 4,6", X: "0,0 4,6;0,6 4,0", Y: "0,6 2,3 4,6;2,3 2,0", Z: "0,6 4,6 0,0 4,0",
  "0": "1.5,0 0.5,1.5 0.5,4.5 1.5,6 2.5,6 3.5,4.5 3.5,1.5 2.5,0 1.5,0", "1": "1,4.5 2.5,6 2.5,0", "2": "0,5 1,6 3,6 4,5 4,3.8 0,0 4,0",
  "3": "0,5 1,6 3,6 4,5 4,4 3,3 1.5,3;3,3 4,2 4,1 3,0 1,0 0,1", "4": "3,0 3,6 0,2 4,2", "5": "4,6 0,6 0,3.5 3,3.5 4,2.5 4,1 3,0 1,0 0,1",
  "6": "3.5,6 1.5,6 0,4 0,1 1,0 3,0 4,1 4,2.5 3,3.5 1,3.5 0,2.5", "7": "0,6 4,6 1.5,0",
  "8": "1,3 0,4 0,5 1,6 3,6 4,5 4,4 3,3 1,3 0,2 0,1 1,0 3,0 4,1 4,2 3,3", "9": "0.5,0 2.5,0 4,2 4,5 3,6 1,6 0,5 0,3.5 1,2.5 3,2.5 4,3.5",
  a: "4,4 4,0;4,3 3,4 1,4 0,3 0,1 1,0 3,0 4,1", b: "0,6 0,0;0,3 1,4 3,4 4,3 4,1 3,0 1,0 0,1", c: "4,3 3,4 1,4 0,3 0,1 1,0 3,0 4,1",
  d: "4,6 4,0;4,3 3,4 1,4 0,3 0,1 1,0 3,0 4,1", e: "0,2 4,2 4,3 3,4 1,4 0,3 0,1 1,0 3,0 4,0.8", f: "3.5,6 2.5,6 1.5,5 1.5,0;0.5,4 3,4",
  g: "4,4 4,-1 3,-2 1,-2 0,-1.2;4,3 3,4 1,4 0,3 0,1 1,0 3,0 4,1", h: "0,6 0,0;0,3 1,4 3,4 4,3 4,0", i: "2,4 2,0;2,5.5", j: "2.5,4 2.5,-1 1.5,-2 0.5,-2;2.5,5.5",
  k: "0,6 0,0;3.5,4 0,1.5;1.2,2.4 3.8,0", l: "2,6 2,0", m: "0,4 0,0;0,3 1,4 1.5,4 2,3 2,0;2,3 3,4 3.5,4 4,3 4,0", n: "0,4 0,0;0,3 1,4 3,4 4,3 4,0",
  o: "1,0 0,1 0,3 1,4 3,4 4,3 4,1 3,0 1,0", p: "0,4 0,-2;0,3 1,4 3,4 4,3 4,1 3,0 1,0 0,1", q: "4,4 4,-2;4,3 3,4 1,4 0,3 0,1 1,0 3,0 4,1",
  r: "0.5,4 0.5,0;0.5,3 1.5,4 3,4 3.5,3.5", s: "4,3.2 3,4 1,4 0,3.2 0,2.6 1,2 3,2 4,1.4 4,0.8 3,0 1,0 0,0.8", t: "1.5,6 1.5,1 2.5,0 3.5,0;0.5,4 3,4",
  u: "0,4 0,1 1,0 3,0 4,1;4,4 4,0", v: "0,4 2,0 4,4", w: "0,4 1,0 2,3 3,0 4,4", x: "0,0 4,4;0,4 4,0", y: "0,4 2,0;4,4 1,-2 0,-2", z: "0,4 4,4 0,0 4,0",
  ".": "2,0.1", ",": "2,0.3 2,0 1.4,-0.9", ":": "2,0.1;2,3.2", ";": "2,0.3 2,0 1.4,-0.9;2,3.2", "-": "0.8,2.5 3.2,2.5", "–": "0,2.5 4,2.5", "—": "0,2.5 4,2.5",
  "+": "0.5,2.5 3.5,2.5;2,1 2,4", "/": "0.5,0 3.5,6", "\\": "0.5,6 3.5,0", "(": "2.8,6.5 1.5,5 1.5,1 2.8,-0.5", ")": "1.2,6.5 2.5,5 2.5,1 1.2,-0.5",
  "[": "3,6.5 1.5,6.5 1.5,-0.5 3,-0.5", "]": "1,6.5 2.5,6.5 2.5,-0.5 1,-0.5", "'": "2,6 2,4.8", "\"": "1.3,6 1.3,4.8;2.7,6 2.7,4.8",
  "=": "0.5,3.3 3.5,3.3;0.5,1.7 3.5,1.7", "_": "0,-0.6 4,-0.6", "*": "2,2 2,5;0.7,2.75 3.3,4.25;0.7,4.25 3.3,2.75",
  "#": "1.2,0.5 1.8,5.5;2.6,0.5 3.2,5.5;0.3,2 3.8,2;0.4,4 3.9,4", "%": "0.5,0 3.5,6;0.3,5.9 1.3,5.9 1.3,4.6 0.3,4.6 0.3,5.9;2.7,1.4 3.7,1.4 3.7,0.1 2.7,0.1 2.7,1.4",
  "°": "1.3,6 2.7,6 2.7,4.6 1.3,4.6 1.3,6", "²": "0.8,5.6 1.3,6 2.4,6 2.9,5.6 2.9,5 0.8,3.4 3,3.4", "<": "3.5,4.5 0.5,2.5 3.5,0.5", ">": "0.5,4.5 3.5,2.5 0.5,0.5",
  "!": "2,6 2,1.6;2,0.1", "?": "0.3,5 1.2,6 2.8,6 3.7,5 3.7,4 2,2.6 2,1.6;2,0.1", "&": "4,0 1,4.5 1,5.4 1.8,6 2.6,5.4 2.6,4.6 0,2 0,1 1,0 2.2,0 4,2.2",
  "×": "0.7,1 3.3,4;0.7,4 3.3,1", "→": "0,2.5 4,2.5;2.8,3.7 4,2.5 2.8,1.3", "·": "2,2.6", "ß": "0,0 0,5 1,6 2.5,6 3.3,5 3.3,4 2,3 3.5,2.4 3.8,1.2 3,0 1.6,0",
  " ": "",
};
/** A character the font does not have. */
const UNKNOWN = "0.5,0 3.5,0 3.5,5 0.5,5 0.5,0";
/** Two dots over a letter (U+0308): above the x-height, or above a capital. */
const DOTS_LOW = "1,5.5;3,5.5", DOTS_HIGH = "1,7.1;3,7.1";
/** Letters and signs that take less room than the others (digits keep one width, so numbers line up). */
const NARROW = "iIljt.,:;'!|()[]";

const parsed = new Map<string, number[][]>();
function strokesOf(def: string): number[][] {
  let s = parsed.get(def);
  if (!s) {
    s = def ? def.split(";").map((line) => line.trim().split(/[ ,]+/).map(Number)) : [];
    parsed.set(def, s);
  }
  return s;
}

/** A text's strokes in its own frame: x from 0 to the right in units of the text height, y up from the baseline. */
function textStrokes(text: string): { strokes: number[][]; advance: number } {
  // Capitals are 0.72 of the height (as in the sans-serif the SVG names); a character advances 0.6.
  const u = 0.72 / 6, glyphW = 0.8, adv = 0.6, inset = (adv - 4 * glyphW * u) / 2;
  const strokes: number[][] = [];
  let x = 0, last = "", lastW = adv;
  for (const ch of text.normalize("NFD")) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x300 && code <= 0x36f) {              // a combining mark: on the letter before
      if (code === 0x308) for (const s of strokesOf(last === last.toUpperCase() && last !== last.toLowerCase() ? DOTS_HIGH : DOTS_LOW)) {
        strokes.push(s.map((v, i) => (i % 2 === 0 ? x - (adv + lastW) / 2 + inset + v * glyphW * u : v * u)));
      }
      continue;
    }
    const w = NARROW.includes(ch) ? 0.36 : ch === " " ? 0.45 : adv;      // a narrow letter sits in the middle of a narrower cell
    for (const s of strokesOf(GLYPHS[ch] ?? UNKNOWN)) strokes.push(s.map((v, i) => (i % 2 === 0 ? x + inset - (adv - w) / 2 + v * glyphW * u : v * u)));
    x += w;
    lastW = w;
    last = ch;
  }
  return { strokes, advance: x };
}

// ── Drawing ───────────────────────────────────────────────────────────────────

/** The sheet as pixels: its primitives in order, anti-aliased, on `background`. */
export function rasterizeSheet(sheet: Sheet, opts: SheetRasterOptions = {}): SheetRaster {
  const prims = sheet.explode();
  const b = boundsOf(prims) ?? { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } };
  const mmPerUnit = 1000 / sheet.scale;                                 // model units → paper mm
  const margin = opts.margin ?? 8;
  const wMm = Math.max(1e-6, (b.max.x - b.min.x) * mmPerUnit) + 2 * margin;
  const hMm = Math.max(1e-6, (b.max.y - b.min.y) * mmPerUnit) + 2 * margin;
  const wantW = Math.max(16, Math.round(opts.width ?? 1600));
  const pxPerMm = Math.min(wantW / wMm, (opts.maxHeight ?? 2400) / hMm);
  const width = Math.max(1, Math.round(wMm * pxPerMm)), height = Math.max(1, Math.round(hMm * pxPerMm));
  // Drawn larger and averaged down: 3 × 3 samples a pixel, 2 × 2 for a very large image.
  const ss = width * height * 9 <= 24e6 ? 3 : 2;
  const W = width * ss, H = height * ss;
  const k = mmPerUnit * pxPerMm * ss;                                   // model units → samples
  const X = (p: Pt) => (p.x - b.min.x) * k + margin * pxPerMm * ss;
  const Y = (p: Pt) => (b.max.y - p.y) * k + margin * pxPerMm * ss;
  const mm = (v: number) => v * pxPerMm * ss;                           // paper mm → samples

  const buf = new Uint8Array(W * H * 3);
  const bg = parseColor(opts.background ?? "#ffffff");
  for (let i = 0; i < buf.length; i += 3) { buf[i] = bg[0]; buf[i + 1] = bg[1]; buf[i + 2] = bg[2]; }

  /** Fill rings (flat x, y in samples) by the even-odd rule. */
  const fill = (rings: number[][], c: RGB) => {
    let y0 = Infinity, y1 = -Infinity;
    for (const r of rings) for (let i = 1; i < r.length; i += 2) { y0 = Math.min(y0, r[i]); y1 = Math.max(y1, r[i]); }
    const ya = Math.max(0, Math.floor(y0)), yb = Math.min(H - 1, Math.ceil(y1));
    const xs: number[] = [];
    for (let y = ya; y <= yb; y++) {
      const sy = y + 0.5;
      xs.length = 0;
      for (const r of rings) {
        const n = r.length / 2;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const ay = r[j * 2 + 1], by = r[i * 2 + 1];
          if ((ay <= sy) === (by <= sy)) continue;
          xs.push(r[j * 2] + ((sy - ay) / (by - ay)) * (r[i * 2] - r[j * 2]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let e = 0; e + 1 < xs.length; e += 2) {
        const xa = Math.max(0, Math.ceil(xs[e] - 0.5)), xb = Math.min(W - 1, Math.floor(xs[e + 1] - 0.5));
        for (let x = xa, o = (y * W + xa) * 3; x <= xb; x++, o += 3) { buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; }
      }
    }
  };

  /** One straight stroke, `w` samples wide: with square ends (so the strokes of a line join), or cut off flat (a dash). */
  const segment = (ax: number, ay: number, bx: number, by: number, w: number, c: RGB, flat = false) => {
    let dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    const h = w / 2;
    if (len < 1e-9) { fill([[ax - h, ay - h, ax + h, ay - h, ax + h, ay + h, ax - h, ay + h]], c); return; }
    dx = (dx / len) * h; dy = (dy / len) * h;
    const ex = flat ? 0 : dx, ey = flat ? 0 : dy;                         // how far past its ends
    fill([[ax - ex + dy, ay - ey - dx, bx + ex + dy, by + ey - dx, bx + ex - dy, by + ey + dx, ax - ex - dy, ay - ey + dx]], c);
  };

  /** A line through points (samples), solid or in a dash pattern (samples: dash, gap, …). */
  const stroke = (pts: number[], w: number, c: RGB, pattern?: number[]) => {
    if (pts.length === 2) { segment(pts[0], pts[1], pts[0], pts[1], w, c); return; }
    let phase = 0, idx = 0;                                            // where in the pattern we are
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
      if (!pattern) { segment(ax, ay, bx, by, w, c); continue; }
      const len = Math.hypot(bx - ax, by - ay);
      let t = 0;
      while (t < len - 1e-9) {
        const step = Math.min(pattern[idx] - phase, len - t);
        if (idx % 2 === 0) segment(ax + ((bx - ax) * t) / len, ay + ((by - ay) * t) / len, ax + ((bx - ax) * (t + step)) / len, ay + ((by - ay) * (t + step)) / len, w, c, true);
        t += step; phase += step;
        if (phase >= pattern[idx] - 1e-9) { phase = 0; idx = (idx + 1) % pattern.length; }
      }
    }
  };

  const penOf = (weightMm: number) => Math.max(ss * 0.8, mm(weightMm));
  const dashOf = (dash: string) => (dash === "solid" ? undefined : DASH_PATTERNS[dash as keyof typeof DASH_PATTERNS].map((d) => Math.max(1, mm(d))));
  const arcPoints = (center: Pt, radius: number, startDeg: number, sweepDeg: number): number[] => {
    const steps = Math.max(8, Math.ceil((Math.abs(sweepDeg) / 360) * Math.max(24, radius * k * 0.5)));
    const out: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = ((startDeg + (sweepDeg * i) / steps) * Math.PI) / 180;
      const p = { x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) };
      out.push(X(p), Y(p));
    }
    return out;
  };

  for (const p of prims) {
    if (p.kind === "fill") {
      fill(p.rings.map((r) => r.flatMap((q) => [X(q), Y(q)])), parseColor(p.color));
    } else if (p.kind === "polyline") {
      const pts = p.points.flatMap((q) => [X(q), Y(q)]);
      if (p.closed && p.points.length > 2) pts.push(pts[0], pts[1]);
      stroke(pts, penOf(p.style.weight), parseColor(p.style.color), dashOf(p.style.dash));
    } else if (p.kind === "circle") {
      stroke(arcPoints(p.center, p.radius, 0, 360), penOf(p.style.weight), parseColor(p.style.color), dashOf(p.style.dash));
    } else if (p.kind === "arc") {
      let sweep = (p.endDeg - p.startDeg) % 360; if (sweep <= 0) sweep += 360;
      stroke(arcPoints(p.center, p.radius, p.startDeg, sweep), penOf(p.style.weight), parseColor(p.style.color), dashOf(p.style.dash));
    } else {
      const { strokes, advance } = textStrokes(p.text);
      const size = p.height * k;                                         // the text height in samples
      const ox = p.align === "left" ? 0 : p.align === "center" ? -advance / 2 : -advance;
      const oy = p.baseline === "bottom" ? 0 : p.baseline === "middle" ? -0.36 : -0.72;
      const r = (p.rotation * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
      const ax = X(p.at), ay = Y(p.at);
      const pen = Math.max(ss * 0.9, size * 0.085);
      const c = parseColor(p.style.color);
      for (const s of strokes) {
        const pts: number[] = [];
        for (let i = 0; i < s.length; i += 2) {
          const x = (s[i] + ox) * size, y = (s[i + 1] + oy) * size;
          pts.push(ax + x * cos - y * sin, ay - (x * sin + y * cos));    // the image's y runs down
        }
        stroke(pts, pen, c);
      }
    }
  }

  // Average the samples down.
  const data = new Uint8ClampedArray(width * height * 4);
  const n = ss * ss;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, bl = 0;
      for (let j = 0; j < ss; j++) {
        let o = ((y * ss + j) * W + x * ss) * 3;
        for (let i = 0; i < ss; i++, o += 3) { r += buf[o]; g += buf[o + 1]; bl += buf[o + 2]; }
      }
      const o = (y * width + x) * 4;
      data[o] = r / n; data[o + 1] = g / n; data[o + 2] = bl / n; data[o + 3] = 255;
    }
  }
  return { width, height, data, toPixel: (p) => ({ x: X(p) / ss, y: Y(p) / ss }) };
}

// ── PNG ───────────────────────────────────────────────────────────────────────

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * RGBA pixels as a PNG file (8-bit RGB: the alpha channel is dropped, a drawing is opaque).
 * Uses the platform's `CompressionStream`: browsers and Node 18 or later.
 */
export async function encodePNG(image: { width: number; height: number; data: ArrayLike<number> }): Promise<Uint8Array> {
  const { width, height, data } = image;
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0, o = 0; y < height; y++) {
    raw[o++] = 0;                                                        // filter: none
    for (let x = 0, i = y * width * 4; x < width; x++, i += 4) { raw[o++] = data[i]; raw[o++] = data[i + 1]; raw[o++] = data[i + 2]; }
  }
  if (typeof CompressionStream === "undefined") throw new Error("encodePNG needs CompressionStream (a browser, or Node 18 or later)");
  const packed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const chunk = (type: string, body: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + body.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(body, 8);
    view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
    return out;
  };
  const head = new Uint8Array(13);
  const hv = new DataView(head.buffer);
  hv.setUint32(0, width); hv.setUint32(4, height);
  head[8] = 8; head[9] = 2;                                               // 8 bits a channel, RGB
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", packed), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** The sheet as a PNG file: `rasterizeSheet`, then `encodePNG`. */
export async function sheetToPNG(sheet: Sheet, opts: SheetRasterOptions = {}): Promise<Uint8Array> {
  return encodePNG(rasterizeSheet(sheet, opts));
}
