# Building records

<Live page="house" label="House (building as data)" poster="/shots/house-framing.webp" alt="The house built from its records, framing on" />

A building can be plain JSON: `storeys`, `walls`, `openings`, `slabs`, `spaces`, `roofs` and `stairs`, referring to each other by id. A person, a script or an agent writes the records; `realizeBuilding` builds them into BIM elements: framed walls with their openings, joisted floors, a roof on its storey's walls, a stair that climbs its storey and cuts its well in the floor above. `BUILDING_SCHEMA` is the JSON Schema of each collection, so the same description validates input and serves as an agent's tool schema.

```ts
import { realizeBuilding, validateBuilding, type BuildingData } from "tekto/core";

const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

const data: BuildingData = {
  storeys:  { eg: { name: "Ground floor", elevation: 0, height: 2.9 } },
  slabs:    { base: { storey: "eg", boundary: rect(0, 0, 10, 8), type: "ground" } },
  walls: {
    s: { storey: "eg", path: [[0, 0], [10, 0]] }, e: { storey: "eg", path: [[10, 0], [10, 8]] },
    n: { storey: "eg", path: [[10, 8], [0, 8]] }, w: { storey: "eg", path: [[0, 8], [0, 0]] },
  },
  openings: {
    door: { wall: "n", kind: "door", at: 5, width: 1.1 },          // `at`: centre, metres along the wall
    win: { wall: "s", kind: "window", at: 3, width: 1.6, sill: 0.9 },
  },
  spaces:   { living: { storey: "eg", name: "Living", boundary: rect(0, 0, 10, 8), use: "living" } },
  roofs:    { roof: { storey: "eg", kind: "gable", pitch: 35, footprint: rect(-0.15, -0.15, 10.15, 8.15), overhang: 0.5 } },
};

validateBuilding(data);                  // schema, references and type names, before building
const building = realizeBuilding(data);
building.check();                        // [{ severity, code, message, keys: ["walls/e"] }]: what is wrong, by record
building.areas().total;                  // m² of rooms
const ifc = building.toIfc({ projectName: "House" });   // storeys, framed walls with openings, slabs, spaces, roof
console.log(ifc.length);
```

## Floor plans

`buildingPlan(building)` draws the floor plans as a [`Sheet`](/drawings/sheet): a view per storey, walls solid between their openings, rooms with name and area, stairs, and every part keyed by its record.

```ts
import { buildingPlan } from "tekto";

const sheet = buildingPlan(building, { storey: "eg" });    // one storey; default: all, side by side
sheet.toSVG();  sheet.toDXF();
const png = await sheet.toPNG({ width: 1600 });            // an image, drawn without a browser
```

`keys` (default on) writes the record ids beside the parts and `coordinates` the model's metres along the edges: what an agent needs to find in the records what it sees in the picture. A door is drawn as an opening without a leaf, because a record does not say which way it swings.

## Without a browser

A `BuildingSession` is a building document with the calls an agent makes on it, in Node: no scene, no page.

```ts
import { BuildingSession, Doc, devServerAdapter } from "tekto/core";

// On the shared live document: one more participant, its edits reach everyone who has it open.
const doc = new Doc({ name: "house", adapter: devServerAdapter({ endpoint: "http://localhost:5173/__tekto/collab", user: { id: "agent", name: "Claude" } }) });
await doc.ready;
const session = new BuildingSession(doc);

const r = session.apply({ set: { "walls/a": { storey: "eg", path: [[0, 0], [5, 0]] } } }, "South wall");
r.issues;                                      // what the check says now
const { plans } = await session.snapshot();    // [{ storey: "eg", name, png }]
session.undo();
```

`new BuildingSession(json)` takes a saved document or plain records instead, and `session.toJSON()` is the file the House app opens. The MCP server serves a session as tools: see [Without the app open](/claude/mcp#without-the-app-open).

## What to know

- **Types**: wall, slab and opening `type`s name entries of `BuildingTypes`. The defaults (`defaultBuildingTypes()`) are Holzrahmenbau exterior walls, framed partitions, joisted floors and a concrete ground slab.
- **Uses**: a space's `use` names a space type, which sets the colour it is drawn in, whether it wants daylight and whether it needs a door. `check()` reports a bedroom without a window.
- **Checks** report what the built geometry shows: openings past a wall's end or overlapping, wall ends that meet no wall, storeys that don't stack, rooms that overlap. Each issue names its records in `keys`.
- **Walls** stand on their storey and run up to the underside of the floor above unless they give a `height`.
- `buildingSchema(types)` gives the schema for your own types, with descriptions an agent can choose from.

::: tip Playground
[House (building as data)](https://github.com/dbt-ethz/tekto/blob/main/playground/pages/house.ts): `?page=house`. Save JSON shows the records.
:::
