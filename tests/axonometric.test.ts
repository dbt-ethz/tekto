/**
 * Axonometric: 3D geometry projected for a 2D drawing, culled and sorted far to near.
 */
import { describe, it, expect } from "vitest";
import { Axonometric } from "../src/core/drawing/Axonometric";
import { MeshFactory } from "../src/core/geometry/mesh/MeshFactory";
import { Sheet } from "../src/core/drawing/Sheet";
import { Vec3 } from "../src/core/math/vectors";

const near = (a: number, b: number, d = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(d);

/** The six faces of a unit cube at the origin, counter-clockwise seen from outside, Z up. */
const cube = (o = new Vec3(0, 0, 0)) => {
  const P = (x: number, y: number, z: number) => new Vec3(o.x + x, o.y + y, o.z + z);
  return [
    { name: "bottom", points: [P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), P(1, 0, 0)] },
    { name: "top", points: [P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)] },
    { name: "front", points: [P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)] },     // −y
    { name: "back", points: [P(0, 1, 0), P(0, 1, 1), P(1, 1, 1), P(1, 1, 0)] },
    { name: "left", points: [P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0)] },      // −x
    { name: "right", points: [P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)] },
  ].map((f) => ({ points: f.points, data: f.name }));
};

describe("Axonometric", () => {
  it("from the front left and above, a cube shows its top, front and left", () => {
    const axo = new Axonometric();                                  // azimuth 225, elevation 30, Z up
    expect(axo.polygons(cube()).map((p) => p.data).sort()).toEqual(["front", "left", "top"]);
    expect(axo.polygons(cube(), { cull: false })).toHaveLength(6);
    // Up stays up, and the model's vertical edges stay vertical in the view.
    const a = axo.project(new Vec3(3, 2, 0)), b = axo.project(new Vec3(3, 2, 5));
    near(a.x, b.x);
    expect(b.y).toBeGreaterThan(a.y);
  });

  it("looking from the front, x runs to the right and z up; a plan is the ground seen from above", () => {
    const front = new Axonometric({ azimuth: 270, elevation: 0 });
    const p = front.project(new Vec3(2, 7, 3));
    near(p.x, 2); near(p.y, 3);
    expect(front.depth(new Vec3(0, 5, 0))).toBeGreaterThan(front.depth(new Vec3(0, 1, 0)));   // +y is farther
    const plan = new Axonometric({ azimuth: 270, elevation: 90 });
    const q = plan.project(new Vec3(2, 7, 3));
    near(q.x, 2, 1e-4); near(q.y, 7, 1e-3);
  });

  it("isometric: the three axes are foreshortened alike", () => {
    const iso = Axonometric.isometric();
    const len = (v: Vec3) => iso.project(v).len();
    near(len(new Vec3(1, 0, 0)), len(new Vec3(0, 1, 0)), 1e-12);
    near(len(new Vec3(1, 0, 0)), len(new Vec3(0, 0, 1)), 1e-12);
    near(len(new Vec3(1, 0, 0)), Math.sqrt(2 / 3), 1e-12);
  });

  it("sorts far to near, so the near cube is painted last", () => {
    const axo = new Axonometric();
    const far = cube(new Vec3(4, 4, 0)).map((f) => ({ ...f, data: `far ${f.data}` }));
    const nearCube = cube(new Vec3(0, 0, 0)).map((f) => ({ ...f, data: `near ${f.data}` }));
    const order = axo.polygons([...nearCube, ...far]).map((p) => p.data);
    expect(order.slice(0, 3).every((d) => d.startsWith("far"))).toBe(true);
    expect(order.slice(3).every((d) => d.startsWith("near"))).toBe(true);
    const depths = axo.polygons([...nearCube, ...far]).map((p) => p.depth);
    expect([...depths].sort((a, b) => b - a)).toEqual(depths);
  });

  it("a Y-up mesh: about half of a sphere's faces are seen, the top lit more than the side", () => {
    const axo = new Axonometric({ up: "y" });
    const sphere = MeshFactory.sphere(1, 24, 16);
    const faces = axo.meshFaces(sphere);
    const all = [...sphere.faces()].length;
    expect(faces.length / all).toBeGreaterThan(0.4);
    expect(faces.length / all).toBeLessThan(0.6);
    expect(axo.shade(new Vec3(0, 1, 0))).toBeGreaterThan(axo.shade(axo.right));      // the light comes from above left
    expect(typeof faces[0].data).toBe("number");
  });

  it("fits projected points into an area, the convention of fitSheet: (x + u·s, y − v·s)", () => {
    const axo = new Axonometric();
    const pts = cube().flatMap((f) => f.points).map((p) => axo.project(p));
    const v = axo.fit(pts, 400, 300, 20);
    const sx = pts.map((p) => v.x + p.x * v.scale), sy = pts.map((p) => v.y - p.y * v.scale);
    expect(Math.min(...sx)).toBeGreaterThanOrEqual(20 - 1e-9);
    expect(Math.max(...sx)).toBeLessThanOrEqual(380 + 1e-9);
    expect(Math.min(...sy)).toBeGreaterThanOrEqual(20 - 1e-9);
    expect(Math.max(...sy)).toBeLessThanOrEqual(280 + 1e-9);
    const usedW = Math.max(...sx) - Math.min(...sx), usedH = Math.max(...sy) - Math.min(...sy);
    expect(Math.min(Math.abs(usedW - 360), Math.abs(usedH - 260))).toBeLessThan(1e-6);   // fills the width or the height
    expect(axo.fit(pts, 400, 300, 20, 5).scale).toBe(5);
  });

  it("gives a Sheet view the same projection", () => {
    const axo = new Axonometric({ azimuth: 200, elevation: 40 });
    const sheet = new Sheet();
    sheet.view("axo", { project: axo.sheetProjection() }).polyline([new Vec3(1, 2, 3), new Vec3(4, 5, 6)]);
    const prim = sheet.explode()[0] as { points: { x: number; y: number }[] };
    const p = axo.project(new Vec3(1, 2, 3));
    near(prim.points[0].x, p.x, 1e-9); near(prim.points[0].y, p.y, 1e-9);
  });

  it("says what is wrong with a bad elevation", () => {
    expect(() => new Axonometric({ elevation: 120 })).toThrow("elevation between -90 and 90");
  });
});
