# sketch2d: a 2D canvas

<Live page="pointer-2d" label="Pointer Input" poster="/shots/pointer-2d.webp" alt="Dragging handles to shape a polygon" />

<Live page="axonometric" label="Axonometric" />

<Live page="circle-packing" label="Circle Packing" />

`sketch2d(fn)` is the 2D counterpart of `sketch()`, close to p5.js: the same panel of controls, and a `lab.draw` callback that gets a plain `CanvasRenderingContext2D`. There is no WebGL and no three.js; import it from `tekto/2d` and the page stays small.

```ts
import { sketch2d, Vec2 } from "tekto/2d";

const points: Vec2[] = [];

sketch2d((lab) => {
  const r = lab.slider("Handle radius", 4, 20, 8);
  lab.button("Clear", () => { points.length = 0; });

  lab.onPointerDown((p) => { points.push(new Vec2(p.x, p.y)); });

  lab.draw((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#9fb6cc";
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (points.length > 2) ctx.closePath();
    ctx.stroke();
    for (const p of points) { ctx.beginPath(); ctx.arc(p.x, p.y, r.value, 0, Math.PI * 2); ctx.fill(); }
  });
});
```

## Points to drag

`lab.dragHandle(x, y, opts)` is a point the person drags: tekto draws it over the drawing, finds it under the pointer, and re-runs the sketch when it moves, as a slider does. With `view` its coordinates are the model's, y up, drawn through `{ scale, x, y }` (what `fitSheet` returns); without, canvas pixels.

```ts
import { sketch2d, fitSheet, type View2D } from "tekto/2d";

let view: View2D = { scale: 1, x: 0, y: 0 };
sketch2d((lab) => {
  const corner = lab.dragHandle(2, 3, { name: "corner", view: () => view, constrain: (x, y) => [Math.round(x), Math.round(y)] });
  lab.draw((ctx, w, h) => {
    view = fitSheet({ min: { x: 0, y: 0 }, max: { x: 20, y: 15 } }, w, h);     // metres → pixels, y up
    const p = corner.value;                                                     // in metres
    ctx.fillRect(view.x + p.x * view.scale, view.y - p.y * view.scale, 40, 20);
  });
});
```

A handle follows its `x, y` until it is dragged, and again when they change (a slider moved it). A press on a handle does not reach `onPointerDown`. Name each handle when the number of handles changes between runs.

## What to know

- `lab.draw` runs when a control changes and after each pointer handler, so a drag shows live without a loop. `lab.redraw()` draws once more after other changes (a timer, a fetch). `lab.animate((t, dt) => …)` turns on a continuous loop.
- `lab.onPointerDown / onPointerMove / onPointerUp` get `{ x, y, id }` in canvas pixels, the same for mouse, touch and pen. The `id` follows one finger, so several drags at once work.
- `lab.noise`, `lab.random`, `lab.lerp`, `lab.vec2` and friends are there, scoped to `lab`.
- Geometry in `tekto/2d`: `Vec2`, `Polygon2D`, `PolygonBool`, `Sheet`, `Axonometric`, `noise`, `createRandom`.

::: tip Playground
[Pointer Input](https://github.com/dbt-ethz/tekto/blob/main/playground/pages/pointer-2d.ts): `?page=pointer-2d`. [Axonometric](https://github.com/dbt-ethz/tekto/blob/main/playground/pages/axonometric.ts): `?page=axonometric`. [Circle Packing](https://github.com/dbt-ethz/tekto/blob/main/playground/pages/circle-packing.ts) is a larger 2D sketch.
:::
