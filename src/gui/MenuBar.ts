/**
 * MenuBar — the app's menus (File, Edit, View, and the app's own), drawn from its commands.
 *
 * An app does not build menus: it declares commands (`Commands`), each naming its menu in
 * `group`, and the bar lists them: label on the left, keys on the right, greyed while it
 * cannot run. File, Edit and View come first, the app's own groups after, in the order they
 * were first declared. A menu's items are in declaration order, with a rule wherever the
 * family of the id changes (`file.export.obj` after `file.save`).
 *
 *   app.commands.add({ id: "file.save", label: "Save JSON", keys: "Mod+S", group: "File", run: save });
 *   app.commands.add({ id: "site.addBlock", label: "Add block", group: "Site", run: addBlock });
 */
import { getTheme, type Theme } from "./theme";
import { formatKeys, type CommandInfo, type Commands } from "./Commands";

/** The menus every app has, in this order, before the app's own. */
const STANDARD = ["File", "Edit", "View"];

/** Options for `menuBar(commands, …)`: the theme its colours come from (default: dark). */
export interface MenuBarOptions {
  theme?: Theme;
}

/** The menu a command belongs to: its `group`, else its id's first part ("edit.undo" → "Edit"). */
function menuOf(c: CommandInfo): string {
  if (c.group) return c.group;
  const head = c.id.includes(".") ? c.id.slice(0, c.id.indexOf(".")) : "tools";
  return head.charAt(0).toUpperCase() + head.slice(1);
}

/** What separates items of a menu: the id up to its last dot ("file.export" for "file.export.obj"). */
const familyOf = (id: string): string => (id.split(".").length > 2 ? id.slice(0, id.lastIndexOf(".")) : "");

/**
 * The menu bar of an app, from its commands. Mount `el` in a title bar; it follows commands
 * added and removed later. `dispose()` unhooks it.
 */
export function menuBar(commands: Commands, opts: MenuBarOptions = {}): { el: HTMLElement; dispose(): void } {
  const t = opts.theme ?? getTheme();
  const el = document.createElement("nav");
  el.dataset.tektoMenubar = "";
  el.setAttribute("aria-label", "Menus");
  el.style.cssText = `display:flex;align-items:center;gap:2px;font:12px ${t.font};user-select:none;`;

  let open: { name: string; list: HTMLElement; btn: HTMLElement } | null = null;
  let signature = "";

  const close = () => {
    if (!open) return;
    open.list.remove();
    open.btn.style.background = "transparent";
    open.btn.style.color = t.textDim;
    open.btn.setAttribute("aria-expanded", "false");
    open = null;
  };

  const show = (name: string, btn: HTMLElement) => {
    close();
    const list = document.createElement("div");
    list.setAttribute("role", "menu");
    list.dataset.tektoMenu = name;
    list.style.cssText = `position:fixed;z-index:100000;min-width:200px;max-height:70vh;overflow-y:auto;padding:4px;
      background:${t.popupBg};border:1px solid ${t.controlBorder};border-radius:6px;
      box-shadow:0 6px 22px rgba(0,0,0,${t.isDark ? ".45" : ".16"});font:12px ${t.font};color:${t.text};`;
    let family: string | null = null;
    for (const c of commands.list()) {
      if (menuOf(c) !== name) continue;
      const fam = familyOf(c.id);
      if (family !== null && fam !== family) {
        const rule = document.createElement("div");
        rule.style.cssText = `height:1px;margin:4px 2px;background:${t.border};`;
        list.appendChild(rule);
      }
      family = fam;
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.dataset.command = c.id;
      item.setAttribute("aria-label", c.label);       // the keys are told apart, not read as part of the name
      item.disabled = !c.enabled;
      item.style.cssText = `display:flex;width:100%;align-items:center;gap:24px;padding:6px 10px;border:0;border-radius:4px;
        background:transparent;color:${c.enabled ? t.text : t.textFaint};opacity:${c.enabled ? 1 : 0.55};
        font:inherit;text-align:left;cursor:${c.enabled ? "pointer" : "default"};`;
      const label = document.createElement("span");
      label.style.cssText = "flex:1;white-space:nowrap;";
      label.textContent = c.label;
      item.appendChild(label);
      if (c.keys.length) {
        const keys = document.createElement("span");
        keys.style.cssText = `color:${t.textFaint};font-size:11px;white-space:nowrap;`;
        keys.textContent = formatKeys(c.keys[0]);
        item.setAttribute("aria-keyshortcuts", c.keys[0]);
        item.appendChild(keys);
      }
      if (c.enabled) {
        item.addEventListener("mouseenter", () => { item.style.background = t.hoverBg; });
        item.addEventListener("mouseleave", () => { item.style.background = "transparent"; });
        item.addEventListener("click", () => {
          close();
          void commands.run(c.id).catch((err) => console.error(`command ${c.id}:`, err));
        });
      }
      list.appendChild(item);
    }
    document.body.appendChild(list);
    const r = btn.getBoundingClientRect();
    list.style.top = `${r.bottom + 2}px`;
    list.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - list.offsetWidth - 4))}px`;
    btn.style.background = t.hoverBg;
    btn.style.color = t.accent;
    btn.setAttribute("aria-expanded", "true");
    open = { name, list, btn };
  };

  const render = () => {
    const list = commands.list();
    const names: string[] = [];
    for (const c of list) { const m = menuOf(c); if (!names.includes(m)) names.push(m); }
    names.sort((a, b) => {
      const ia = STANDARD.indexOf(a), ib = STANDARD.indexOf(b);
      return (ia < 0 ? STANDARD.length : ia) - (ib < 0 ? STANDARD.length : ib);   // stable: the app's own keep their order
    });
    const sig = names.join("|");
    if (sig === signature) return;        // the items are read when a menu opens
    signature = sig;
    close();
    el.replaceChildren();
    for (const name of names) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = name;
      btn.dataset.menu = name;
      btn.setAttribute("aria-haspopup", "menu");
      btn.setAttribute("aria-expanded", "false");
      btn.style.cssText = `padding:4px 9px;border:0;border-radius:4px;background:transparent;color:${t.textDim};font:inherit;cursor:pointer;`;
      btn.addEventListener("click", (e) => { e.stopPropagation(); if (open?.name === name) close(); else show(name, btn); });
      btn.addEventListener("mouseenter", () => { if (open && open.name !== name) show(name, btn); });   // slide along the bar
      el.appendChild(btn);
    }
  };

  // A sketch re-declares its commands on every run: redraw once per frame, not once per command.
  let pending = 0;
  const off = commands.onChange(() => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; render(); }); });
  const onDoc = (e: Event) => { if (open && !open.list.contains(e.target as Node)) close(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  document.addEventListener("click", onDoc);
  document.addEventListener("keydown", onKey);
  render();

  return {
    el,
    dispose() {
      off();
      if (pending) cancelAnimationFrame(pending);
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
      close();
      el.remove();
    },
  };
}

/**
 * Where a harness mounts its menu bar: its own title bar, or, inside a shell with a bar of
 * its own (the playground), the shell's slot — any element marked `data-tekto-menu-slot`.
 * Null: the app shows no menu bar (its commands still run from their keys).
 */
export function menuSlot(own: HTMLElement | null): HTMLElement | null {
  return own ?? document.querySelector<HTMLElement>("[data-tekto-menu-slot]");
}
