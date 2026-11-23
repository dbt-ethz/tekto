# Polygons

<Live page="planar-graph" label="Planar Graph" poster="/shots/planar-graph.webp" alt="A planar graph built from random segments" />

Plan geometry in tekto is lists of `Vec2`. `Polygon2D` works on one ring at a time: area, centroid, point-in-polygon, offset, simplify, convex hull, triangulation, the smallest enclosing rectangle. `PolygonBool` does robust booleans on polygons with holes. Both come with `tekto/2d`, so a 2D sketch can use them without three.js.

```ts
import { Polygon2D, PolygonBool, Vec2 } from "tekto/2d";

const site = [new Vec2(0, 0), new Vec2(40, 0), new Vec2(40, 30), new Vec2(0, 30)];   // open ring: no repeated last point
const court = [new Vec2(15, 10), new Vec2(25, 10), new Vec2(25, 20), new Vec2(15, 20)];

Polygon2D.area(site);                                   // 1200
Polygon2D.centroid2D(site);                             // (20, 15)
Polygon2D.pointInPolygon(new Vec2(5, 5), site);         // true
const setback = Polygon2D.offset(site, -3);             // negative shrinks, whichever way it winds
const triangles = Polygon2D.triangulate2D(court);       // index triples

// Booleans with holes: Ring2 → Poly2 = [outer, …holes] → MultiPoly2
const built = PolygonBool.difference(PolygonBool.fromRing(setback), PolygonBool.fromRing(court));
PolygonBool.area(built);                                // the setback area minus the court
const outlines = PolygonBool.rings(built);              // every ring, for drawing
console.log(triangles.length, outlines.length);
```

## What to know

- Rings are **open**: the first point is not repeated at the end. `Polygon2D.openRing` / `closeRing` convert.
- `PolygonBool` takes and returns multipolygons: union, difference and intersection of any number of them. `polygonIntersection` handles only two simple rings.
- For a planar subdivision with faces and twin half-edges, use `PlanarGraph` (`PlanarGraphRepair.fromSegments` builds one from raw segments); `Delaunay2D.triangulate` returns one. `NoFitPolygon` gives Minkowski sums and no-fit polygons for nesting.

- Outlines from a scalar field: `MarchingSquares.contoursFromGrid(grid, iso)` returns `{ points, closed }` polylines, the values above `iso` on the left (a loop around a high region runs counter-clockwise, around a hole clockwise); an open line runs from border to border. The grid is stored x-major: the sample at column `x`, row `y` is `values[x * ny + y]`, at `(x1 + x * cellSize, y1 + y * cellSize)`.

::: tip Playground
[Planar Graph](https://github.com/dbt-ethz/tekto/blob/main/playground/pages/planar-graph.ts): `?page=planar-graph`.
:::
