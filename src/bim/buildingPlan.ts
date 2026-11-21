/**
 * A building's floor plans as a drawing — `buildingPlan(building)` gives a `Sheet`.
 *
 * One view per storey: the walls filled where they are solid and open where a door or a
 * window is (a window keeps its glass line), the rooms in their colour with name and area,
 * the stairs' outline, the floor slab's edge and its openings. Every part carries the record
 * it shows (`key: "walls/s"`), and with `keys` the plan also writes those names beside the
 * parts, with the model's coordinates along its edges: what an agent needs to find, in the
 * records, the thing it sees in the picture.
 *
 *   const sheet = buildingPlan(realizeBuilding(data), { storey: "eg" });
 *   sheet.toSVG();  sheet.toDXF();  await sheet.toPNG();
 *
 * A plan drawn from the records alone: a door has no leaf or swing (a record does not say
 * which way it opens), and openings are shown whatever their sill height.
 */
import { Vec2 } from "../core/math/vectors";
import { Polygon2D } from "../core/geometry/Polygon2D";
import { Sheet, DRAWING_PALETTE } from "../core/drawing/Sheet";
import type { Building, RealizedStorey } from "./building";

/** Options for `buildingPlan`: which storeys, at what scale, and what is written on them. */
export interface BuildingPlanOptions {
  /** One storey by its id (default: every storey, side by side, the lowest on the left). */
  storey?: string;
  /** Drawing scale, 100 = 1:100 (default: the largest of 1:20 … 1:1000 at which a storey is at most 200 mm on paper). */
  scale?: number;
  /** Write the records' names beside the parts ("walls/s" as "s") and the room's key under its name (default true). */
  keys?: boolean;
  /** Model coordinates in metres along the bottom and the left edge (default true). */
  coordinates?: boolean;
}

const WALL = "#2b2b2b";
const SCALES = [20, 50, 100, 200, 500, 1000];

/** A colour mixed with white: 0 keeps it, 1 is white. */
function pale(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "#f1f1f1";
  const c = (s: string) => Math.round(parseInt(s, 16) + (255 - parseInt(s, 16)) * amount).toString(16).padStart(2, "0");
  return `#${c(m[1])}${c(m[2])}${c(m[3])}`;
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
const distanceToLine = (p: Vec2, line: readonly Vec2[]) => {
  let d = Infinity;
  for (let i = 0; i + 1 < line.length; i++) d = Math.min(d, distanceToSegment(p, line[i], line[i + 1]));
  return d;
};

/** The point at `s` metres along a line, and the direction there. */
function along(line: readonly Vec2[], s: number): { p: Vec2; dir: Vec2 } {
  let rest = s;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1];
    const len = a.distTo(b);
    if (rest <= len || i === line.length - 2) {
      const dir = len > 0 ? new Vec2((b.x - a.x) / len, (b.y - a.y) / len) : new Vec2(1, 0);
      return { p: new Vec2(a.x + dir.x * rest, a.y + dir.y * rest), dir };
    }
    rest -= len;
  }
  return { p: line[0], dir: new Vec2(1, 0) };
}

/** The part of a line from `a` to `b` metres along it, its corners in between included. */
function piece(line: readonly Vec2[], a: number, b: number): Vec2[] {
  const out = [along(line, a).p];
  let s = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    s += line[i].distTo(line[i + 1]);
    if (s > a + 1e-9 && s < b - 1e-9) out.push(line[i + 1]);
  }
  out.push(along(line, b).p);
  return out;
}

const unit = (a: Vec2, b: Vec2) => { const l = a.distTo(b) || 1; return new Vec2((b.x - a.x) / l, (b.y - a.y) / l); };

/** A corner moved `h` to the left of its two directions (in and out), mitred; a sharp corner is cut short. */
function corner(p: Vec2, a: Vec2, b: Vec2, h: number): Vec2 {
  let nx = -(a.y + b.y), ny = a.x + b.x;                  // the corner's bisector, to the left
  const l = Math.hypot(nx, ny);
  if (l < 1e-9) return new Vec2(p.x - a.y * h, p.y + a.x * h);   // a line doubling back on itself
  nx /= l; ny /= l;
  const k = h / Math.max(0.3, nx * -a.y + ny * a.x);
  return new Vec2(p.x + nx * k, p.y + ny * k);
}

/** A line widened to a band `t` thick (mitred at its corners), as one closed outline. */
function band(line: readonly Vec2[], t: number, extendStart: number, extendEnd: number): Vec2[] {
  const pts = line.map((p) => new Vec2(p.x, p.y));
  const n = pts.length;
  const d0 = unit(pts[0], pts[1]), d1 = unit(pts[n - 2], pts[n - 1]);
  pts[0] = new Vec2(pts[0].x - d0.x * extendStart, pts[0].y - d0.y * extendStart);
  pts[n - 1] = new Vec2(pts[n - 1].x + d1.x * extendEnd, pts[n - 1].y + d1.y * extendEnd);
  const left: Vec2[] = [], right: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = unit(pts[Math.max(0, i - 1)], pts[Math.max(1, i)]), b = unit(pts[Math.min(n - 2, i)], pts[Math.min(n - 1, i + 1)]);
    left.push(corner(pts[i], a, b, t / 2));
    right.push(corner(pts[i], a, b, -t / 2));
  }
  return [...left, ...right.reverse()];
}

/** A closed line (its first point not repeated) moved `h` to its left, mitred at every corner. */
function ring(pts: readonly Vec2[], h: number): Vec2[] {
  const n = pts.length;
  return pts.map((p, i) => corner(p, unit(pts[(i + n - 1) % n], p), unit(p, pts[(i + 1) % n]), h));
}

/** A tick step so that a length gets about ten labels: 1, 2, 5, 10, … metres. */
function tickStep(length: number): number {
  for (const s of [1, 2, 5, 10, 20, 50, 100, 200, 500]) if (length / s <= 12) return s;
  return 1000;
}

interface Box { x0: number; y0: number; x1: number; y1: number }

/** The box around a storey's walls, slabs, rooms and stairs; null for an empty storey. */
function storeyBox(s: RealizedStorey): Box | null {
  const b: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const add = (p: { x: number; y: number }, pad = 0) => { b.x0 = Math.min(b.x0, p.x - pad); b.y0 = Math.min(b.y0, p.y - pad); b.x1 = Math.max(b.x1, p.x + pad); b.y1 = Math.max(b.y1, p.y + pad); };
  for (const w of s.walls.values()) for (const p of w.ribbon.centerline) add(p, w.ribbon.width / 2);
  for (const sl of s.slabs.values()) sl.boundary.forEach((p) => add(p));
  for (const sp of s.spaces.values()) sp.boundary.forEach((p) => add(p));
  for (const st of s.stairs.values()) st.footprint().forEach((p) => add(p));
  return b.x0 === Infinity ? null : b;
}

/**
 * The floor plans of a building as a `Sheet`: a view per storey (named by the storey's id),
 * every part keyed by its record. See the options for the scale and what is written.
 */
export function buildingPlan(building: Building, opts: BuildingPlanOptions = {}): Sheet {
  const storeys = opts.storey === undefined ? building.storeys : building.storeys.filter((s) => s.id === opts.storey);
  if (opts.storey !== undefined && !storeys.length) {
    throw new Error(`buildingPlan: no storey "${opts.storey}" (storeys: ${building.storeys.map((s) => s.id).join(", ") || "none"})`);
  }
  const boxes = storeys.map((s) => storeyBox(s) ?? { x0: 0, y0: 0, x1: 4, y1: 3 });
  const extent = Math.max(1, ...boxes.map((b) => Math.max(b.x1 - b.x0, b.y1 - b.y0)));
  const scale = opts.scale ?? SCALES.find((s) => (extent * 1000) / s <= 200) ?? 1000;
  const keys = opts.keys ?? true, coordinates = opts.coordinates ?? true;

  const sheet = new Sheet({
    scale,
    layers: {
      slab: { color: DRAWING_PALETTE.faint, weight: 0.13 },
      room: { color: DRAWING_PALETTE.ink },
      stair: { color: DRAWING_PALETTE.annotation, weight: 0.18 },
      wall: { color: WALL, weight: 0.25 },
      opening: { color: WALL, weight: 0.13 },
      key: { color: DRAWING_PALETTE.accent },
      grid: { color: DRAWING_PALETTE.faint, weight: 0.13 },
    },
  });
  const mm = (v: number) => sheet.paper(v);                 // paper mm → metres
  const data = building.data;
  let shift = 0;

  storeys.forEach((s, index) => {
    const box = boxes[index];
    // A storey keeps the model's coordinates: its view is moved (the first one not at all), not its geometry.
    if (index > 0) shift += boxes[index - 1].x1 - box.x0 + mm(34);
    const view = sheet.view(s.id, { at: [shift, 0], title: `${s.record.name} · storeys/${s.id}` });

    // The floor slab's edge and its openings.
    for (const [id, slab] of s.slabs) {
      if ((data.slabs?.[id]?.level ?? "floor") !== "floor") continue;
      view.polyline(slab.boundary, { closed: true, layer: "slab", key: `slabs/${id}` });
      for (const o of data.slabs?.[id]?.openings ?? []) {
        view.rect(o.x - o.width / 2, o.y - o.depth / 2, o.width, o.depth, { layer: "slab", dash: "dashed", key: `slabs/${id}` });
      }
    }

    // Rooms: the floor in the room's colour.
    for (const [id, space] of s.spaces) {
      const colour = building.types.spaces?.[(data.spaces?.[id]?.use ?? "").toLowerCase()]?.colour;
      view.fill(space.boundary, { color: colour ? pale(colour, 0.55) : "#f1f1f1", layer: "room", key: `spaces/${id}` });
    }

    // Stairs: the outline.
    for (const [id, stair] of s.stairs) {
      const outline = stair.footprint();
      view.polyline(outline, { closed: true, layer: "stair", key: `stairs/${id}` });
      if (keys) view.text(id, Polygon2D.centroid2D(outline), { size: 1.6, layer: "key", align: "center", baseline: "middle", key: `stairs/${id}` });
    }

    // Walls: solid between their openings.
    const walls = [...s.walls];
    for (const [id, wall] of walls) {
      const line = wall.ribbon.centerline, t = wall.ribbon.width, length = wall.ribbon.length;
      const closed = wall.ribbon.isClosedPolyline;
      // An end that meets another wall runs on to that wall's middle, so corners are whole.
      const meets = (end: Vec2) => walls.some(([oid, other]) => oid !== id && distanceToLine(end, other.ribbon.centerline) <= (other.ribbon.width + t) / 2 + 0.05);
      const holes = Object.entries(data.openings ?? {})
        .filter(([oid, o]) => o.wall === id && s.openings.has(oid))
        .map(([oid, o]) => ({ id: oid, kind: o.kind, a: Math.max(0, o.at - o.width / 2), b: Math.min(length, o.at + o.width / 2) }))
        .filter((h) => h.b > h.a)
        .sort((p, q) => p.a - q.a);
      // The solid runs. A closed wall has no ends: it is one ring, or, with openings, a line
      // that starts in the middle of its first opening.
      if (closed && !holes.length) {
        const loop = line.slice(0, -1);
        view.fill([ring(loop, t / 2), ring(loop, -t / 2)], { color: WALL, layer: "wall", key: `walls/${id}` });
      } else {
        let run = line, gaps = holes.map((h) => ({ a: h.a, b: h.b }));
        if (closed) {
          const start = (holes[0].a + holes[0].b) / 2;
          run = [...piece(line, start, length), ...piece(line, 0, start).slice(1)];
          gaps = [{ a: 0, b: holes[0].b - start }, ...holes.slice(1).map((h) => ({ a: h.a - start, b: h.b - start })), { a: length - (start - holes[0].a), b: length }];
        }
        let from = 0;
        for (const gap of [...gaps, { a: length, b: length }]) {
          if (gap.a - from > 1e-6) {
            const outline = band(piece(run, from, gap.a), t, from === 0 && !closed && meets(line[0]) ? t / 2 : 0, gap.a === length && !closed && meets(line[line.length - 1]) ? t / 2 : 0);
            view.fill(outline, { color: WALL, layer: "wall", key: `walls/${id}` });
          }
          from = Math.max(from, gap.b);
        }
      }
      for (const hole of holes) {
        // The opening: the wall's two faces across it, and the glass of a window.
        const a = along(line, hole.a), b = along(line, hole.b);
        const n = new Vec2(-a.dir.y, a.dir.x);
        const key = `openings/${hole.id}`;
        const h = t / 2;
        view.fill([[a.p.x + n.x * h, a.p.y + n.y * h], [b.p.x + n.x * h, b.p.y + n.y * h], [b.p.x - n.x * h, b.p.y - n.y * h], [a.p.x - n.x * h, a.p.y - n.y * h]], { color: "#ffffff", layer: "opening", key });
        for (const side of hole.kind === "window" ? [-1, 0, 1] : [-1, 1]) {
          const o = (side * t) / 2;
          view.polyline([[a.p.x + n.x * o, a.p.y + n.y * o], [b.p.x + n.x * o, b.p.y + n.y * o]], { layer: "opening", weight: side === 0 ? 0.25 : 0.13, key });
        }
        if (keys) {
          const m = along(line, (hole.a + hole.b) / 2);
          const off = t / 2 + mm(2.2);
          view.text(hole.id, [m.p.x + n.x * off, m.p.y + n.y * off], { size: 1.5, layer: "key", align: "center", baseline: "middle", key });
        }
      }
      if (keys) {
        // The wall's name beside its longest solid run would be best; its middle is close enough.
        const m = along(line, length * (holes.length ? 0.12 : 0.5));
        const n = new Vec2(-m.dir.y, m.dir.x);
        const off = -(t / 2 + mm(2.2));
        view.text(id, [m.p.x + n.x * off, m.p.y + n.y * off], { size: 1.5, layer: "key", align: "center", baseline: "middle", key: `walls/${id}` });
      }
    }

    // Rooms: name, area and key, over the walls so a small room's text stays readable.
    for (const [id, space] of s.spaces) {
      const c = Polygon2D.centroid2D(space.boundary);
      const key = `spaces/${id}`;
      view.text(space.name, [c.x, c.y + mm(2.6)], { size: 2.4, layer: "room", align: "center", baseline: "middle", key });
      view.text(`${space.area().toFixed(1)} m²`, [c.x, c.y - mm(0.6)], { size: 1.8, color: DRAWING_PALETTE.annotation, align: "center", baseline: "middle", key });
      if (keys) view.text(id, [c.x, c.y - mm(3.4)], { size: 1.5, layer: "key", align: "center", baseline: "middle", key });
    }

    // The model's coordinates along the bottom and the left.
    if (coordinates) {
      const gap = mm(5), tick = mm(1.2);
      const y = box.y0 - gap, x = box.x0 - gap;
      const stepX = tickStep(box.x1 - box.x0), stepY = tickStep(box.y1 - box.y0);
      view.polyline([[box.x0, y], [box.x1, y]], { layer: "grid" });
      view.polyline([[x, box.y0], [x, box.y1]], { layer: "grid" });
      for (let v = Math.ceil(box.x0 - 1e-9); v <= box.x1 + 1e-9; v++) {
        const major = v % stepX === 0;
        view.polyline([[v, y], [v, y - (major ? tick : tick / 2)]], { layer: "grid" });
        if (major) view.text(String(v), [v, y - tick - mm(0.6)], { size: 1.6, layer: "grid", align: "center", baseline: "top" });
      }
      for (let v = Math.ceil(box.y0 - 1e-9); v <= box.y1 + 1e-9; v++) {
        const major = v % stepY === 0;
        view.polyline([[x, v], [x - (major ? tick : tick / 2), v]], { layer: "grid" });
        if (major) view.text(String(v), [x - tick - mm(0.6), v], { size: 1.6, layer: "grid", align: "right", baseline: "middle" });
      }
      view.text("x (m)", [box.x1 + mm(2), y], { size: 1.6, layer: "grid", align: "left", baseline: "middle" });
      view.text("y (m)", [x, box.y1 + mm(2.5)], { size: 1.6, layer: "grid", align: "center", baseline: "bottom" });
    }
  });
  return sheet;
}
