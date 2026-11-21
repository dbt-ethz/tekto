/**
 * `buildingPlan`: a building's floor plans as a Sheet, every part keyed by its record.
 */
import { describe, it, expect } from "vitest";
import { realizeBuilding, type BuildingData } from "../src/bim/building";
import { buildingPlan } from "../src/bim/buildingPlan";
import { pickPrim, type SheetPrim } from "../src/core/drawing/Sheet";
import { rasterizeSheet } from "../src/core/drawing/sheetRaster";

const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** Two storeys, 8 × 6 m: two rooms below with a door between them and one to the outside, one room above. */
const HOUSE: BuildingData = {
  storeys: { eg: { name: "Ground floor", elevation: 0, height: 2.8 }, og: { name: "Upper floor", elevation: 2.8, height: 2.6 } },
  slabs: { base: { storey: "eg", boundary: rect(0, 0, 8, 6) } },
  walls: {
    s: { storey: "eg", path: [[0, 0], [8, 0]] }, e: { storey: "eg", path: [[8, 0], [8, 6]] },
    n: { storey: "eg", path: [[8, 6], [0, 6]] }, w: { storey: "eg", path: [[0, 6], [0, 0]] },
    p: { storey: "eg", path: [[5, 0], [5, 6]], type: "interior" },
    ring: { storey: "og", path: [[0, 0], [8, 0], [8, 6], [0, 6], [0, 0]] },
  },
  openings: {
    entry: { wall: "s", kind: "door", at: 2, width: 1 },
    win: { wall: "e", kind: "window", at: 3, width: 1.6 },
    d: { wall: "p", kind: "door", at: 3, width: 0.9 },
  },
  spaces: {
    living: { storey: "eg", name: "Living", boundary: rect(0, 0, 5, 6), use: "living" },
    study: { storey: "eg", name: "Study", boundary: rect(5, 0, 8, 6), use: "office" },
    loft: { storey: "og", name: "Loft", boundary: rect(0, 0, 8, 6), use: "bedroom" },
  },
};

/** The wall fills that cover a point of the plan (sheet coordinates of the one view at the origin). */
const wallsAt = (prims: SheetPrim[], x: number, y: number) =>
  prims.filter((p) => p.kind === "fill" && p.layer === "wall" && pickPrim([p], { x, y }, 0) === p).map((p) => p.key);

describe("buildingPlan", () => {
  it("draws one storey: walls solid between their openings, rooms with name and area, all keyed", () => {
    const sheet = buildingPlan(realizeBuilding(HOUSE), { storey: "eg" });
    expect(sheet.viewNames()).toEqual(["eg"]);
    expect(sheet.scale).toBe(50);                                // 8 m at 1:50 is 160 mm on paper
    const prims = sheet.explode();
    expect(wallsAt(prims, 6, 0)).toEqual(["walls/s"]);           // on the south wall
    expect(wallsAt(prims, 2, 0)).toEqual([]);                    // in the entrance door
    expect(wallsAt(prims, 8, 3)).toEqual([]);                    // in the east window
    expect(wallsAt(prims, 5, 3)).toEqual([]);                    // in the door between the rooms
    expect(wallsAt(prims, 5, 5)).toEqual(["walls/p"]);
    expect(wallsAt(prims, 8.05, -0.05).sort()).toEqual(["walls/e", "walls/s"]);   // the corner is whole
    // The window keeps a glass line on the wall's axis; a door has only the wall's faces.
    const lines = (key: string) => prims.filter((p) => p.kind === "polyline" && p.key === key).length;
    expect(lines("openings/win")).toBe(3);
    expect(lines("openings/entry")).toBe(2);
    const texts = prims.filter((p): p is Extract<SheetPrim, { kind: "text" }> => p.kind === "text");
    expect(texts.filter((t) => t.key === "spaces/living").map((t) => t.text)).toEqual(["Living", "30.0 m²", "living"]);
    expect(texts.some((t) => t.text.startsWith("Ground floor · storeys/eg"))).toBe(true);
    expect(texts.filter((t) => t.style.layer === "grid").map((t) => t.text)).toEqual(expect.arrayContaining(["0", "8", "6", "x (m)", "y (m)"]));
    // Room fills come first, in their use's colour, paler.
    const room = prims.find((p) => p.kind === "fill" && p.key === "spaces/living") as Extract<SheetPrim, { kind: "fill" }>;
    expect(room.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(prims.indexOf(room)).toBeLessThan(prims.findIndex((p) => p.kind === "fill" && p.layer === "wall"));
  });

  it("puts every storey side by side, and leaves the names out when asked", () => {
    const b = realizeBuilding(HOUSE);
    const sheet = buildingPlan(b, { keys: false, coordinates: false });
    expect(sheet.viewNames()).toEqual(["eg", "og"]);
    const prims = sheet.explode();
    expect(prims.some((p) => p.kind === "text" && p.style.layer === "key")).toBe(false);
    expect(prims.some((p) => p.kind === "text" && p.style.layer === "grid")).toBe(false);
    const xs = (key: string) => (prims.find((p) => p.kind === "fill" && p.key === key) as Extract<SheetPrim, { kind: "fill" }>).rings[0].map((q) => q.x);
    expect(Math.min(...xs("spaces/loft"))).toBeGreaterThan(Math.max(...xs("spaces/living")));
    // A wall drawn as one closed loop has all four corners.
    const loft = buildingPlan(b, { storey: "og" }).explode();
    for (const [x, y] of [[0, 0], [8, 0], [8, 6], [0, 6], [4, 0]]) expect(wallsAt(loft, x, y)).toEqual(["walls/ring"]);
    expect(wallsAt(loft, 4, 3)).toEqual([]);                      // the room inside the ring
    // With a door in it, the loop is still whole at its first corner, and open in the door.
    const withDoor = buildingPlan(realizeBuilding({ ...HOUSE, openings: { ...HOUSE.openings, od: { wall: "ring", kind: "door", at: 10, width: 1 } } }), { storey: "og" }).explode();
    for (const [x, y] of [[0, 0], [8, 0], [8, 6], [0, 6], [4, 0], [8, 1.2], [8, 2.8]]) expect(wallsAt(withDoor, x, y), `${x}, ${y}`).toEqual(["walls/ring"]);
    expect(wallsAt(withDoor, 8, 2)).toEqual([]);
  });

  it("names the storeys there are when asked for one that is not", () => {
    expect(() => buildingPlan(realizeBuilding(HOUSE), { storey: "dg" })).toThrow('no storey "dg" (storeys: eg, og)');
    expect(buildingPlan(realizeBuilding({})).explode()).toEqual([]);
  });

  it("is a picture: dark where a wall is, the room's colour inside, paper in a door", () => {
    const sheet = buildingPlan(realizeBuilding(HOUSE), { storey: "eg", keys: false });
    const img = rasterizeSheet(sheet, { width: 900 });
    const px = (x: number, y: number) => { const p = img.toPixel({ x, y }); const o = (Math.round(p.y) * img.width + Math.round(p.x)) * 4; return [img.data[o], img.data[o + 1], img.data[o + 2]]; };
    expect(px(6, 0)[0]).toBeLessThan(60);
    expect(px(2, 0)).toEqual([255, 255, 255]);
    const inside = px(1, 1);
    expect(inside[0]).toBeGreaterThan(200);
    expect(inside).not.toEqual([255, 255, 255]);
  });
});
