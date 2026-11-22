/**
 * Axonometric (sketch2d) — a plan you drag in, and its axonometry beside it.
 *
 * The plan's blocks are moved with `lab.dragHandle`, in model metres through a y-up view
 * (`fitSheet`), with no hit-testing code: dragging re-runs the sketch as a slider does. The
 * axonometry is `Axonometric`: the blocks' faces culled, sorted far to near and fitted into
 * the right half, each face a grey by how much it turns to the light.
 */
import { sketch2d, Sketch2DInstance, Vec3, Axonometric, fitSheet, type View2D } from "../../src";

interface Block { name: string; x: number; y: number; w: number; d: number; h: number }

/** A block's six faces, counter-clockwise seen from outside (Z up). */
function boxFaces(b: Block) {
  const P = (x: number, y: number, z: number) => new Vec3(b.x + x, b.y + y, z);
  const { w, d, h } = b;
  return [
    [P(0, 0, h), P(w, 0, h), P(w, d, h), P(0, d, h)],
    [P(0, 0, 0), P(w, 0, 0), P(w, 0, h), P(0, 0, h)],
    [P(w, 0, 0), P(w, d, 0), P(w, d, h), P(w, 0, h)],
    [P(w, d, 0), P(0, d, 0), P(0, d, h), P(w, d, h)],
    [P(0, d, 0), P(0, 0, 0), P(0, 0, h), P(0, d, h)],
    [P(0, 0, 0), P(0, d, 0), P(w, d, 0), P(w, 0, 0)],
  ].map((points) => ({ points, data: b.name }));
}

export default function (container: HTMLElement): Sketch2DInstance {
  const SITE = { min: { x: -1, y: -1 }, max: { x: 21, y: 15 } };
  let plan: View2D = { scale: 1, x: 0, y: 0 };
  return sketch2d((lab) => {
    const azimuth = lab.slider("Azimuth", 0, 360, 225, { step: 5, group: "View" });
    const elevation = lab.slider("Elevation", 5, 90, 30, { step: 1, group: "View" });
    const iso = lab.toggle("Isometric", false, { group: "View" });

    // The blocks' corners are handles in model metres; a slider sets the tower's height.
    const tall = lab.slider("Tower height", 3, 30, 18, { step: 1, group: "Blocks" });
    const a = lab.dragHandle(2, 2, { name: "hall", view: () => plan, constrain: (x, y) => [Math.round(x * 2) / 2, Math.round(y * 2) / 2] });
    const b = lab.dragHandle(12, 6, { name: "tower", view: () => plan, constrain: (x, y) => [Math.round(x * 2) / 2, Math.round(y * 2) / 2] });
    const blocks: Block[] = [
      { name: "hall", x: a.value.x, y: a.value.y, w: 8, d: 5, h: 6 },
      { name: "tower", x: b.value.x, y: b.value.y, w: 4, d: 4, h: tall.value },
    ];
    lab.log("Hall at", `${a.value.x}, ${a.value.y} m`);
    lab.log("Tower at", `${b.value.x}, ${b.value.y} m`);

    lab.draw((ctx, w, h) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      const half = w / 2;

      // ── Plan: the site and the blocks, model metres, y up ──
      plan = fitSheet(SITE, half, h, 28);
      const X = (x: number) => plan.x + x * plan.scale, Y = (y: number) => plan.y - y * plan.scale;
      ctx.strokeStyle = "#d4d4d4"; ctx.lineWidth = 1;
      for (let x = 0; x <= 20; x += 2) { ctx.beginPath(); ctx.moveTo(X(x), Y(0)); ctx.lineTo(X(x), Y(14)); ctx.stroke(); }
      for (let y = 0; y <= 14; y += 2) { ctx.beginPath(); ctx.moveTo(X(0), Y(y)); ctx.lineTo(X(20), Y(y)); ctx.stroke(); }
      for (const bl of blocks) {
        ctx.fillStyle = "#e9e9e9"; ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1.2;
        ctx.fillRect(X(bl.x), Y(bl.y + bl.d), bl.w * plan.scale, bl.d * plan.scale);
        ctx.strokeRect(X(bl.x), Y(bl.y + bl.d), bl.w * plan.scale, bl.d * plan.scale);
        ctx.fillStyle = "#6b6b6b"; ctx.font = "11px Helvetica, Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(bl.name, X(bl.x + bl.w / 2), Y(bl.y + bl.d / 2));
      }
      ctx.fillStyle = "#6b6b6b"; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText("Plan · drag a block's corner", 16, 14);

      // ── Axonometry ──
      const axo = iso.value ? Axonometric.isometric({ azimuth: azimuth.value }) : new Axonometric({ azimuth: azimuth.value, elevation: elevation.value });
      const ground = [new Vec3(0, 0, 0), new Vec3(20, 0, 0), new Vec3(20, 14, 0), new Vec3(0, 14, 0)];
      const faces = axo.polygons(blocks.flatMap(boxFaces));
      const v = axo.fit([...ground.map((p) => axo.project(p)), ...faces.flatMap((f) => f.points)], half, h, 28);
      const S = (p: { x: number; y: number }): [number, number] => [half + v.x + p.x * v.scale, v.y - p.y * v.scale];
      const poly = (pts: [number, number][]) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
      poly(ground.map((p) => S(axo.project(p))));
      ctx.strokeStyle = "#a6a6a6"; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
      for (const f of faces) {
        const g = Math.round(150 + 100 * f.light);
        poly(f.points.map(S));
        ctx.fillStyle = `rgb(${g},${g},${g})`; ctx.fill();
        ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.fillStyle = "#6b6b6b"; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(iso.value ? "Isometric" : `Axonometric · ${azimuth.value}° / ${elevation.value}°`, half + 16, 14);
      ctx.strokeStyle = "#e6e6e6"; ctx.beginPath(); ctx.moveTo(half, 0); ctx.lineTo(half, h); ctx.stroke();
    });
  }, { container, title: "Axonometric", background: "#ffffff" });
}
