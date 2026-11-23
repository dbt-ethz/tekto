/**
 * A building worked on without a browser: `BuildingSession`, and the MCP server holding the
 * building itself (`tools/mcp.mjs --doc` on the shared live document, `--file` on a file).
 */
import { describe, it, expect } from "vitest";
import { BuildingSession } from "../src/bim/buildingSession";
import { Doc } from "../src/collab/Doc";
import { devServerAdapter, memoryAdapter } from "../src/collab/SharedStore";
import type { BuildingRecords } from "../src/bim/building";
import { collabServer, exists, mcpFileSession, readText, tempDir, writeText } from "./helpers/mcp-file-session.mjs";

const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const ROOM = {
  "storeys/eg": { name: "Ground floor", elevation: 0, height: 2.8 },
  "walls/a": { storey: "eg", path: [[0, 0], [5, 0], [5, 4], [0, 4], [0, 0]] },
  "openings/d": { wall: "a", kind: "door", at: 2, width: 0.9 },
  "spaces/r": { storey: "eg", name: "Room", boundary: rect(0, 0, 5, 4), use: "living" },
};
const isPng = (b: Uint8Array) => b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71;
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

describe("BuildingSession", () => {
  it("applies a patch as one undo step and answers with the check's issues", () => {
    const s = new BuildingSession();
    expect(s.info().collections).toEqual({ storeys: 0, walls: 0, openings: 0, slabs: 0, spaces: 0, roofs: 0, stairs: 0 });
    expect(Object.keys(s.info().schema)).toEqual(["storeys", "walls", "openings", "slabs", "spaces", "roofs", "stairs"]);
    const r = s.apply({ set: ROOM }, "A room");
    expect(r.ok).toBe(true);
    expect(r.undo).toBe("A room");
    expect(r.issues.map((i) => i.code)).toEqual(["space-no-window"]);
    expect(s.summary()).toMatchObject({
      area: 20, issues: { errors: 0, warnings: 1 },
      storeys: [{ id: "eg", walls: 1, openings: 1, rooms: [{ key: "spaces/r", name: "Room", use: "living", area: 20 }], bounds: { min: [0, 0], max: [5, 4] } }],
    });
    expect(s.apply({ set: { "openings/w": { wall: "a", kind: "window", at: 7, width: 1.2 } } }).issues).toEqual([]);
    expect(s.undo()).toBe(true);
    expect(s.check().map((i) => i.code)).toEqual(["space-no-window"]);
    expect(s.undo()).toBe(true);
    expect(s.undo()).toBe(false);
    expect(s.building.storeys).toEqual([]);
  });

  it("rejects a patch that breaks the schema whole, and says why", () => {
    const s = new BuildingSession({ storeys: { eg: { name: "EG", elevation: 0, height: 3 } } });
    const r = s.apply({ set: { "walls/a": { storey: "eg", path: [[0, 0], [4, 0]] }, "walls/b": { storey: "eg", path: [[0, 0]] } } });
    expect(r.ok).toBe(false);
    expect(r.rejected).toEqual([{ key: "walls/b", message: "path: needs at least 2 items, got 1" }]);
    expect(s.records("walls")).toEqual({ walls: {} });
  });

  it("reads a saved document or plain records, keeps what is not the building's, and writes the House app's file", () => {
    const saved = { format: "tekto-doc/1" as const, name: "house", collections: { storeys: { eg: { name: "EG", elevation: 0, height: 3 } }, notes: { n1: { text: "Wider door" } } } };
    const s = new BuildingSession(saved);
    expect(s.info()).toMatchObject({ name: "house", collections: { storeys: 1, notes: 1 } });
    expect(s.check()).toEqual([]);                               // the notes are not a building collection: no warning
    s.apply({ set: { "walls/a": { storey: "eg", path: [[0, 0], [4, 0]] } } });
    const out = s.toJSON();
    expect(out.format).toBe("tekto-doc/1");
    expect(out.collections.notes).toEqual({ n1: { text: "Wider door" } });
    expect(new BuildingSession(JSON.parse(JSON.stringify(out))).records("walls")).toEqual({ walls: { a: { storey: "eg", path: [[0, 0], [4, 0]] } } });
    expect(() => new BuildingSession({ format: "other/2", name: "x", collections: {} } as never)).toThrow("not a tekto document");
    expect(s.toIfc()).toContain("IFCWALL");
  });

  it("looks: a floor plan per storey as PNG, with the numbers and the issues", async () => {
    const s = new BuildingSession();
    s.apply({ set: { ...ROOM, "storeys/og": { name: "Upper floor", elevation: 2.8, height: 2.6 }, "walls/b": { storey: "og", path: [[0, 0], [5, 0]] } } });
    const all = await s.snapshot({ width: 500 });
    expect(all.plans.map((p) => [p.storey, p.name, isPng(p.png)])).toEqual([["eg", "Ground floor", true], ["og", "Upper floor", true]]);
    expect(all.summary.storeys.map((x) => x.walls)).toEqual([1, 1]);
    expect(all.issues.map((i) => i.code).sort()).toEqual(["space-no-window", "storey-without-floor", "wall-end-free", "wall-end-free"]);
    expect((await s.snapshot({ storey: "og", width: 500 })).plans.map((p) => p.storey)).toEqual(["og"]);
    await expect(s.snapshot({ storey: "dg" })).rejects.toThrow('no storey "dg" (storeys: eg, og)');
    expect(s.plan({ storey: "eg" }).toSVG()).toContain('data-key="walls/a"');
  });

  it("on a shared document is one more participant: its edits reach the others, theirs reach it", async () => {
    const backend = memoryAdapter();
    const person = new Doc<BuildingRecords>({ name: "house", adapter: backend.withUser({ id: "u1", name: "Ada" }) });
    const agentDoc = new Doc<BuildingRecords>({ name: "house", adapter: backend.withUser({ id: "agent", name: "Claude" }) });
    await Promise.all([person.ready, agentDoc.ready]);
    const s = new BuildingSession(agentDoc);
    s.apply({ set: ROOM }, "A room");
    await settle(20);
    expect(person.get("walls", "a")).toEqual(ROOM["walls/a"]);
    person.add("openings", { wall: "a", kind: "window", at: 7, width: 1.2 }, { id: "w" });
    await settle(20);
    expect(s.check()).toEqual([]);                               // the person's window answers the agent's warning
    expect(s.summary().storeys[0].openings).toBe(2);
    expect(s.undo()).toBe(true);                                 // the agent's own step: the person's window stays
    await settle(20);
    expect(person.has("walls", "a")).toBe(false);
    expect(person.has("openings", "w")).toBe(true);
  });
});

const INIT = [
  { id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } },
  { method: "notifications/initialized" },
];
const callTool = (id: number, name: string, args: object = {}) => ({ id, method: "tools/call", params: { name, arguments: args } });
const answer = (r: { result?: any }) => JSON.parse(r.result.content[r.result.content.length - 1].text);

describe("tools/mcp.mjs --file", () => {
  it("builds a building in a file that is not there yet: info, apply, snapshot, undo, export", async () => {
    const file = `${tempDir()}/house.json`;
    const replies = await mcpFileSession([
      ...INIT,
      { id: 2, method: "tools/list" },
      callTool(3, "tekto_info"),
      callTool(4, "tekto_apply", { patch: { set: ROOM }, label: "A room" }),
      callTool(5, "tekto_snapshot"),
      callTool(6, "tekto_apply", { patch: { set: { "walls/x": { storey: "eg", path: [[9, 9], [12, 9]] } } }, label: "A stray wall" }),
      callTool(7, "tekto_undo"),
      callTool(8, "tekto_export", { format: "ifc" }),
      callTool(9, "tekto_export", { format: "svg", storey: "eg" }),
      callTool(10, "tekto_notes"),
      callTool(11, "tekto_apply", { patch: { set: { "walls/bad": { storey: "eg" } } } }),
    ], file);
    const [init, list, info, apply, snap, stray, undo, ifc, svg, notes, bad] = replies;
    expect(init.result.instructions).toContain("building file, without a browser");
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(["tekto_info", "tekto_records", "tekto_apply", "tekto_check", "tekto_snapshot", "tekto_propose", "tekto_proposals", "tekto_undo", "tekto_export"]);
    expect(answer(info)).toMatchObject({ title: "house", file, saved: false, doc: { collections: { walls: 0 } }, building: { storeys: [] } });
    expect(answer(apply)).toMatchObject({ ok: true, undo: "A room", issues: [{ code: "space-no-window", keys: ["spaces/r"] }] });
    expect(snap.result.content.map((c: { type: string }) => c.type)).toEqual(["text", "image", "text"]);
    expect(snap.result.content[0].text).toContain("Floor plan of Ground floor (storeys/eg)");
    expect(snap.result.content[1].mimeType).toBe("image/png");
    expect(snap.result.content[1].data.startsWith("iVBORw0KGgo")).toBe(true);
    expect(answer(snap)).toMatchObject({ building: { area: 20 }, issues: [{ code: "space-no-window" }] });
    expect(answer(stray).issues.map((i: { code: string }) => i.code)).toContain("wall-end-free");
    expect(answer(undo)).toEqual({ undone: true });
    expect(answer(ifc)).toMatchObject({ written: file.replace(/\.json$/, ".ifc"), issues: [] });
    expect(readText(answer(ifc).written)).toContain("IFCWALL");
    expect(readText(answer(svg).written)).toContain('data-key="walls/a"');
    expect(notes.error!.message).toContain('Unknown tool "tekto_notes"');
    expect(answer(bad)).toMatchObject({ ok: false, rejected: [{ key: "walls/bad" }] });
    // The file is the House app's document, as of the last step that changed it.
    const saved = JSON.parse(readText(file));
    expect(saved.format).toBe("tekto-doc/1");
    expect(Object.keys(saved.collections.walls)).toEqual(["a"]);
  }, 30000);

  it("reads the file again when someone else changed it", async () => {
    const file = `${tempDir()}/house.json`;
    writeText(file, JSON.stringify({ storeys: { eg: { name: "EG", elevation: 0, height: 3 } } }));   // plain records
    const replies = await mcpFileSession([
      ...INIT,
      callTool(2, "tekto_records", { collection: "storeys" }),
      callTool(3, "tekto_apply", { patch: { set: { "walls/a": { storey: "eg", path: [[0, 0], [4, 0]] } } } }),
    ], file);
    expect(answer(replies[1])).toEqual({ storeys: { eg: { name: "EG", elevation: 0, height: 3 } } });
    expect(exists(file) && JSON.parse(readText(file)).collections.walls.a.storey).toBe("eg");
  }, 30000);
});

describe("tools/mcp.mjs --doc", () => {
  it("joins the shared live document: a person with the app open sees the agent's edits, the agent sees theirs", async () => {
    const dir = tempDir();
    const server = await collabServer(dir);
    const person = new Doc<BuildingRecords>({ name: "house", adapter: devServerAdapter({ endpoint: `${server.url}/__tekto/collab`, user: { id: "u1", name: "Ada" } }) });
    try {
      await person.ready;
      person.add("storeys", { name: "Ground floor", elevation: 0, height: 2.8 }, { id: "eg" });
      await settle();
      const { "storeys/eg": _storey, ...rest } = ROOM;
      const seen: string[] = [];
      person.store.onPresence((list) => { for (const p of list) if (!seen.includes(p.user.name)) seen.push(p.user.name); });
      const replies = await mcpFileSession([
        ...INIT,
        callTool(2, "tekto_info"),
        callTool(3, "tekto_apply", { patch: { set: rest }, label: "A room" }),
        { wait: 400 },
        callTool(4, "tekto_snapshot", { storey: "eg" }),
      ], { doc: "house", url: server.url });
      const [init, info, apply, snap] = replies;
      expect(init.result.instructions).toContain("people share live");
      expect(answer(info)).toMatchObject({ title: "house", mode: "the shared live document, no browser", doc: { collections: { storeys: 1 } } });   // the person's storey
      expect(answer(apply)).toMatchObject({ ok: true, issues: [{ code: "space-no-window" }] });
      expect(snap.result.content[1].mimeType).toBe("image/png");
      await settle();
      expect(person.get("walls", "a")).toEqual(ROOM["walls/a"]);                   // arrived live, no file passed around
      expect(seen).toContain("Claude");                                            // and the agent was there to see
      expect(JSON.parse(readText(`${dir}/house.json`))["walls/a"].by).toBe("Claude");
    } finally {
      person.dispose();
      server.close();
    }
  }, 30000);

  it("says what to start when there is no server", async () => {
    const replies = await mcpFileSession([...INIT, callTool(2, "tekto_info")], { doc: "house", url: "http://127.0.0.1:9" });
    expect(replies[1].result.isError).toBe(true);
    expect(replies[1].result.content[0].text).toContain('Could not join the shared document "house" at http://127.0.0.1:9');
  }, 30000);
});
