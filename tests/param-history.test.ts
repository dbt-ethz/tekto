/**
 * ParamHistory: undo and redo over a ParamStore's values, a step per committed change.
 */
import { describe, expect, it } from "vitest";
import { ParamStore } from "../src/gui/Params";
import { ParamHistory } from "../src/gui/ParamHistory";

const store = () => new ParamStore({
  width: { type: "float", min: 0, max: 20, default: 9 },
  storeys: { type: "int", min: 1, max: 6, default: 2 },
  roof: { type: "select", options: ["gable", "flat"], default: "gable" },
});

describe("ParamHistory", () => {
  it("undoes and redoes committed changes, one step each", () => {
    const s = store(), h = new ParamHistory(s);
    expect(h.canUndo()).toBe(false);
    s.set("width", 12); h.commit();
    s.set("storeys", 3); s.set("roof", "flat"); h.commit();      // two values, one step
    expect(h.canUndo()).toBe(true);

    h.undo();
    expect(s.getAll()).toMatchObject({ width: 12, storeys: 2, roof: "gable" });
    h.undo();
    expect(s.get("width")).toBe(9);
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(true);

    h.redo(); h.redo();
    expect(s.getAll()).toMatchObject({ width: 12, storeys: 3, roof: "flat" });
    expect(h.canRedo()).toBe(false);
  });

  it("a change made in code is a step when undo is asked for; a new change drops the redo steps", () => {
    const s = store(), h = new ParamHistory(s);
    s.set("width", 14);                                           // not committed (set by an agent)
    expect(h.canUndo()).toBe(true);
    h.undo();
    expect(s.get("width")).toBe(9);
    expect(h.canRedo()).toBe(true);
    s.set("width", 5); h.commit();
    expect(h.canRedo()).toBe(false);
  });

  it("a slider drag is one step: many values, one commit", () => {
    const s = store(), h = new ParamHistory(s);
    for (const v of [10, 11, 12, 13]) s.set("width", v);
    h.commit();
    h.undo();
    expect(s.get("width")).toBe(9);
  });

  it("controls declared later start from their value, and ones that are gone are left out", () => {
    const s = new ParamStore<any>({}), h = new ParamHistory(s);
    s.define("a", { type: "float", min: 0, max: 10, default: 1 });
    s.define("b", { type: "float", min: 0, max: 10, default: 2 });
    h.adopt();
    expect(h.canUndo()).toBe(false);                              // declaring a control is not an edit
    s.set("a", 5); h.commit();
    s.remove("b");
    h.undo();
    expect(s.get("a")).toBe(1);
    expect(s.has("b")).toBe(false);
  });

  it("gives the Edit menu its two commands", () => {
    const s = store(), h = new ParamHistory(s);
    const [undo, redo] = h.commands();
    expect([undo.id, undo.group, undo.keys]).toEqual(["edit.undo", "Edit", "Mod+Z"]);
    expect(redo.id).toBe("edit.redo");
    expect(undo.enabled!()).toBe(false);
    s.set("width", 3); h.commit();
    expect(undo.enabled!()).toBe(true);
    undo.run();
    expect(s.get("width")).toBe(9);
  });
});
