# sketch2d: a 2D canvas

<Live page="pointer-2d" label="Pointer Input" poster="/shots/pointer-2d.webp" alt="Dragging handles to shape a polygon" />

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
  lab.animate(() => {});   // pointer events don't redraw by themselves: keep frames coming
});
```

## What to know

- `lab.draw` runs when a control changes. `lab.animate((t, dt) => …)` turns on a continuous loop.
- `lab.onPointerDown / onPointerMove / onPointerUp` get `{ x, y, id }` in canvas pixels, the same for mouse, touch and pen. The `id` follows one finger, so several drags at once work.
- `lab.noise`, `lab.random`, `lab.lerp`, `lab.vec2` and friends are there, scoped to `lab`.
- Geometry in `tekto/2d`: `Vec2`, `Polygon2D`, `PolygonBool`, `Sheet`, `noise`, `createRandom`.

## The panel and the look

The options after the function shape the frame around the drawing:

```ts
sketch2d(fn, {
  title: "Façade",
  style: "paper",        // a figure in a book: white, one ink, no title bar
  tabs: "side",          // tabs listed down the panel's left edge
  panelWidth: "auto",    // as wide as the longest label and widest control need
});
```

- **`style`** is the look of the whole app. `"studio"` (the default) is tekto's dark tool chrome, light with `theme: "light"`. `"paper"` is for a figure that explains something: the drawing first, black on white, no title bar, and the panel sizes itself.
- **`tabs`**: give controls a `tab` (`lab.slider("Pitch °", 10, 55, 30, { tab: "Roof" })`) and the panel shows one tab at a time. `"top"` (the default) is a bar across the panel; `"side"` is a list down its left edge with each tab's number of controls, which holds more tabs and longer names. A control without a tab stays above them, always on show.
- **`panelWidth`** is a number of pixels or `"auto"`. Either way a person can drag the panel's right edge (double-click it to go back) and fold the panel with the chevron in its top row; both are remembered per title. The top row is the frame's own: the panel's name (`panelTitle`, default "Parameters"; on paper the app's title) and the chevron, with the controls starting below it. An app without any control has no panel at all, and the view takes the whole width. A folded panel takes no room either: its chevron waits in the view's top left corner.
- Labels are shown as you write them, so a unit keeps its case: `"Width m"`.
- `lab.log(label, value)` writes the status line, a row under the canvas.

`sketch()` and `appShell()` take `tabs` and `panelWidth` the same way.

::: tip Playground
[Panel options](https://github.com/dbt-ethz/tekto/blob/main/playground/pages/panel-tabs.ts): `?page=panel-tabs`, a façade with side tabs and an automatic width. The [lecture apps](/interface/playground#the-lecture-apps) are in the paper style.
:::

::: tip Playground
[Pointer Input](https://github.com/dbt-ethz/tekto/blob/main/playground/pages/pointer-2d.ts): `?page=pointer-2d`. [Circle Packing](https://github.com/dbt-ethz/tekto/blob/main/playground/pages/circle-packing.ts) is a larger 2D sketch.
:::
