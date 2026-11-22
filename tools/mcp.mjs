#!/usr/bin/env node
/**
 * An MCP server for the tekto app a person has open: an agent (Claude Code, Claude Desktop,
 * any MCP client) reads and edits the app's shared document, checks it, sees it, sets its
 * controls — in that tab, while the person watches, every edit one undo step for them.
 *
 *   claude mcp add tekto -- node node_modules/tekto/tools/mcp.mjs
 *   TEKTO_URL=http://localhost:5174 …        the app's dev server (default http://localhost:5173)
 *   TEKTO_PAGE=house …                       with several tabs open: the one whose URL or title contains this
 *   TEKTO_AGENT=Claude …                     the name the page shows while the agent works (default: the MCP client's)
 *
 * The app's dev server needs `tekto/markup-vite` (it relays the calls into the page) and the
 * app shares its document with `agentDoc(doc, { schema, check })`. No dependencies: JSON-RPC
 * over stdio, newline-delimited, as MCP's stdio transport specifies.
 *
 * Without a page — the server holds the building itself, and nobody needs the app open:
 *
 *   … mcp.mjs --doc house                    the shared document "house" on the dev server (TEKTO_DOC)
 *   … mcp.mjs --file house.json              a building file (TEKTO_FILE)
 *
 * `--doc` is the one to prefer: the agent joins the live model as one more participant (the
 * dev server needs `tekto/collab-vite`, the app `devServerAdapter()`): people who have the app
 * open see its edits arrive, it sees theirs, and there is one model, not copies of a file.
 * `--file` works on a file on disk, for when there is no server: a building document (what
 * the House app's Save JSON writes; plain building records are read too), created with the
 * first edit. In both the agent reads and patches the records, gets the check's issues,
 * undoes its steps, and looks at the floor plans as images.
 *
 * With `--propose` (TEKTO_PROPOSE=1), in any mode, the agent cannot change the model itself:
 * tekto_apply and tekto_undo are not offered, only tekto_propose, whose changes wait in the
 * document for a person to accept or reject. The way to run an agent on a model people share.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

const BASE = (process.env.TEKTO_URL ?? "http://localhost:5173").replace(/\/$/, "");
const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const VERSION = (() => {
  try { return JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version; }
  catch { return "0.0.0"; }
})();

/** Who is calling, as the page shows it: TEKTO_AGENT, else the MCP client's name ("claude-code" → "Claude Code"). */
let AGENT = process.env.TEKTO_AGENT ?? "Agent";
const agentName = (client) => String(client).split(/[-_\s]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

/** One call into the open page, through the dev server's relay. */
async function relay(op, args = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/__tekto/agent/call`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, args, agent: AGENT, ...(process.env.TEKTO_PAGE ? { page: process.env.TEKTO_PAGE } : {}) }),
    });
  } catch (e) {
    throw new Error(`No dev server at ${BASE} (${e.cause?.code ?? e.message}). Start the app's dev server, or set TEKTO_URL.`);
  }
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(`${BASE} answered ${res.status} without JSON: is tekto/markup-vite in its vite config?`); }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.result;
}

const text = (v) => ({ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 1) });
const POINT3 = { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 };

// ── File mode: a building file, no browser ─────────────────────────────────────

const fileArg = process.argv.indexOf("--file");
if (fileArg >= 0 && !process.argv[fileArg + 1]) {
  process.stderr.write("tekto mcp: --file needs a path, e.g. --file house.json\n");
  process.exit(2);
}
/** The building file this server works on, or null. */
const FILE = fileArg >= 0 ? path.resolve(process.argv[fileArg + 1]) : process.env.TEKTO_FILE ? path.resolve(process.env.TEKTO_FILE) : null;
const docArg = process.argv.indexOf("--doc");
if (docArg >= 0 && !process.argv[docArg + 1]) {
  process.stderr.write("tekto mcp: --doc needs a document name, e.g. --doc house\n");
  process.exit(2);
}
/** The shared document this server joins, or null. Neither a file nor a document: it works in the open page. */
const DOC = FILE ? null : docArg >= 0 ? process.argv[docArg + 1] : process.env.TEKTO_DOC || null;
/** The server holds the building itself (no page). */
const HEADLESS = Boolean(FILE || DOC);
/** The agent may only propose: tekto_apply and tekto_undo are not offered (`--propose`, TEKTO_PROPOSE=1). */
const PROPOSE_ONLY = process.argv.includes("--propose") || process.env.TEKTO_PROPOSE === "1";

let session = null;        // the BuildingSession on FILE
let sessionStamp = -1;     // the file's modification time as this server last read or wrote it

/** The tekto library, for working without a page: this package's own build (TEKTO_LIB names another module, for tests). */
async function library() {
  const spec = process.env.TEKTO_LIB ? pathToFileURL(path.resolve(process.env.TEKTO_LIB)).href : "tekto/core";
  let lib;
  try { lib = await import(spec); }
  catch (e) { throw new Error(`Working without a page needs the tekto library, and it could not load ${spec} (${e.message}). In tekto's own repository run "npm run build" first.`); }
  if (typeof lib.BuildingSession !== "function") throw new Error(`Working without a page needs a tekto build with BuildingSession, and ${spec} has none (it is older than this tool). In tekto's own repository run "npm run build" first.`);
  return lib;
}

/** The session on the shared document DOC: joined on the first call, live from then on. */
async function liveSession() {
  if (session) return session;
  const { BuildingSession, Doc, devServerAdapter } = await library();
  const doc = new Doc({ name: DOC, adapter: devServerAdapter({ endpoint: `${BASE}/__tekto/collab`, user: { id: `agent-${AGENT.toLowerCase().replace(/\W+/g, "-")}`, name: AGENT } }) });
  try { await doc.ready; }
  catch (e) {
    doc.dispose();
    throw new Error(`Could not join the shared document "${DOC}" at ${BASE} (${e.cause?.code ?? e.message}). Start the app's dev server (its vite config needs tekto/collab-vite), or set TEKTO_URL.`);
  }
  session = new BuildingSession(doc);
  return session;
}

/** The session on FILE: read on the first call, and again when someone else changed the file. */
async function fileSession() {
  const stamp = fs.existsSync(FILE) ? fs.statSync(FILE).mtimeMs : 0;
  if (session && stamp === sessionStamp) return session;
  const { BuildingSession } = await library();
  let source = null;
  if (stamp) {
    try { source = JSON.parse(fs.readFileSync(FILE, "utf8")); }
    catch (e) { throw new Error(`${FILE} is not JSON (${e.message}). Fix or remove the file.`); }
  }
  session = new BuildingSession(source, { name: path.basename(FILE).replace(/\.json$/i, "") });
  sessionStamp = stamp;
  return session;
}

/** Write the session back to FILE (to a temporary file first, so a reader never sees half of it). */
function saveSession() {
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(tmp, `${JSON.stringify(session.toJSON(), null, 2)}\n`);
  fs.renameSync(tmp, FILE);
  sessionStamp = fs.statSync(FILE).mtimeMs;
}

/** One call when the server holds the building: the same names and answers as the page's (`relay`). */
async function local(op, args = {}) {
  const s = FILE ? await fileSession() : await liveSession();
  const saved = () => { if (FILE) saveSession(); };      // a shared document saves itself
  switch (op) {
    case "info": {
      const info = s.info();
      return {
        title: info.name,
        ...(FILE ? { file: FILE, saved: fs.existsSync(FILE), mode: "a file, no browser" }
          : { shared: `${BASE} · ${DOC}`, mode: "the shared live document, no browser", others: s.doc.store.presence.filter((p) => p.session !== s.doc.store.session).map((p) => p.user.name) }),
        doc: { name: info.name, collections: info.collections, schema: info.schema },
        building: info.summary,
      };
    }
    case "records": return s.records(args.collection);
    case "apply": {
      const r = s.apply(args.patch ?? {}, args.label);
      if (r.ok) saved();
      return r;
    }
    case "check": return s.check();
    case "undo": {
      const undone = s.undo();
      if (undone) saved();
      return { undone };
    }
    case "snapshot": return s.snapshot({ storey: args.storey, proposal: args.proposal });
    case "propose": {
      if (!String(args.label ?? "").trim()) throw new Error("label is required: a few words saying what the proposal does");
      const r = s.propose(args.patch ?? {}, String(args.label).trim(), { by: AGENT, note: args.note });
      if (r.ok) saved();
      return r;
    }
    case "proposals": return s.proposals(args.status === "all" ? "all" : "open").map(({ patch: _patch, base: _base, ...p }) => p);
    case "export": {
      const format = args.format ?? "ifc";
      const base = FILE ? FILE.replace(/\.json$/i, "") : path.resolve(DOC.replace(/[^\w.-]/g, "_"));
      const out = args.path ? path.resolve(path.dirname(base), args.path) : `${base}.${format === "ifc" ? "ifc" : `plan.${format}`}`;
      let body;
      if (format === "ifc") body = s.toIfc();
      else if (format === "svg") body = s.plan({ storey: args.storey }).toSVG({ background: "#ffffff" });
      else if (format === "dxf") body = s.plan({ storey: args.storey }).toDXF();
      else throw new Error(`unknown format "${format}" (ifc, svg, dxf)`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, body);
      return { written: out, bytes: Buffer.byteLength(body), issues: s.check().filter((i) => i.severity === "error") };
    }
    default: throw new Error(`"${op}" needs the app open in a browser; this server holds the building itself (${FILE ?? DOC})`);
  }
}

/** One call: on the building this server holds, else into the open page. */
let queue = Promise.resolve();
const call = (op, args) => {
  if (!HEADLESS) return relay(op, args);
  const run = () => local(op, args);
  const next = queue.then(run, run);          // one after the other: they share the session and the file
  queue = next.catch(() => {});
  return next;
};

const TOOLS = [
  {
    name: "tekto_info",
    description: "What the open tekto app is: its title, the document it shares (collections with record counts, and each collection's JSON Schema — read it before writing records), how many notes people left on the model are open (tekto_notes lists them), its controls and commands, and errors the page logged. Call this first.",
    inputSchema: { type: "object", properties: {} },
    run: async () => [text(await call("info"))],
  },
  {
    name: "tekto_records",
    description: "The records of the app's document: collection → id → record. Give a collection to read only that one.",
    inputSchema: { type: "object", properties: { collection: { type: "string" } } },
    run: async (a) => [text(await call("records", { collection: a.collection }))],
  },
  {
    name: "tekto_apply",
    description: "Edit the app's document. Records are named \"collection/id\" (e.g. \"walls/w3\"): `set` adds a record or replaces it whole, `update` merges fields into an existing one, `remove` deletes. The patch is checked against the collections' schema first: if any record is invalid nothing is applied and `rejected` says why, by record. Otherwise it is applied as one undo step for the person (named by `label`), and the result lists what changed and the app's `issues` afterwards (errors and warnings by record): fix them with another patch. Write a whole building in one patch, then refine.",
    inputSchema: {
      type: "object", required: ["patch"],
      properties: {
        patch: {
          type: "object",
          properties: {
            set: { type: "object", description: "\"collection/id\" → whole record", additionalProperties: { type: "object" } },
            update: { type: "object", description: "\"collection/id\" → fields to change", additionalProperties: { type: "object" } },
            remove: { type: "array", items: { type: "string" }, description: "\"collection/id\" to delete" },
          },
        },
        label: { type: "string", description: "What the person sees as \"Undo <label>\"" },
      },
    },
    run: async (a) => [text(await call("apply", { patch: a.patch ?? {}, label: a.label }))],
  },
  {
    name: "tekto_check",
    description: "What is wrong with the app's document now, as the app checks it: errors and warnings, each with the records it concerns.",
    inputSchema: { type: "object", properties: {} },
    run: async () => [text(await call("check"))],
  },
  {
    name: "tekto_notes",
    description: "The notes people left on the model: what they want changed, each pinned to a place and naming the records it is about (`keys`, e.g. \"walls/s\"), with its number in the view, its author and the replies so far. By default the open ones — your to-do list; `status: \"all\"` includes the done ones. Work through them: make the change (tekto_apply), then tekto_note_resolve with what you did, or tekto_note_reply to ask back.",
    inputSchema: { type: "object", properties: { status: { type: "string", enum: ["open", "all"] } } },
    run: async (a) => [text(await call("notes", { status: a.status }))],
  },
  {
    name: "tekto_note_reply",
    description: "Answer a note without closing it: a question back, or why it cannot be done. The person (and everyone on a shared model) sees the reply on the note. `id` is the note's id from tekto_notes.",
    inputSchema: { type: "object", required: ["id", "text"], properties: { id: { type: "string" }, text: { type: "string" } } },
    run: async (a) => [text(await call("noteReply", { id: a.id, text: a.text }))],
  },
  {
    name: "tekto_note_resolve",
    description: "Mark a note done once you have made the change it asks for, with a short `text` saying what you changed. Its pin turns grey; the person can reopen it. Resolve only what you actually did and checked.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, text: { type: "string", description: "What you changed" } } },
    run: async (a) => [text(await call("noteResolve", { id: a.id, text: a.text }))],
  },
  {
    name: "tekto_snapshot",
    description: "See the app as the person sees it: an image of the view, and a summary of what is drawn (objects by record key, bounds) with the app's log lines and errors. Look after edits: a check passing is not the same as the result looking right.",
    inputSchema: { type: "object", properties: { note: { type: "string", description: "Written into the snapshot's legend" } } },
    run: async (a) => {
      if (HEADLESS) {
        const r = await call("snapshot", { storey: a.storey, proposal: a.proposal });
        const out = [];
        if (a.proposal) out.push(text(`The building as proposal ${a.proposal} would leave it; what it adds or changes is drawn in red. The issues below are the check's with it applied.`));
        for (const p of r.plans) out.push(text(`Floor plan of ${p.name} (storeys/${p.storey}). Red names are record ids: a wall "s" is walls/s, an opening "d1" is openings/d1, the name under a room's area its spaces/ id. Coordinates in metres along the edges.`), { type: "image", data: Buffer.from(p.png).toString("base64"), mimeType: "image/png" });
        if (!r.plans.length) out.push(text("Nothing to draw yet: the building has no storey."));
        out.push(text({ building: r.summary, issues: r.issues }));
        return out;
      }
      const r = await call("snapshot", { note: a.note });
      const out = [];
      const m = /^data:(image\/\w+);base64,(.*)$/.exec(r.viewPng ?? "");
      if (m) out.push({ type: "image", data: m[2], mimeType: m[1] });
      const summary = JSON.stringify({ camera: r.camera, scene: r.scene, logs: r.logs, errors: r.errors }, null, 1);
      out.push(text(summary.length > 12000 ? `${summary.slice(0, 12000)}\n… (cut)` : summary));
      return out;
    },
  },
  {
    name: "tekto_undo",
    description: "Undo the last step in the app's document (the person's or yours), as Undo in the app would.",
    inputSchema: { type: "object", properties: {} },
    run: async () => [text(await call("undo"))],
  },
  {
    name: "tekto_set_params",
    description: "Set the app's controls by label (\"Radius\"), \"Group:Label\" or key, e.g. {\"Framing\": true}. Names that match nothing are reported.",
    inputSchema: { type: "object", required: ["params"], properties: { params: { type: "object" } } },
    run: async (a) => [text(await call("setParams", { params: a.params ?? {} }))],
  },
  {
    name: "tekto_run_command",
    description: "Run one of the app's commands by id (tekto_info lists them), as a person would by key or menu.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    run: async (a) => [text(await call("run", { id: a.id }))],
  },
  {
    name: "tekto_steps",
    description: "The program as the steps it ran (code that wraps its parts in lab.step / app.step): each step's inputs (and which step each came from), output, time, error, code location and the objects it drew; the links between steps; an analysis (slowest steps and chain, outputs nobody used, errors); and the notes the person left on steps (`marks`) — what they want changed, step by step. Read this before changing generated code the person has marked.",
    inputSchema: { type: "object", properties: {} },
    run: async () => [text(await call("steps"))],
  },
  {
    name: "tekto_section",
    description: "Cut the 3D view, to see inside before a snapshot: a plan is axis \"z\" at a height (`coordinate`, metres, e.g. 1.2 above a storey's floor), an elevation cut is \"x\" or \"y\"; `flip` keeps the other side. No axis: remove the cut. Views (top, front, orthographic) are commands: tekto_run_command.",
    inputSchema: { type: "object", properties: { axis: { type: "string", enum: ["x", "y", "z"] }, coordinate: { type: "number" }, at: { type: "number", description: "0–1 across the model instead of a coordinate" }, flip: { type: "boolean" } } },
    run: async (a) => [text(await call("section", { axis: a.axis, coordinate: a.coordinate, at: a.at, flip: a.flip }))],
  },
  {
    name: "tekto_camera",
    description: "Move the app's 3D camera: position [x, y, z] and the point it looks at, in the scene's coordinates (metres, Z up in building apps).",
    inputSchema: { type: "object", required: ["position"], properties: { position: POINT3, target: POINT3 } },
    run: async (a) => [text(await call("camera", { position: a.position, target: a.target }))],
  },
];

TOOLS.push(
  {
    name: "tekto_propose",
    description: "Propose a change instead of making it: the same patch as tekto_apply (`set`, `update`, `remove` by \"collection/id\"), stored in the document as an open proposal that a person accepts or rejects in the app. Nothing in the model changes until they accept. Checked against the schema first (`rejected` says why it could not be proposed). The answer has the proposal's `id` and what the check would say with it applied: `issues`, of those the ones it would newly cause (`added`), and the current ones it would settle (`resolved`). Give `label` (a few words: what it does) and `note` (why: what the reviewer should know). One proposal per decision a person would make: do not bundle unrelated changes.",
    inputSchema: {
      type: "object", required: ["patch", "label"],
      properties: {
        patch: { type: "object", properties: { set: { type: "object", additionalProperties: { type: "object" } }, update: { type: "object", additionalProperties: { type: "object" } }, remove: { type: "array", items: { type: "string" } } } },
        label: { type: "string", description: "What it does, in a few words (\"Wider entrance door\")" },
        note: { type: "string", description: "Why: the reasoning the reviewer should read" },
      },
    },
    run: async (a) => [text(await call("propose", { patch: a.patch ?? {}, label: a.label, note: a.note }))],
  },
  {
    name: "tekto_proposals",
    description: "The proposals in the document: by default the open ones (waiting for a person); `status: \"all\"` adds the accepted and the rejected ones, with who decided and, for a rejection, the reason: read it before proposing again. Each lists the records it changes (`changes`) and the ones someone has changed since it was proposed (`stale`).",
    inputSchema: { type: "object", properties: { status: { type: "string", enum: ["open", "all"] } } },
    run: async (a) => [text(await call("proposals", { status: a.status }))],
  },
);
if (PROPOSE_ONLY) for (const name of ["tekto_apply", "tekto_undo"]) TOOLS.splice(TOOLS.findIndex((t) => t.name === name), 1);

/** What the server offers when it holds the building: the document tools, a look, and the files to hand on. */
const FILE_TOOLS = [
  {
    name: "tekto_info",
    description: "What the building is: its name and where it lives (the shared live document, with who else has it open, or a file), the collections with record counts and each collection's JSON Schema (read it before writing records), and the building in numbers (storeys, rooms with areas, extents, how many issues). Call this first.",
    inputSchema: { type: "object", properties: {} },
  },
  { name: "tekto_records" },
  {
    name: "tekto_apply",
    description: "Edit the building. Records are named \"collection/id\" (e.g. \"walls/w3\"): `set` adds a record or replaces it whole, `update` merges fields into an existing one, `remove` deletes. The patch is checked against the collections' schema first: if any record is invalid nothing is applied and `rejected` says why, by record. Otherwise it is applied as one undo step (on a shared document everyone who has it open sees the change at once; a file is written), and `issues` is what the check says about the building now: fix the errors, read the warnings.",
  },
  {
    name: "tekto_check",
    description: "What is wrong with the building now: errors and warnings, each with the records it concerns.",
  },
  {
    name: "tekto_snapshot",
    description: "See the building: a floor plan per storey as an image (walls, doors and windows, rooms with name and area, stairs), every part labelled with its record id and the model's coordinates along the edges, then the building in numbers and the check's issues. Look after edits: a check passing is not the same as a plan looking right.",
    inputSchema: { type: "object", properties: { storey: { type: "string", description: "One storey's id; default: every storey, an image each" }, proposal: { type: "string", description: "A proposal's id: see the building as that proposal would leave it, its changes in red" } } },
  },
  { name: "tekto_propose" },
  { name: "tekto_proposals" },
  {
    name: "tekto_undo",
    description: "Undo your last edit to the building: your own steps since this server started, not other people's.",
  },
  {
    name: "tekto_export",
    description: "Write the building as a file to hand on (beside the building file, or in the working directory for a shared document): \"ifc\" (IFC4, for BIM tools), or the floor plans as \"svg\" or \"dxf\". Answers with the path written.",
    inputSchema: { type: "object", properties: { format: { type: "string", enum: ["ifc", "svg", "dxf"] }, storey: { type: "string", description: "For svg and dxf: one storey's id (default all, side by side)" }, path: { type: "string", description: "Where to write (default: the building's name with the format's ending)" } } },
    run: async (a) => [text(await call("export", { format: a.format, storey: a.storey, path: a.path }))],
  },
].filter((t) => !PROPOSE_ONLY || !["tekto_apply", "tekto_undo"].includes(t.name)).map((t) => ({ ...TOOLS.find((p) => p.name === t.name), ...t }));

/** The tools of this server's mode. */
const ACTIVE = HEADLESS ? FILE_TOOLS : TOOLS;

const FILE_INSTRUCTIONS = `These tools work on a building ${DOC ? "that people share live: your edits reach everyone who has it open at once, and theirs reach you, so read the records again before you build on them" : "file, without a browser"}. The building is plain records (storeys, walls, openings, slabs, spaces, roofs, stairs) that reference each other by id. Start with tekto_info: it gives the collections and the JSON Schema of their records. ${PROPOSE_ONLY ? "You cannot change the model yourself: propose each change with tekto_propose (a label and a note saying why), read the issues it would cause, look at it with tekto_snapshot and the proposal's id, and leave it for a person to accept or reject. tekto_proposals tells you what became of earlier ones." : "Make changes with tekto_apply (one undo step each), read its issues and fix them; where people should decide, use tekto_propose instead."} Look with tekto_snapshot: the floor plans as images. Z up, metres.`;

const INSTRUCTIONS = HEADLESS ? FILE_INSTRUCTIONS : "These tools work in the tekto app open in the person's browser. Start with tekto_info: it gives the document's collections and the JSON Schema of their records. Make changes with tekto_apply (one undo step each), read tekto_apply's issues and fix them, and look with tekto_snapshot. If tekto_info reports open notes, they are what the person wants changed: read them with tekto_notes, and resolve each with what you did.";

// ── JSON-RPC over stdio ───────────────────────────────────────────────────────

const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...msg })}\n`);

async function handle(msg) {
  const { id, method, params } = msg;
  const reply = (result) => { if (id !== undefined) send({ id, result }); };
  const fail = (code, message) => { if (id !== undefined) send({ id, error: { code, message } }); };
  switch (method) {
    case "initialize":
      if (!process.env.TEKTO_AGENT && params?.clientInfo?.name) AGENT = agentName(params.clientInfo.name);
      return reply({
        protocolVersion: VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "tekto", version: VERSION },
        instructions: INSTRUCTIONS,
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: ACTIVE.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const tool = ACTIVE.find((t) => t.name === params?.name);
      if (!tool) return fail(-32602, `Unknown tool "${params?.name}" (tools: ${ACTIVE.map((t) => t.name).join(", ")})`);
      try { return reply({ content: await tool.run(params.arguments ?? {}) }); }
      catch (e) { return reply({ content: [text(e instanceof Error ? e.message : String(e))], isError: true }); }
    }
    default:
      if (method?.startsWith("notifications/")) return;     // initialized, cancelled …: nothing to answer
      return fail(-32601, `Method not found: ${method}`);
  }
}

const lines = readline.createInterface({ input: process.stdin });
// A shared document's connection would keep the process alive after the client has gone.
lines.on("close", () => { if (DOC) void queue.finally(() => { session?.doc.dispose(); process.exit(0); }); });
lines.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ id: null, error: { code: -32700, message: "Parse error" } }); }
  void handle(msg).catch((e) => process.stderr.write(`tekto mcp: ${e?.stack ?? e}\n`));
});
