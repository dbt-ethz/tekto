# appShell: an app people edit

<Live page="app-shell" label="App Shell" poster="/shots/twisted-tower.webp" alt="A twisting tower in an appShell" />

<Live page="site-editor" label="Site Editor" />

`appShell()` is the harness for a real app: a panel built once from a declared schema of params, a Z-up 3D view, and the viewer's tools every tekto 3D view has: the header with render style, lighting, sun, section and overlays, and the axis widget. Unlike `sketch()`, nothing is rebuilt unless you rebuild it: the app owns its `Scene` and decides what changes. That makes it the place for the retained model, with a [`Doc`](/buildings/doc), selection, undo and saving.

```ts
import { appShell, MeshFactory, MeshTransform, Vec3 } from "tekto";

const app = appShell({
  container: document.getElementById("app")!,
  title: "Tower",
  camera: [14, -16, 12],
  target: [0, 0, 4],
  params: {
    floors: { type: "int", min: 2, max: 40, default: 12, label: "Floors" },
    twist: { type: "float", min: 0, max: 180, default: 60, step: 1, label: "Twist (°)" },
    color: { type: "color", default: "#cfd8dc", label: "Color", display: true },
  },
});

const slabs: string[] = [];
app.onBuild(() => {                                   // build params changed: new geometry
  app.scene.clear();
  slabs.length = 0;
  const floors = app.params.get("floors") as number;
  const twist = ((app.params.get("twist") as number) * Math.PI) / 180;
  for (let i = 0; i < floors; i++) {
    const slab = MeshFactory.box(4, 2.4, 0.12);      // Z-up: thickness along z
    MeshTransform.rotate(slab, new Vec3(0, 0, 1), (twist * i) / (floors - 1));
    slab.translate(0, 0, i * 0.7);
    slabs.push(app.scene.addMesh(slab, { label: `floor ${i + 1}` }).id);
  }
  app.status(`${floors} floors`);
});
app.onDisplay(() => {                                 // display params changed: restyle only
  for (const id of slabs) app.scene.setStyle(id, { color: app.params.get("color") as string });
});
app.rebuild();
```

## What to know

- **Params are declared once.** A param with `display: true` calls `onDisplay` only, so changing a colour does not rebuild geometry. `groups` sorts params into folders.
- **The viewer's tools** are on by default, the same in every 3D view: the header across the view (render style, lighting, sun, section, overlays, snapshot, ✎ Markup) and the axis widget for plans and elevations. `viewerTools: { sun: false, section: false }` drops what the app does not need; `shadingBar: true` is the compact bar in a corner instead, `shadingBar: false` and `navGizmo: false` hide them. `topBar: true` adds the older text toolbar, with the sun for a date and a site.
- **Commands are the menu bar.** `app.commands.add([{ id: "file.save", label: "Save JSON", keys: "Mod+S", group: "File", run }])` puts an item in the File menu: people get the menu and the key, agents the id. `group` names the menu; File, Edit and View come first, then the app's own (`group: "Site"`), in the order declared. So the sidebar stays about the model, and opening, saving, exporting and undo live in the menus.
- **Undo is built in.** Edit ▸ Undo and Redo (⌘Z / Ctrl+Z) step back through changes to the params. An app with a [Doc](/buildings/doc) declares its own `edit.undo` over the document, which replaces it.
- **Notes**: `appShell({ notes: doc })` keeps ✎ Markup's marks as notes in the document. See [Markup and notes](/collaboration/notes).
- `app.overlay()` is a layer over the view, for a [drawing](/drawings/sheet-canvas) of the same model.

::: tip Playground
[App Shell](https://github.com/dbt-ethz/tekto/blob/main/playground/pages/app-shell.ts) (`?page=app-shell`) and the [Site Editor](https://github.com/dbt-ethz/tekto/blob/main/playground/pages/site-editor.ts) (`?page=site-editor`), the retained model end to end.
:::
