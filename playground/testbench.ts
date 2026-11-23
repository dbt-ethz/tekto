/**
 * Tekto TestBench — page router with top-bar shell.
 *
 * The shell provides:
 *   • Page chooser (left of the top bar) — categorised dropdown.
 *     The render style, lighting, sun, section and overlays are in each
 *     view's own header (the viewer tools), the same in every tekto app.
 *   • A slot for the running app's menu bar (File, Edit, View, and the
 *     app's own), which each app builds from its commands and mounts here:
 *     `<span data-tekto-menu-slot>`. Exports and imports a sketch registers
 *     (`lab.registerExport` / `registerImport`) are in its File menu.
 *
 * Each page module just exports `default(container)` and is mounted
 * into `#app`. The shell tags `#app` with `data-shell="testbench"` so
 * `SketchConfig.showHeader` defaults to `false` and the sketch's own
 * 44 px title bar collapses into the top bar's page chooser.
 */

import { SketchInstance, Sketch2DInstance } from "../src";

// ─── Page registry ──────────────────────────────────────────────────

/**
 * What a page hands back. The shell only ever needs to be able to tear it
 * down, so a page that owns its own renderer (an appShell page does) is welcome
 * here too.
 */
type MountedPage = SketchInstance | Sketch2DInstance | { dispose(): void };

interface PageEntry {
  slug: string;
  label: string;
  /** The docs page about it, as a path under docs/ without ".md" ("buildings/house"). */
  docs?: string;
  /** Its source under pages/ without ".ts", when that isn't the slug ("lecture/house"). */
  source?: string;
  load: () => Promise<{ default: (container: HTMLElement) => MountedPage }>;
}
interface PageGroup { name: string; pages: PageEntry[]; }

/**
 * One of the apps of the lecture script "Digital Theory and Culture in
 * Architecture" (pages/lecture/, one file each, exporting an app named like
 * its file), mounted on its own by `page` from pages/lecture/shared.
 */
const lecture = (name: string, label: string): PageEntry => ({
  slug: `lecture-${name}`,
  label,
  source: `lecture/${name}`,
  load: async () => {
    const [app, { page }] = await Promise.all([import(`./pages/lecture/${name}.ts`), import("./pages/lecture/shared")]);
    return { default: page(app[name]) };
  },
});

const GROUPS: PageGroup[] = [
  { name: "Basics", pages: [
    { slug: "primitives",   label: "Primitives",     docs: "apps/sketch", load: () => import("./pages/primitives") },
    { slug: "transforms",   label: "Transforms",     docs: "apps/sketch", load: () => import("./pages/transforms") },
    { slug: "lines-points", label: "Lines & Points", docs: "geometry/vectors", load: () => import("./pages/lines-points") },
    { slug: "shape-modes",  label: "Shape Modes",    docs: "viewer/render-modes", load: () => import("./pages/shape-modes") },
    { slug: "colors",       label: "Colors",         load: () => import("./pages/colors") },
    { slug: "color-ramps",  label: "Colour Ramps",   load: () => import("./pages/color-ramps") },
    { slug: "layers",       label: "Layers",         load: () => import("./pages/layers") },
  ]},
  { name: "Geometry", pages: [
    { slug: "mesh-factory",   label: "MeshFactory",     docs: "geometry/mesh-factory", load: () => import("./pages/mesh-factory") },
    { slug: "curves",         label: "Curves",          docs: "curves/curves", load: () => import("./pages/curves") },
    { slug: "nurbs-surfaces", label: "NURBS Surfaces",  docs: "curves/nurbs", load: () => import("./pages/nurbs-surfaces") },
    { slug: "mesh-ops",       label: "Mesh Operations", docs: "geometry/mesh", load: () => import("./pages/mesh-ops") },
    { slug: "curvature",      label: "Curvature (Taubin)", docs: "curves/streamlines", load: () => import("./pages/curvature") },
    { slug: "streamlines",    label: "Streamlines",     docs: "curves/streamlines", load: () => import("./pages/streamlines") },
    { slug: "bsp-csg",        label: "BSP & CSG",       docs: "geometry/booleans", load: () => import("./pages/bsp-csg") },
  ]},
  { name: "Fields & Graphs", pages: [
    { slug: "sdf",          label: "SDF + Marching", load: () => import("./pages/sdf") },
    { slug: "graph",        label: "Graph",          load: () => import("./pages/graph") },
    { slug: "planar-graph", label: "Planar Graph",   docs: "2d/polygons", load: () => import("./pages/planar-graph") },
    { slug: "voronoi",      label: "Voronoi",        docs: "2d/voronoi", load: () => import("./pages/voronoi") },
    { slug: "steps", label: "Steps (a program as a graph)", docs: "claude/steps", load: () => import("./pages/steps") },
    { slug: "voxel-2d",     label: "Voxel Grid 2D",  load: () => import("./pages/voxel-2d") },
  ]},
  { name: "Motion & Camera", pages: [
    { slug: "particles", label: "Particles 2D", docs: "2d/packing", load: () => import("./pages/particles") },
    { slug: "circle-packing", label: "Circle Packing", docs: "2d/packing", load: () => import("./pages/circle-packing") },
    { slug: "camera",    label: "Camera",       docs: "interface/view", load: () => import("./pages/camera") },
    { slug: "gizmo",     label: "Pick & Gizmo", docs: "interface/editing", load: () => import("./pages/gizmo") },
    { slug: "shared-editing", label: "Shared Editing", docs: "collaboration/shared-editing", load: () => import("./pages/shared-editing") },
  ]},
  { name: "App Shell", pages: [
    { slug: "app-shell", label: "App Shell (retained)", docs: "apps/app-shell", load: () => import("./pages/app-shell") },
    { slug: "site-editor", label: "Site Editor (Doc + undo)", docs: "buildings/doc", load: () => import("./pages/site-editor") },
    { slug: "drawing-sheet", label: "Drawing Sheet (plan, elevations, DXF)", docs: "drawings/sheet", load: () => import("./pages/drawing-sheet") },
    { slug: "sketch-drawing", label: "Sketch + drawing (lab.overlay)", docs: "drawings/sheet-canvas", load: () => import("./pages/sketch-drawing") },
  ]},
  { name: "Sketch2D", pages: [
    { slug: "pointer-2d", label: "Pointer Input", docs: "apps/sketch2d", load: () => import("./pages/pointer-2d") },
    { slug: "panel-tabs", label: "Panel options (side tabs, auto width)", docs: "apps/sketch2d", load: () => import("./pages/panel-tabs") },
    { slug: "axonometric", label: "Axonometric", docs: "apps/sketch2d", load: () => import("./pages/axonometric") },
  ]},
  { name: "BIM", pages: [
    { slug: "timber",   label: "Timber + IFC", docs: "buildings/framing", load: () => import("./pages/timber") },
    { slug: "framed-wall", label: "Framed Wall (modes, cut, views)", docs: "buildings/framing", load: () => import("./pages/framed-wall") },
    { slug: "framed-floor", label: "Framed Floor (stair + well, IFC)", docs: "buildings/stairs", load: () => import("./pages/framed-floor") },
    { slug: "house", label: "House (building as data)", docs: "buildings/house", load: () => import("./pages/house") },
    { slug: "roofs", label: "Roofs (flat, shed, gable, hip)", docs: "buildings/roofs", load: () => import("./pages/roofs") },
    { slug: "custom-viewer", label: "Custom Viewer (your own UI)", load: () => import("./pages/custom-viewer") },
    { slug: "dxf-test", label: "DXF Test",     docs: "io/dxf", load: () => import("./pages/dxf-test") },
    { slug: "dxf-3d",   label: "DXF 3D Writer", docs: "io/dxf", load: () => import("./pages/dxf-3d") },
  ]},
  // the apps of the lecture script, in its six parts
  { name: "Lecture · Computational design", pages: [
    lecture("house", "Parametric house"),
    lecture("subdivision", "Parametric subdivision"),
    lecture("grammar", "Shape grammar house"),
    lecture("lsystem", "L-system"),
  ]},
  { name: "Lecture · Optimisation", pages: [
    lecture("landscape", "Fitness landscape"),
    lecture("pareto", "Pareto front"),
    lecture("biomorph", "Biomorphs"),
  ]},
  { name: "Lecture · Analysis and simulation", pages: [
    lecture("chain", "Hanging chain"),
    lecture("soft", "Soft bodies: air cushions"),
    lecture("rigid", "Rigid bodies: a timber pile"),
    lecture("boids", "Boids"),
    lecture("walking", "Walking: distance, path, crowd"),
    lecture("isovist", "Isovist and visibility"),
  ]},
  { name: "Lecture · Machine learning", pages: [
    lecture("teach", "Teach the machine"),
    lecture("playground", "Neural network playground"),
    lecture("latent", "Latent space of sketches"),
    lecture("textgen", "Next word: a tiny language model"),
    lecture("diffusion", "Diffusion: from noise to form"),
  ]},
  { name: "Lecture · Visualisation", pages: [
    lecture("camera", "Camera: lens, exposure, focus"),
    lecture("light", "Light and shadow"),
    lecture("cornell", "Cornell box"),
    lecture("translucency", "Light inside stone"),
  ]},
  { name: "Lecture · Digital fabrication", pages: [
    lecture("slicing", "3D printing: slicing"),
    lecture("milling", "CNC milling"),
    lecture("hotwire", "Hot-wire cutting"),
    lecture("bricks", "Brick bonds"),
    lecture("woodfloor", "Timber floor"),
    lecture("marble", "Marble: bookmatching"),
  ]},
];

const PAGES = new Map(GROUPS.flatMap(g => g.pages.map(p => [p.slug, p] as const)));

// ─── State ──────────────────────────────────────────────────────────

// A page is a 3D Sketch, a 2D Sketch2D, or an app of its own. `as3D()` returns the
// current page only when it is a 3D SketchInstance.
let currentSketch: MountedPage | null = null;
function as3D(): SketchInstance | null {
  return currentSketch instanceof SketchInstance ? currentSketch : null;
}
let currentPage = "";

// ─── DOM refs ───────────────────────────────────────────────────────

const app             = document.getElementById("app") as HTMLDivElement;
const pageChooser     = document.getElementById("page-chooser") as HTMLSelectElement;
const docsLink        = document.getElementById("docs-link") as HTMLAnchorElement;
const sourceLink      = document.getElementById("source-link") as HTMLAnchorElement;

// Tag the container so sketches can detect they're inside a shell and
// suppress their internal header (see SketchConfig.showHeader).
app.dataset.shell = "testbench";

// ─── Docs and Source links ──────────────────────────────────────────

const REPO = "https://github.com/dbt-ethz/tekto/blob/main";
// Built into the docs site (docs:build puts the playground at <docs>/play/), the docs are one
// folder up; from the dev server, the published docs.
const BESIDE_DOCS = /\/play\/(index\.html)?$/.test(location.pathname);
const docsUrl = (path: string) => `${BESIDE_DOCS ? ".." : "https://dbt-ethz.github.io/tekto"}/${path}.html`;

function updateLinks(entry: PageEntry) {
  docsLink.hidden = !entry.docs;
  if (entry.docs) docsLink.href = docsUrl(entry.docs);
  sourceLink.href = `${REPO}/playground/pages/${entry.source ?? entry.slug}.ts`;
}

if (new URLSearchParams(location.search).has("embed")) document.body.classList.add("embed");

// ─── Page chooser ───────────────────────────────────────────────────

for (const g of GROUPS) {
  const og = document.createElement("optgroup");
  og.label = g.name;
  for (const p of g.pages) {
    const opt = document.createElement("option");
    opt.value = p.slug;
    opt.textContent = p.label;
    og.appendChild(opt);
  }
  pageChooser.appendChild(og);
}
pageChooser.addEventListener("change", () => {
  const slug = pageChooser.value;
  history.pushState(null, "", `?page=${slug}`);
  loadPage(slug);
});

// ─── Page loading ───────────────────────────────────────────────────

async function loadPage(slug: string) {
  if (slug === currentPage) return;
  const entry = PAGES.get(slug);
  if (!entry) { console.warn(`Unknown page: ${slug}`); return; }

  // Drop subscriptions from the previous sketch (if any).

  if (currentSketch) {
    currentSketch.dispose();
    currentSketch = null;
  }
  app.innerHTML = "";

  currentPage = slug;
  pageChooser.value = slug;
  updateLinks(entry);

  try {
    const mod = await entry.load();
    if (currentPage !== slug) return; // user already navigated away
    currentSketch = mod.default(app);
    document.body.classList.toggle("own-bar", !as3D()); // a 2D or appShell page: nothing of the shell's bar applies
  } catch (e) {
    console.error(`Failed to load page "${slug}":`, e);
    app.innerHTML = `<div style="color:#ff6b6b;padding:40px;font-family:monospace">
      Failed to load page "${slug}".<br>${e}
    </div>`;
  }
}

// ─── Init ───────────────────────────────────────────────────────────

function getPageFromURL(): string {
  const params = new URLSearchParams(location.search);
  return params.get("page") || "primitives";
}
window.addEventListener("popstate", () => loadPage(getPageFromURL()));

loadPage(getPageFromURL());
