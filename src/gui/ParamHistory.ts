/**
 * ParamHistory — undo and redo for the values of a `ParamStore`.
 *
 * Every app with a panel gets Undo for free: a step is one committed change (a slider let
 * go, a switch flipped, a value set by an agent), and undoing writes the earlier values back
 * into the store, which re-runs the app as any change does. An app with a document (`Doc`)
 * has a richer undo of its own and declares its own `edit.undo` instead.
 */
import type { ParamStore } from "./Params";
import type { Command } from "./Commands";

type Snapshot = Record<string, unknown>;

const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Undo / redo over a `ParamStore`'s values. Call `commit()` when a change is complete. */
export class ParamHistory {
  private past: Snapshot[] = [];
  private future: Snapshot[] = [];
  private last: Snapshot;
  private applying = false;

  constructor(private store: ParamStore<any>, private limit = 200) {
    this.last = this.snapshot();
  }

  private snapshot(): Snapshot {
    return JSON.parse(JSON.stringify(this.store.getAll() ?? {})) as Snapshot;
  }

  /** Controls that appeared since (a sketch declared them) start from their current value: no step. */
  adopt(): void {
    const now = this.snapshot();
    for (const k of Object.keys(now)) if (!(k in this.last)) this.last[k] = now[k];
  }

  /** Whether the values differ from the last step (a change made in code, not yet committed). */
  private dirty(now = this.snapshot()): boolean {
    return Object.keys(now).some((k) => k in this.last && !same(now[k], this.last[k]));
  }

  /** A change is complete: one undo step, if anything differs from the last one. */
  commit(): void {
    if (this.applying) return;
    const now = this.snapshot();
    const changed = this.dirty(now);
    this.adopt();
    if (!changed) return;
    this.past.push(this.last);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    this.last = { ...this.last, ...now };
  }

  canUndo(): boolean { return this.past.length > 0 || this.dirty(); }
  canRedo(): boolean { return this.future.length > 0; }

  undo(): void {
    this.commit();                          // a change not yet committed is a step of its own
    const target = this.past.pop();
    if (!target) return;
    this.future.push(this.last);
    this.restore(target);
  }

  redo(): void {
    this.commit();                          // (which, if it finds a change, empties the redo steps)
    const target = this.future.pop();
    if (!target) return;
    this.past.push(this.last);
    this.restore(target);
  }

  private restore(target: Snapshot): void {
    this.apply(target);
    this.last = { ...this.last, ...target };
  }

  /** Write a snapshot's values back; controls that no longer exist are left out. */
  private apply(target: Snapshot): void {
    this.applying = true;
    try {
      for (const [k, v] of Object.entries(target)) {
        if (this.store.has(k) && !same(this.store.get(k), v)) this.store.set(k, v as never);
      }
    } finally { this.applying = false; }
  }

  /** The Edit menu's Undo and Redo, with their keys. */
  commands(): Command[] {
    return [
      { id: "edit.undo", label: "Undo", keys: "Mod+Z", group: "Edit", run: () => this.undo(), enabled: () => this.canUndo() },
      { id: "edit.redo", label: "Redo", keys: ["Shift+Mod+Z", "Mod+Y"], group: "Edit", run: () => this.redo(), enabled: () => this.canRedo() },
    ];
  }
}
