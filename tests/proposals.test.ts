/**
 * Proposals: a change that waits in the document for a person to accept or reject it.
 */
import { describe, it, expect } from "vitest";
import { Doc } from "../src/collab/Doc";
import { memoryAdapter } from "../src/collab/SharedStore";
import { acceptProposal, listProposals, patchedCollections, propose, rejectProposal } from "../src/collab/proposals";
import { BUILDING_SCHEMA, type BuildingRecords } from "../src/bim/building";
import { BuildingSession } from "../src/bim/buildingSession";
import { mcpFileSession, readText, tempDir, writeText } from "./helpers/mcp-file-session.mjs";

const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const ROOM = {
  "storeys/eg": { name: "Ground floor", elevation: 0, height: 2.8 },
  "walls/a": { storey: "eg", path: [[0, 0], [5, 0], [5, 4], [0, 4], [0, 0]] },
  "openings/d": { wall: "a", kind: "door", at: 2, width: 0.9 },
  "spaces/r": { storey: "eg", name: "Room", boundary: rect(0, 0, 5, 4), use: "living" },
};
const WINDOW = { wall: "a", kind: "window", at: 7, width: 1.2 };

function roomDoc() {
  const s = new BuildingSession();
  s.apply({ set: ROOM });
  s.doc.clearHistory();
  return s;
}

describe("proposals", () => {
  it("a proposal changes nothing until it is accepted; accepting is one undo step that reopens it", () => {
    const { doc } = roomDoc();
    const r = propose(doc, { set: { "openings/w": WINDOW }, update: { "openings/d": { width: 1 } }, remove: ["spaces/r"] }, { label: "A window, a wider door", by: "Claude", note: "The room has no daylight.", schema: BUILDING_SCHEMA });
    expect(r).toMatchObject({ ok: true, rejected: [] });
    expect(doc.has("openings", "w")).toBe(false);
    expect(doc.canUndo()).toBe(false);                              // proposing is not the person's undo step
    const [p] = listProposals(doc);
    expect(p).toMatchObject({ id: r.id, label: "A window, a wider door", by: "Claude", status: "open", note: "The room has no daylight.", stale: [] });
    expect(p.changes).toEqual([
      { key: "openings/w", kind: "add" },
      { key: "openings/d", kind: "change", fields: [{ name: "width", from: 0.9, to: 1 }] },
      { key: "spaces/r", kind: "remove" },
    ]);

    const done = acceptProposal(doc, r.id!, { schema: BUILDING_SCHEMA, by: "Ada" });
    expect(done).toMatchObject({ ok: true, undo: "Accept: A window, a wider door" });
    expect(doc.get("openings", "d")!.width).toBe(1);
    expect(doc.has("spaces", "r")).toBe(false);
    expect(listProposals(doc)).toEqual([]);
    expect(listProposals(doc, "all")[0]).toMatchObject({ status: "accepted", decidedBy: "Ada" });
    expect(acceptProposal(doc, r.id!).rejected[0].message).toBe("already accepted");

    expect(doc.undo()).toBe(true);                                  // one step: the records and the proposal's status
    expect(doc.get("openings", "d")!.width).toBe(0.9);
    expect(doc.has("openings", "w")).toBe(false);
    expect(listProposals(doc).map((x) => x.status)).toEqual(["open"]);
  });

  it("rejecting keeps the proposal, with the reason for whoever proposed it", () => {
    const { doc } = roomDoc();
    const { id } = propose(doc, { remove: ["openings/d"] }, { label: "No door", by: "Claude" });
    expect(rejectProposal(doc, id!, { by: "Ada", reason: "The room needs its door." })).toBe(true);
    expect(rejectProposal(doc, id!)).toBe(false);
    expect(doc.has("openings", "d")).toBe(true);
    expect(listProposals(doc)).toEqual([]);
    expect(listProposals(doc, "all")[0]).toMatchObject({ status: "rejected", decidedBy: "Ada", reason: "The room needs its door." });
  });

  it("is not stored when the patch could not be applied, and says why", () => {
    const { doc } = roomDoc();
    const r = propose(doc, { set: { "openings/w": { ...WINDOW, kind: "hatch" } }, update: { "walls/zz": { height: 2 } } }, { label: "Bad", by: "Claude", schema: BUILDING_SCHEMA });
    expect(r.ok).toBe(false);
    expect(r.rejected.map((x) => x.key)).toEqual(["openings/w", "walls/zz"]);
    expect(propose(doc, {}, { label: "Nothing", by: "Claude" }).rejected[0].message).toBe("the patch changes nothing");
    expect(listProposals(doc, "all")).toEqual([]);
  });

  it("says what moved under an open proposal, and does not apply one that no longer fits", () => {
    const { doc } = roomDoc();
    const { id } = propose(doc, { update: { "openings/d": { width: 1 } } }, { label: "Wider door", by: "Claude", schema: BUILDING_SCHEMA });
    doc.update("openings", "d", { at: 3 });
    expect(listProposals(doc)[0].stale).toEqual(["openings/d"]);
    doc.remove("openings", "d");
    const r = acceptProposal(doc, id!, { schema: BUILDING_SCHEMA });
    expect(r).toMatchObject({ ok: false, rejected: [{ key: "openings/d", message: "does not exist (use set to add it)" }] });
    expect(listProposals(doc)[0].status).toBe("open");
  });

  it("travels with a shared document: proposed in one window, accepted in another", async () => {
    const backend = memoryAdapter();
    const agent = new Doc<BuildingRecords>({ name: "house", adapter: backend.withUser({ id: "agent", name: "Claude" }) });
    const person = new Doc<BuildingRecords>({ name: "house", adapter: backend.withUser({ id: "u1", name: "Ada" }) });
    await Promise.all([agent.ready, person.ready]);
    const s = new BuildingSession(agent);
    s.apply({ set: ROOM });
    const r = s.propose({ set: { "openings/w": WINDOW } }, "A window", { by: "Claude" });
    await new Promise((x) => setTimeout(x, 20));
    expect(listProposals(person).map((p) => p.label)).toEqual(["A window"]);
    acceptProposal(person, r.id!, { by: "Ada" });
    await new Promise((x) => setTimeout(x, 20));
    expect(agent.has("openings", "w")).toBe(true);
    expect(s.proposals("all")[0]).toMatchObject({ status: "accepted", decidedBy: "Ada" });
  });

  it("patchedCollections copies: the records as a patch would leave them", () => {
    const before = { walls: { a: { t: 1 }, b: { t: 2 } } };
    const after = patchedCollections(before, { set: { "walls/c": { t: 3 } }, update: { "walls/a": { t: 9 } }, remove: ["walls/b"] });
    expect(after).toEqual({ walls: { a: { t: 9 }, c: { t: 3 } } });
    expect(before).toEqual({ walls: { a: { t: 1 }, b: { t: 2 } } });
  });
});

describe("BuildingSession.propose", () => {
  it("says what the check would say with the proposal applied: what it causes, what it settles", async () => {
    const s = roomDoc();
    expect(s.check().map((i) => i.code)).toEqual(["space-no-window"]);
    const good = s.propose({ set: { "openings/w": WINDOW } }, "A window", { by: "Claude" });
    expect(good).toMatchObject({ ok: true, issues: [], added: [] });
    expect(good.resolved.map((i) => i.code)).toEqual(["space-no-window"]);
    const bad = s.propose({ set: { "walls/x": { storey: "eg", path: [[9, 9], [12, 9]] } } }, "A stray wall", { by: "Claude" });
    expect(bad.added.map((i) => i.code)).toEqual(["wall-end-free", "wall-end-free"]);
    expect(s.check().map((i) => i.code)).toEqual(["space-no-window"]);       // nothing has changed yet
    expect(s.proposals().map((p) => p.label)).toEqual(["A window", "A stray wall"]);

    const look = await s.snapshot({ proposal: good.id, width: 400 });
    expect(look.issues).toEqual([]);
    expect(look.plans.length).toBe(1);
    await expect(s.snapshot({ proposal: "nope" })).rejects.toThrow('no proposal "nope"');
    expect(s.accept(good.id!, "Ada")).toMatchObject({ ok: true, issues: [] });
    expect(s.reject(bad.id!, { reason: "Not connected to anything." })).toBe(true);
    expect(s.proposals()).toEqual([]);
    expect(s.toJSON().collections.proposals).toBeDefined();                  // the history stays in the file
    expect(s.check()).toEqual([]);                                           // and is not a building collection
  });
});

const INIT = [
  { id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } },
  { method: "notifications/initialized" },
];
const callTool = (id: number, name: string, args: object = {}) => ({ id, method: "tools/call", params: { name, arguments: args } });
const answer = (r: { result?: any }) => JSON.parse(r.result.content[r.result.content.length - 1].text);

describe("tools/mcp.mjs --propose", () => {
  it("an agent that may only propose: no apply, no undo; its change waits in the file", async () => {
    const file = `${tempDir()}/house.json`;
    const start = new BuildingSession();
    start.apply({ set: ROOM });
    writeText(file, JSON.stringify(start.toJSON()));
    const replies = await mcpFileSession([
      ...INIT,
      { id: 2, method: "tools/list" },
      callTool(3, "tekto_propose", { patch: { set: { "openings/w": WINDOW } }, label: "A window", note: "The room has no daylight." }),
      callTool(4, "tekto_proposals"),
      callTool(5, "tekto_apply", { patch: { set: { "openings/w": WINDOW } } }),
      callTool(6, "tekto_propose", { patch: { set: { "openings/w": WINDOW } } }),
    ], { file, propose: true });
    const [init, list, proposed, listed, apply, unlabelled] = replies;
    expect(init.result.instructions).toContain("You cannot change the model yourself");
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(["tekto_info", "tekto_records", "tekto_check", "tekto_snapshot", "tekto_propose", "tekto_proposals", "tekto_export"]);
    expect(answer(proposed)).toMatchObject({ ok: true, issues: [], resolved: [{ code: "space-no-window" }] });
    expect(answer(listed)).toMatchObject([{ id: answer(proposed).id, label: "A window", by: "Claude", status: "open", note: "The room has no daylight.", changes: [{ key: "openings/w", kind: "add" }] }]);
    expect(answer(listed)[0].patch).toBeUndefined();
    expect(apply.error!.message).toContain('Unknown tool "tekto_apply"');
    expect(unlabelled.result.isError).toBe(true);
    const saved = JSON.parse(readText(file));
    expect(saved.collections.openings.w).toBeUndefined();
    expect(Object.values(saved.collections.proposals as Record<string, { label: string }>)[0].label).toBe("A window");
  }, 30000);
});
