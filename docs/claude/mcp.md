# The MCP server

<Live page="house" label="House" poster="/shots/house-framing.webp" alt="The example house: what Claude writes from a short brief" />

`tools/mcp.mjs` is an MCP server for the tekto app a person has open. Claude Code, Claude Desktop or any MCP client gets the app's document as tools: it reads the records and their schema, applies a patch, checks the result, looks at the view, and answers the notes people left on the model. All of it happens in the open tab while the person watches, and every edit is one undo step for them. It has no dependencies: JSON-RPC over stdio.

The app shares its document with `agentDoc`:

```ts
import { agentDoc, appShell, bindBuilding, buildingSchema, Doc, localAdapter, type BuildingRecords, type Note } from "tekto";

const doc = new Doc<BuildingRecords & { notes: Note }>({ name: "house", adapter: localAdapter() });
const app = appShell({
  container: document.getElementById("app")!,
  title: "House",
  params: {},
  notes: doc,
  shadingBar: true,
});
const house = bindBuilding(doc, app.scene);

// The records an agent may edit, their schema, and what the app's check says about them.
agentDoc(doc, { schema: buildingSchema(), check: () => house.issues });
```

The app's Vite config needs the relay plugin (the playground has it):

```js
// vite.config.mjs
import tektoMarkup from "tekto/markup-vite";
export default { plugins: [tektoMarkup()] };
```

Then register the server with Claude Code:

```bash
claude mcp add tekto -- node node_modules/tekto/tools/mcp.mjs
# TEKTO_URL=http://localhost:5174   another dev server port (default 5173)
# TEKTO_PAGE=house                  with several tabs open, the one whose URL or title contains this
```

## The tools

| Tool | Does |
|---|---|
| `tekto_info` | the app, its collections with their JSON Schema, open notes, controls, commands, errors. Call it first |
| `tekto_records` | the records, by collection |
| `tekto_apply` | a patch `{ set, update, remove }` by `"collection/id"`, checked against the schema, one undo step |
| `tekto_check` | the app's errors and warnings, each with its records |
| `tekto_notes`, `tekto_note_reply`, `tekto_note_resolve` | the notes people left, answered or marked done |
| `tekto_snapshot` | an image of the view and a summary of what is drawn |
| `tekto_section`, `tekto_camera` | cut a plan or move the camera before a snapshot |
| `tekto_set_params`, `tekto_run_command`, `tekto_undo` | controls, commands and undo, as a person would |
| `tekto_propose`, `tekto_proposals` | a change that waits for a person to accept or reject it, and what became of earlier ones: see [Proposals](#proposals) |
| `tekto_steps` | the program as its [steps](/claude/steps) |

## Without the app open

The server can also hold the building itself, so an agent works while nobody has the app open: overnight checks, a batch of layout options, a fix for what the check reports.

```bash
# the shared document "house" on the dev server: the live model people have open
claude mcp add tekto -- node node_modules/tekto/tools/mcp.mjs --doc house
# a building file on disk, with no server at all
claude mcp add tekto -- node node_modules/tekto/tools/mcp.mjs --file house.json
```

Prefer `--doc`. The agent joins the shared document as one more participant, named in the presence bar: people who have the app open see its edits arrive, it sees theirs, and there is one model instead of copies of a file. It needs the collab plugin in the dev server (`tekto/collab-vite`) and an app that opens the document with `devServerAdapter()`: the House page does with `?shared=1`.

`--file` is for when there is no server. The file is the document the House app saves and opens (Save JSON, Open JSON); it is created with the first edit, and read again when someone else changed it.

In both modes the tools are the document's: `tekto_info`, `tekto_records`, `tekto_apply`, `tekto_check`, `tekto_undo` (the agent's own steps), `tekto_propose`, `tekto_proposals`, `tekto_snapshot` and `tekto_export`. A snapshot is a floor plan per storey as an image, each part labelled with its record id and the model's coordinates along the edges, with the building in numbers. `tekto_export` writes IFC, or the plans as SVG or DXF. The tools that need a view or a panel (camera, section, controls, commands, notes) are not offered.

In code, the same thing is a [`BuildingSession`](/buildings/records#without-a-browser).

## Proposals

On a model people share, an agent should not rewrite what they are working on. It proposes: `tekto_propose` takes the same patch as `tekto_apply`, with a `label` (what it does) and a `note` (why), and stores it in the document as an open proposal. Nothing in the model changes. The answer says what the check would say with it applied: the issues it would cause and the ones it would settle. `tekto_snapshot` with the proposal's id shows the plans as they would be, the changes in red.

A person reviews in the app. `ProposalBar` shows each open proposal over the view: who proposes it, the note, the records it adds, changes (field by field, before → after) and removes. **Accept** applies it as one undo step, so trying it and undoing is the preview: after an undo the proposal is open again. **Reject** keeps it with the reason typed beside it, and `tekto_proposals` with `status: "all"` gives the agent that reason back.

```ts
import { ProposalBar, buildingSchema } from "tekto";

new ProposalBar(doc, viewElement, { schema: buildingSchema(), onFocus: (keys) => selection.select(keys) });
agentDoc(doc, { schema: buildingSchema(), check: () => house.issues, preview: (c) => realizeBuilding(c).check() });
```

Start the server with `--propose` (in any mode) and the agent can only propose: `tekto_apply` and `tekto_undo` are not offered. That is the way to run an agent in the background on a shared document:

```bash
claude mcp add tekto -- node node_modules/tekto/tools/mcp.mjs --doc house --propose
```

Proposals are records in the document's `proposals` collection, so they travel with a shared document, are saved with a file, and stay as the history of what was proposed, by whom, and who decided. In code: `propose`, `listProposals`, `acceptProposal`, `rejectProposal`.

## Build a house from a brief

1. `npm run playground`, open the House page and press **Empty site** (or open it with `&empty`).
2. `claude mcp add tekto -- node tools/mcp.mjs`, then ask Claude Code: *"Build me a compact two-storey timber family house, about 140 m²: open living and kitchen facing south, a study, three bedrooms, a gable roof."*
3. Claude reads the schema, writes the house in one patch, fixes what the checks report, and looks at it with a snapshot and a plan cut.

Tested with a fresh agent and only that brief: a 144 m² house in two patches, with doors, windows, a U stair to the landing and a gable roof. While it works, a chip at the top of the page names it and what it is doing.

::: tip Playground
[House](https://github.com/dbt-ethz/tekto/blob/main/playground/pages/house.ts): `?page=house`.
:::
