/**
 * MarchingSquares: contours as polylines, and the grid layout they read.
 */
import { describe, it, expect } from "vitest";
import { MarchingSquares, VoxelGrid2D } from "../src/core/voxel";
import { Polygon2D } from "../src/core/geometry/Polygon2D";

/** A grid of `nx × ny` samples `cell` apart from (ox, oy), filled with `f(x, y)` at each sample's position. */
function field(nx: number, ny: number, cell: number, ox: number, oy: number, f: (x: number, y: number) => number) {
  const g = new VoxelGrid2D(nx, ny, cell, ox, oy);
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) { const p = g.getPosition(x, y); g.set(x, y, f(p.x, p.y)); }
  return g;
}

describe("MarchingSquares.contours", () => {
  it("a disc is one closed counter-clockwise loop, on the circle", () => {
    const g = field(41, 41, 0.1, -2, -2, (x, y) => 1 - Math.hypot(x - 0.3, y + 0.2));   // inside: distance < 1
    const cs = MarchingSquares.contoursFromGrid(g, 0);
    expect(cs.length).toBe(1);
    expect(cs[0].closed).toBe(true);
    const pts = cs[0].points;
    expect(pts.length).toBeGreaterThan(40);
    for (const p of pts) expect(Math.abs(Math.hypot(p.x - 0.3, p.y + 0.2) - 1)).toBeLessThan(0.02);
    expect(Polygon2D.signedArea(pts)).toBeGreaterThan(3.0);       // ≈ π, counter-clockwise
    expect(pts[0]).not.toEqual(pts[pts.length - 1]);               // the first point is not repeated
    // The same contour as the loose segments: as many points as segments.
    expect(pts.length).toBe(MarchingSquares.extractFromGrid(g, 0).length);
  });

  it("two discs are two loops; a ring around a hole is two loops, the hole clockwise", () => {
    const two = field(60, 30, 0.1, 0, 0, (x, y) => Math.max(0.5 - Math.hypot(x - 1.2, y - 1.5), 0.5 - Math.hypot(x - 4.5, y - 1.5)));
    expect(MarchingSquares.contoursFromGrid(two, 0).map((c) => c.closed)).toEqual([true, true]);
    const ring = field(50, 50, 0.1, -2.5, -2.5, (x, y) => 0.5 - Math.abs(Math.hypot(x, y) - 1.5));
    const areas = MarchingSquares.contoursFromGrid(ring, 0).map((c) => Polygon2D.signedArea(c.points)).sort((a, b) => a - b);
    expect(areas.length).toBe(2);
    expect(areas[0]).toBeLessThan(0);                               // the hole
    expect(areas[1]).toBeGreaterThan(0);
  });

  it("a region cut by the grid's border gives open lines from border to border", () => {
    const g = field(20, 20, 1, 0, 0, (x) => x - 9.5);               // the right half is inside
    const cs = MarchingSquares.contoursFromGrid(g, 0);
    expect(cs).toHaveLength(1);
    expect(cs[0].closed).toBe(false);
    expect(cs[0].points.length).toBe(20);
    expect(cs[0].points.every((p) => Math.abs(p.x - 9.5) < 1e-9)).toBe(true);
    // Inside on the left: walking along x = 9.5 with x > 9.5 on the left means going down.
    expect(cs[0].points[0].y).toBeGreaterThan(cs[0].points[19].y);
  });

  it("reads values x-major, as VoxelGrid2D stores them: values[x * ny + y]", () => {
    const nx = 6, ny = 4;
    const values = new Float32Array(nx * ny);
    values[2 * ny + 1] = 1;                                         // the sample at column 2, row 1
    const [c] = MarchingSquares.contours(values, nx, ny, 0.5, 1, 10, 20);
    expect(c.closed).toBe(true);
    const xs = c.points.map((p) => p.x), ys = c.points.map((p) => p.y);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([11.5, 12.5, 20.5, 21.5]);
  });

  it("an empty or full grid has no contours", () => {
    expect(MarchingSquares.contours(new Float32Array(16), 4, 4, 0.5)).toEqual([]);
    expect(MarchingSquares.contours(new Float32Array(16).fill(1), 4, 4, 0.5)).toEqual([]);
  });
});
