/**
 * Proposals — a change to a document that waits for a person to accept or reject it.
 *
 * An agent on a shared model should not rewrite it while people work in it. It proposes: the
 * patch it would apply (`{ set, update, remove }` by `"collection/id"`) is stored as a record
 * in the document's `proposals` collection, with who proposes it, why, and the records as
 * they were. Everyone who has the document open sees it. Accepting applies the patch as one
 * undo step (undo it and the proposal is open again); rejecting keeps it, with the reason, so
 * the agent learns what was not wanted. The list of proposals is the history of what the
 * agent changed and who agreed.
 *
 *   const r = propose(doc, { update: { "openings/entry": { width: 1.2 } } }, { label: "Wider entrance", by: "Claude", schema });
 *   listProposals(doc)[0].changes;      // [{ key: "openings/entry", kind: "change", fields: [{ name: "width", from: 1.1, to: 1.2 }] }]
 *   acceptProposal(doc, r.id!, { schema, by: "Ada" });
 */
import { applyPatch, type Doc, type DocPatch, type PatchResult } from "./Doc";
import type { RecordSchema } from "./recordSchema";

/** The collection proposals are kept in. */
export const PROPOSALS = "proposals";

/** A proposed change, as stored in the document. */
export interface Proposal {
  /** What it does, in a few words: the undo step's name once accepted ("Accept: Wider entrance"). */
  label: string;
  /** Who proposes it ("Claude"). */
  by: string;
  /** When, in milliseconds since 1970. */
  at: number;
  /** Why: the reasoning a reviewer should read. */
  note?: string;
  patch: DocPatch;
  status: "open" | "accepted" | "rejected";
  /** The records the patch touches as they were when it was proposed (`null`: not there). */
  base: Record<string, unknown>;
  /** Who accepted or rejected it, when, and (for a rejection) why. */
  decidedBy?: string;
  decidedAt?: number;
  reason?: string;
}

/** One record a proposal touches: added, changed (with the fields, before and after) or removed. */
export interface ProposalChange {
  key: string;
  kind: "add" | "change" | "remove";
  fields?: { name: string; from: unknown; to: unknown }[];
}

/** A proposal as `listProposals` gives it: with its id, what it changes, and what moved under it. */
export interface ProposalInfo extends Proposal {
  id: string;
  changes: ProposalChange[];
  /** Records it touches that were changed by someone since it was proposed (an open proposal only). */
  stale: string[];
}

type Collections = Record<string, Record<string, unknown>>;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const split = (key: string): [string, string] => { const i = key.indexOf("/"); return [key.slice(0, i), key.slice(i + 1)]; };
const touched = (patch: DocPatch): string[] => [...new Set([...Object.keys(patch.set ?? {}), ...Object.keys(patch.update ?? {}), ...(patch.remove ?? [])])];
const recordOf = (doc: Doc<any>, key: string): unknown => { const [c, id] = split(key); return doc.get(c, id) ?? null; };

/** The collections as a patch would leave them: a copy, nothing is changed. For a preview. */
export function patchedCollections(collections: Collections, patch: DocPatch): Collections {
  const out: Collections = {};
  for (const [c, rows] of Object.entries(collections)) out[c] = { ...rows };
  for (const [key, value] of Object.entries(patch.set ?? {})) { const [c, id] = split(key); (out[c] ??= {})[id] = value; }
  for (const [key, change] of Object.entries(patch.update ?? {})) { const [c, id] = split(key); if (out[c]?.[id]) out[c][id] = { ...(out[c][id] as object), ...change }; }
  for (const key of patch.remove ?? []) { const [c, id] = split(key); if (out[c]) delete out[c][id]; }
  return out;
}

/** What a patch changes, record by record, against the records as they were (`base`). */
export function patchChanges(patch: DocPatch, base: Record<string, unknown>): ProposalChange[] {
  const out: ProposalChange[] = [];
  const diff = (key: string, before: Record<string, unknown>, after: Record<string, unknown>): ProposalChange => {
    const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((name) => !same(before[name], after[name]))
      .map((name) => ({ name, from: before[name], to: after[name] }));
    return { key, kind: "change", fields };
  };
  for (const [key, value] of Object.entries(patch.set ?? {})) {
    const before = base[key];
    out.push(before ? diff(key, before as Record<string, unknown>, value as Record<string, unknown>) : { key, kind: "add" });
  }
  for (const [key, change] of Object.entries(patch.update ?? {})) {
    const before = (base[key] ?? {}) as Record<string, unknown>;
    out.push(diff(key, before, { ...before, ...change }));
  }
  for (const key of patch.remove ?? []) out.push({ key, kind: "remove" });
  return out;
}

/**
 * Propose a patch: checked like `applyPatch` would (a record that breaks `schema`, a missing
 * record: nothing is stored, `rejected` says why), then stored as an open proposal. The
 * document's own records do not change.
 */
export function propose(
  doc: Doc<any>,
  patch: DocPatch,
  opts: { label: string; by: string; note?: string; schema?: Partial<Record<string, RecordSchema>> },
): { ok: boolean; id?: string; rejected: PatchResult["rejected"] } {
  const check = applyPatch(doc, patch, { schema: opts.schema, dryRun: true });
  const keys = touched(patch);
  if (check.ok && !keys.length) check.rejected.push({ key: "", message: "the patch changes nothing" });
  if (!check.ok || check.rejected.length) return { ok: false, rejected: check.rejected };
  const base: Record<string, unknown> = {};
  for (const key of keys) base[key] = recordOf(doc, key);
  const record: Proposal = { label: opts.label, by: opts.by, at: Date.now(), ...(opts.note ? { note: opts.note } : {}), patch, status: "open", base };
  const id = doc.add(PROPOSALS, record, { label: `Propose: ${opts.label}`, undoable: false });
  return { ok: true, id, rejected: [] };
}

/** The proposals of a document, oldest first: the open ones (default) or all. */
export function listProposals(doc: Doc<any>, status: "open" | "all" = "open"): ProposalInfo[] {
  const rows = (doc.toJSON().collections[PROPOSALS] ?? {}) as Record<string, Proposal>;
  return Object.entries(rows)
    .filter(([, p]) => p && (status === "all" || p.status === "open"))
    .sort((a, b) => a[1].at - b[1].at)
    .map(([id, p]) => ({
      ...p, id,
      changes: patchChanges(p.patch, p.base ?? {}),
      stale: p.status === "open" ? touched(p.patch).filter((key) => !same(recordOf(doc, key), p.base?.[key] ?? null)) : [],
    }));
}

/**
 * Accept an open proposal: its patch is applied and the proposal marked accepted, as one undo
 * step ("Accept: <label>") — undo it and the records are as before and the proposal open
 * again. If the document has moved so the patch no longer applies, nothing changes and
 * `rejected` says why.
 */
export function acceptProposal(doc: Doc<any>, id: string, opts: { schema?: Partial<Record<string, RecordSchema>>; by?: string } = {}): PatchResult {
  const p = doc.get(PROPOSALS, id) as Proposal | undefined;
  const none = { set: [], updated: [], removed: [] };
  if (!p) return { ok: false, rejected: [{ key: `${PROPOSALS}/${id}`, message: "no such proposal" }], changed: none };
  if (p.status !== "open") return { ok: false, rejected: [{ key: `${PROPOSALS}/${id}`, message: `already ${p.status}` }], changed: none };
  const check = applyPatch(doc, p.patch, { schema: opts.schema, dryRun: true });
  if (!check.ok) return check;
  let result = check;
  doc.transact(`Accept: ${p.label}`, () => {
    result = applyPatch(doc, p.patch, { schema: opts.schema });
    doc.update(PROPOSALS, id, { status: "accepted", decidedAt: Date.now(), ...(opts.by ? { decidedBy: opts.by } : {}) });
  });
  return { ...result, undo: doc.undoLabel() };
}

/** Reject an open proposal, with the reason for whoever proposed it. It stays in the document. False if it is not open. */
export function rejectProposal(doc: Doc<any>, id: string, opts: { by?: string; reason?: string } = {}): boolean {
  const p = doc.get(PROPOSALS, id) as Proposal | undefined;
  if (!p || p.status !== "open") return false;
  doc.update(PROPOSALS, id, { status: "rejected", decidedAt: Date.now(), ...(opts.by ? { decidedBy: opts.by } : {}), ...(opts.reason ? { reason: opts.reason } : {}) }, { label: `Reject: ${p.label}` });
  return true;
}
