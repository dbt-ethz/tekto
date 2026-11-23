# Axonometric

<Live page="axonometric" label="Axonometric" />

`Axonometric` draws 3D geometry as a figure on a 2D canvas or a `Sheet`: it turns the model by an azimuth, tilts it by an elevation, leaves out the faces turned away, sorts the rest from far to near, and fits the result into the drawing area. The app draws the polygons it gets back, in any style. It is in `tekto/core` and `tekto/2d`: no three.js, no DOM.

```ts
import { Axonometric, MeshFactory, Vec3 } from "tekto/core";

const axo = new Axonometric({ azimuth: 225, elevation: 30 });     // from the front left, Z up
const square = [new Vec3(0, 0, 3), new Vec3(4, 0, 3), new Vec3(4, 4, 3), new Vec3(0, 4, 3)];
const faces = axo.polygons([{ points: square, data: "roof" }]);   // far first, culled, each with its light
const view = axo.fit(faces.flatMap((f) => f.points), 600, 400, 24);
// a point (u, v) of the view is drawn at (view.x + u * view.scale, view.y - v * view.scale)

const ball = Axonometric.isometric({ up: "y" }).meshFaces(MeshFactory.sphere(1, 24, 16));
console.log(faces.length, view.scale, ball.length);
```

## What to know

- `azimuth` is where the viewer stands, counter-clockwise from +x seen from above: 270 looks from the front, 225 (default) from the front left. `elevation` is how far it looks down: 0 is an elevation, 90 a plan. `Axonometric.isometric()` foreshortens the three axes alike.
- `up: "y"` for three.js-style geometry and `MeshFactory`; the default `"z"` is tekto's buildings.
- `polygons(list)` takes `{ points, normal?, data? }` (corners counter-clockwise seen from outside) and returns `{ points, depth, normal, light, data }`, far first, without the faces turned away (`cull: false` keeps them). `light` (0 to 1) is how much a face turns to a light above and to the left: a grey for each face.
- `meshFaces(mesh)` does the same for every face of a `Mesh`; `data` is the face's id.
- `fit(points, w, h, margin)` uses the y-up convention of `fitSheet` and of a 2D sketch's drag handles.
- For a `Sheet`: `sheet.view("axo", { project: axo.sheetProjection() })` takes `Vec3` points.
- Faces are sorted whole by their mean depth (the painter's algorithm): right for the separate, convex faces of most models; faces that cut through each other can come out in the wrong order.

::: tip Playground
[Axonometric](https://github.com/dbt-ethz/tekto/blob/main/playground/pages/axonometric.ts): `?page=axonometric`, a plan with blocks to drag and their axonometry.
:::
