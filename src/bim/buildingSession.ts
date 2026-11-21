/**
 * A building document worked on without a browser — what an agent holds in Node.
 *
 * In the browser an app shares its document with `agentDoc` and the MCP server reaches the
 * open tab. A `BuildingSession` is the same set of calls on a document in memory: read the
 * records and their schema, apply a patch as one undo step (or not at all, with the reasons),
 * get the check's issues back, undo, and look — the floor plans as PNG images, with a
 * summary in numbers. `toJSON()` is the file the House app saves and opens, so a building
 * made here opens there.
 *
 * Given a `Doc` with a shared adapter, the session is one more participant on the live model:
 * people with the app open see its edits arrive, and it sees theirs. That is the mode to
 * prefer — one model, not copies of a file. `tools/mcp.mjs --doc house` serves the shared
 * document as MCP tools, `--file house.json` a file.
 *
 *   const session = new BuildingSession(JSON.parse(readFileSync("house.json", "utf8")));
 *   const r = session.apply({ set: { "walls/a": { storey: "eg", path: [[0, 0], [5, 0]] } } }, "South wall");
 *   r.issues;                                   // what the check says now
 *   const { plans } = await session.snapshot(); // [{ storey: "eg", png: Uint8Array }]
 *   writeFileSync("house.json", JSON.stringify(session.toJSON(), null, 2));
 */
import { Doc, applyPatch, type DocJSON, type DocPatch, type PatchResult } from "../collab/Doc";
import type { RecordSchema } from "../collab/recordSchema";
import type { Sheet } from "../core/drawing/Sheet";
import type { SheetRasterOptions } from "../core/drawing/sheetRaster";
import {
  BUILDING_COLLECTIONS, buildingSchema, defaultBuildingTypes, realizeBuilding,
  type Building, type BuildingCollection, type BuildingData, type BuildingIssue, type BuildingRecords, type BuildingTypes,
} from "./building";
import { buildingPlan, type BuildingPlanOptions } from "./buildingPlan";

/** Options for `new BuildingSession(…)`: the document's name and the types its records name. */
export interface BuildingSessionOptions {
  /** The document's name when the source has none (default "building"). */
  name?: string;
  /** Wall, slab, opening and room types (default `defaultBuildingTypes()`). */
  types?: BuildingTypes;
}

/** A building in numbers, by storey: what `BuildingSession.summary()` returns. */
export interface BuildingSummary {
  storeys: {
    id: string; name: string; elevation: number; height: number;
    walls: number; openings: number; slabs: number; stairs: number; roofs: number;
    /** The storey's rooms with their floor area in m². */
    rooms: { key: string; name: string; use?: string; area: number }[];
    /** Floor area of the storey's rooms, m². */
    area: number;
    /** The box around the storey's wall centrelines, `[x, y]` in metres; null without walls. */
    bounds: { min: [number, number]; max: [number, number] } | null;
  }[];
  /** Floor area of all rooms, m². */
  area: number;
  issues: { errors: number; warnings: number };
}

const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits;

/**
 * A building document in memory, with the calls an agent makes on it: `info`, `records`,
 * `apply`, `check`, `undo`, `snapshot`. No browser, no scene: the building is built from the
 * records when it is asked for.
 */
export class BuildingSession {
  /** The document: its records, its undo history. Collections that are not a building's (an app's notes) are kept as they are. */
  readonly doc: Doc<BuildingRecords>;
  readonly types: BuildingTypes;
  private built: Building | null = null;

  /**
   * `source` is a document (a `Doc`: with a shared adapter the session works on the live
   * model, and its edits reach everyone who has it open), a saved document (`doc.toJSON()`,
   * what the House app's Save writes), plain building records (`{ storeys, walls, … }`), or
   * nothing for an empty building.
   */
  constructor(source?: Doc<any> | DocJSON | BuildingData | null, opts: BuildingSessionOptions = {}) {
    this.types = opts.types ?? defaultBuildingTypes();
    if (source instanceof Doc) {
      this.doc = source as Doc<BuildingRecords>;
      this.doc.onChange(() => { this.built = null; });
      return;
    }
    const saved = source && (source as DocJSON).format !== undefined ? (source as DocJSON) : null;
    if (saved && saved.format !== "tekto-doc/1") throw new Error(`BuildingSession: not a tekto document (format ${String(saved.format)})`);
    this.doc = new Doc<BuildingRecords>({ name: saved?.name ?? opts.name ?? "building" });
    const collections = saved ? saved.collections : ((source ?? {}) as Record<string, Record<string, unknown>>);
    this.doc.load({ format: "tekto-doc/1", name: this.doc.name, collections: collections ?? {} });
    this.doc.onChange(() => { this.built = null; });
  }

  /** The building's records alone (a document may hold more, e.g. notes). */
  data(): BuildingData {
    const all = this.doc.toJSON().collections;
    const out: Record<string, unknown> = {};
    for (const c of BUILDING_COLLECTIONS) if (all[c]) out[c] = all[c];
    return out as BuildingData;
  }

  /** The building as built from the records now (built once per change). */
  get building(): Building {
    return (this.built ??= realizeBuilding(this.data(), this.types));
  }

  /** Each collection's JSON Schema: what `apply` checks a record against. */
  schema(): Record<BuildingCollection, RecordSchema> {
    return buildingSchema(this.types);
  }

  /** What the document is: its name, how many records each collection holds, their schema, and the building in numbers. */
  info(): { name: string; collections: Record<string, number>; schema: Record<BuildingCollection, RecordSchema>; summary: BuildingSummary } {
    const all = this.doc.toJSON().collections;
    const collections: Record<string, number> = {};
    for (const c of BUILDING_COLLECTIONS) collections[c] = Object.keys(all[c] ?? {}).length;
    for (const [c, rows] of Object.entries(all)) collections[c] ??= Object.keys(rows).length;
    return { name: this.doc.name, collections, schema: this.schema(), summary: this.summary() };
  }

  /** Collection → id → record; one collection, or all. */
  records(collection?: string): Record<string, Record<string, unknown>> {
    const all = this.doc.toJSON().collections as Record<string, Record<string, Record<string, unknown>>>;
    return collection ? { [collection]: all[collection] ?? {} } : all;
  }

  /**
   * Apply a patch (`{ set, update, remove }` by `"collection/id"`) as one undo step. A record
   * that breaks the schema rejects the whole patch (`ok: false`, `rejected` says why); else
   * `issues` is what the check says about the building as it is now.
   */
  apply(patch: DocPatch, label?: string): PatchResult & { issues: BuildingIssue[] } {
    const result = applyPatch(this.doc, patch, { schema: this.schema(), label: label ?? "Agent edit" });
    return { ...result, issues: this.check() };
  }

  /** What is wrong with the building now: `building.check()`, errors and warnings by record. */
  check(): BuildingIssue[] {
    return this.building.check();
  }

  undo(): boolean { return this.doc.undo(); }
  redo(): boolean { return this.doc.redo(); }

  /** The building in numbers: per storey its parts, its rooms with their areas, its extent. */
  summary(): BuildingSummary {
    const b = this.building;
    const data = b.data;
    const issues = this.check();
    const storeys = b.storeys.map((s) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const w of s.walls.values()) for (const p of w.ribbon.centerline) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      const rooms = [...s.spaces].map(([id, sp]) => {
        const use = data.spaces?.[id]?.use;
        return { key: `spaces/${id}`, name: sp.name, ...(use ? { use } : {}), area: round(sp.area()) };
      });
      return {
        id: s.id, name: s.record.name, elevation: s.record.elevation, height: s.record.height,
        walls: s.walls.size, openings: s.openings.size, slabs: s.slabs.size, stairs: s.stairs.size, roofs: s.roofs.size,
        rooms, area: round(rooms.reduce((sum, r) => sum + r.area, 0)),
        bounds: x0 === Infinity ? null : { min: [round(x0), round(y0)] as [number, number], max: [round(x1), round(y1)] as [number, number] },
      };
    });
    return {
      storeys, area: round(storeys.reduce((sum, s) => sum + s.area, 0)),
      issues: { errors: issues.filter((i) => i.severity === "error").length, warnings: issues.filter((i) => i.severity === "warning").length },
    };
  }

  /** The floor plans as a drawing (`buildingPlan`): `toSVG()`, `toDXF()`, `toPNG()`. */
  plan(opts: BuildingPlanOptions = {}): Sheet {
    return buildingPlan(this.building, opts);
  }

  /**
   * Look at the building: a floor plan per storey as a PNG image (one storey with `storey`),
   * each part named by its record, with the summary and the check's issues. A check that
   * passes is not the same as a plan that looks right.
   */
  async snapshot(opts: { storey?: string } & SheetRasterOptions = {}): Promise<{ plans: { storey: string; name: string; png: Uint8Array }[]; summary: BuildingSummary; issues: BuildingIssue[] }> {
    const { storey, ...raster } = opts;
    const b = this.building;
    const wanted = storey === undefined ? b.storeys : b.storeys.filter((s) => s.id === storey);
    if (storey !== undefined && !wanted.length) throw new Error(`no storey "${storey}" (storeys: ${b.storeys.map((s) => s.id).join(", ") || "none"})`);
    const plans = [];
    for (const s of wanted) plans.push({ storey: s.id, name: s.record.name, png: await buildingPlan(b, { storey: s.id }).toPNG({ width: 1400, ...raster }) });
    return { plans, summary: this.summary(), issues: this.check() };
  }

  /** The document as the House app saves and opens it. */
  toJSON(): DocJSON {
    return this.doc.toJSON();
  }

  /** The building as an IFC file (`building.toIfc`). */
  toIfc(opts: { projectName?: string; members?: boolean } = {}): string {
    return this.building.toIfc({ projectName: this.doc.name, ...opts });
  }
}
