/**
 * Axonometric — a parallel view of 3D geometry for a 2D canvas or a Sheet.
 *
 * Drawing a model as a figure (an axonometry in a book, a mesh on paper) needs the same few
 * steps every time: turn the model by an azimuth, tilt it by an elevation, leave out the
 * faces turned away, sort the rest from far to near so the near ones are painted over the
 * far ones, and fit the result into the drawing area. `Axonometric` does those steps; the
 * app draws the polygons it returns in any style.
 *
 *   const axo = new Axonometric({ azimuth: 225, elevation: 30 });     // from the south-west, Z up
 *   const faces = axo.polygons(walls.map((w) => ({ points: w.corners, data: w })));
 *   const view = axo.fit(faces.flatMap((f) => f.points), width, height, 24);
 *   for (const f of faces) { path(ctx, f.points.map((p) => [view.x + p.x * view.scale, view.y - p.y * view.scale])); … }
 *
 * The view's coordinates are y up (as a Sheet's): a 2D point (u, v) is drawn on a canvas at
 * (`view.x + u * view.scale`, `view.y - v * view.scale`), the convention of `fitSheet` and
 * of a 2D sketch's drag handles. For a Sheet, pass `axo.sheetProjection()` as a view's
 * `project`.
 *
 * Sorting whole polygons by their mean depth (the painter's algorithm) is right for the
 * convex, non-intersecting faces of most models; faces that interpenetrate or overlap
 * cyclically can come out in the wrong order.
 */
import { Vec2, Vec3 } from "../math/vectors";
import type { Mesh } from "../geometry/mesh/Mesh";

/** Options for `new Axonometric(…)`: the direction the model is seen from, and which axis is up. */
export interface AxonometricOptions {
  /**
   * Where the viewer stands around the model, in degrees counter-clockwise from +x seen from
   * above: 270 looks from the front (−y in a Z-up model), 225 from the front left (default).
   */
  azimuth?: number;
  /** How far the viewer looks down, in degrees above the horizon (default 30; 90 is a plan). */
  elevation?: number;
  /** The model's up axis (default "z", as tekto's buildings; "y" for three.js and MeshFactory). */
  up?: "z" | "y";
}

/** A polygon of the view, as `polygons` and `meshFaces` return them: far ones first. */
export interface AxoPolygon<T = undefined> {
  /** The corners in the view (y up). */
  points: Vec2[];
  /** The mean depth: larger is farther away. */
  depth: number;
  /** The face's normal in the model (unit length), from its first corners when not given. */
  normal: Vec3;
  /** 0 to 1: how much the face turns to the light (`shade`), for a grey of its own. */
  light: number;
  data: T;
}

/** The angle whose sine is 1/√3: the elevation of an isometric view (35.26°). */
const ISO_ELEVATION = (Math.asin(1 / Math.sqrt(3)) * 180) / Math.PI;

/** A parallel projection of 3D points onto a view plane, with depth, back-face culling and painter's order. */
export class Axonometric {
  /** The view's x axis in the model. */
  readonly right: Vec3;
  /** The view's y axis in the model. */
  readonly upward: Vec3;
  /** The direction the viewer looks in (into the drawing). */
  readonly forward: Vec3;
  readonly azimuth: number;
  readonly elevation: number;
  readonly up: "z" | "y";
  /** Where the light comes from (unit vector towards the light): above, over the viewer's left shoulder. */
  light: Vec3;

  constructor(opts: AxonometricOptions = {}) {
    this.azimuth = opts.azimuth ?? 225;
    this.elevation = opts.elevation ?? 30;
    this.up = opts.up ?? "z";
    if (!Number.isFinite(this.azimuth) || !Number.isFinite(this.elevation) || this.elevation < -90 || this.elevation > 90) {
      throw new Error(`Axonometric: azimuth must be a number and elevation between -90 and 90 degrees, got ${opts.azimuth} and ${opts.elevation}`);
    }
    const az = (this.azimuth * Math.PI) / 180;
    // At a plan (90°) keep the turn: look down a hair off vertical so the view's axes stay defined.
    const el = (Math.max(-89.999, Math.min(89.999, this.elevation)) * Math.PI) / 180;
    const h = Math.cos(el), v = Math.sin(el);
    const yUp = this.up === "y";
    // From the model towards the viewer; in a Y-up model the ground is x, −z (a Z-up model turned).
    const eye = yUp ? new Vec3(h * Math.cos(az), v, -h * Math.sin(az)) : new Vec3(h * Math.cos(az), h * Math.sin(az), v);
    const worldUp = yUp ? new Vec3(0, 1, 0) : new Vec3(0, 0, 1);
    this.forward = eye.neg();
    this.right = this.forward.cross(worldUp).normalize();
    this.upward = this.right.cross(this.forward).normalize();
    // Light from above and from the viewer's left, a little behind.
    this.light = worldUp.mul(1.4).sub(this.right.mul(0.7)).sub(this.forward.mul(0.5)).normalize();
  }

  /** An isometric view: the three axes equally foreshortened (elevation 35.26°), from the front left unless `azimuth` says otherwise. */
  static isometric(opts: Omit<AxonometricOptions, "elevation"> = {}): Axonometric {
    return new Axonometric({ azimuth: 225, ...opts, elevation: ISO_ELEVATION });
  }

  /** A model point in the view (y up). */
  project(p: Vec3): Vec2 {
    return new Vec2(p.dot(this.right), p.dot(this.upward));
  }

  /** How far a point is from the viewer, along the view: larger is farther. */
  depth(p: Vec3): number {
    return p.dot(this.forward);
  }

  /** Whether a face with this outward normal is turned towards the viewer. */
  facing(normal: Vec3): boolean {
    return normal.dot(this.forward) < 0;
  }

  /** 0 to 1: how much a face with this normal turns to the light (0 when it turns away). */
  shade(normal: Vec3): number {
    return Math.max(0, normal.normalize().dot(this.light));
  }

  /**
   * Polygons in painter's order (far first), each projected, with its depth, normal and light.
   * `cull` (default true) leaves out the faces turned away; a polygon's normal comes from its
   * corners (counter-clockwise seen from outside), or from `normal` when given.
   */
  polygons<T = undefined>(list: readonly { points: readonly Vec3[]; normal?: Vec3; data?: T }[], opts: { cull?: boolean } = {}): AxoPolygon<T>[] {
    const cull = opts.cull ?? true;
    const out: AxoPolygon<T>[] = [];
    for (const item of list) {
      const pts = item.points;
      if (pts.length < 2) continue;
      const normal = (item.normal ?? newellNormal(pts)).normalize();
      if (cull && pts.length >= 3 && normal.len() > 0 && !this.facing(normal)) continue;
      let depth = 0;
      for (const p of pts) depth += this.depth(p);
      out.push({ points: pts.map((p) => this.project(p)), depth: depth / pts.length, normal, light: this.shade(normal), data: item.data as T });
    }
    return out.sort((a, b) => b.depth - a.depth);
  }

  /** A mesh's faces as `polygons`: projected, culled, far first; `data` is the face's id. */
  meshFaces(mesh: Mesh, opts: { cull?: boolean } = {}): AxoPolygon<number>[] {
    const list: { points: Vec3[]; normal?: Vec3; data: number }[] = [];
    for (const f of mesh.faces()) list.push({ points: f.nodes.map((id) => mesh.getPosition(id)), normal: f.normal, data: f.id });
    return this.polygons(list, opts);
  }

  /**
   * The view that fits points (already projected) into a `width × height` area with `margin`
   * around them: `{ scale, x, y }`, a point (u, v) drawn at (`x + u * scale`, `y - v * scale`).
   * `maxScale` caps the scale (a small model is not blown up).
   */
  fit(points: readonly Vec2[], width: number, height: number, margin = 16, maxScale = Infinity): { scale: number; x: number; y: number } {
    if (!points.length) return { scale: 1, x: width / 2, y: height / 2 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const bw = Math.max(x1 - x0, 1e-9), bh = Math.max(y1 - y0, 1e-9);
    const scale = Math.min(maxScale, Math.max(1e-9, Math.min((width - 2 * margin) / bw, (height - 2 * margin) / bh)));
    return { scale, x: width / 2 - ((x0 + x1) / 2) * scale, y: height / 2 + ((y0 + y1) / 2) * scale };
  }

  /** The projection for a Sheet's view (`sheet.view(name, { project: axo.sheetProjection() })`). */
  sheetProjection(): { right: Vec3; up: Vec3 } {
    return { right: this.right, up: this.upward };
  }
}

/** A polygon's normal by Newell's method: robust for any planar (or nearly planar) polygon. */
function newellNormal(pts: readonly Vec3[]): Vec3 {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  }
  return new Vec3(x, y, z);
}
