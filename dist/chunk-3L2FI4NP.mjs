import {
  DASH_PATTERNS,
  ParamStore,
  boundsOf,
  createRandom,
  noise,
  pickPrim
} from "./chunk-MPAWQFRS.mjs";
import {
  getTheme,
  installAgentBridge,
  plainBundle
} from "./chunk-BXIU5T7I.mjs";
import {
  MathUtils,
  Vec2
} from "./chunk-K6X6LVYU.mjs";

// src/gui/ControlPanel.ts
var DEFAULT_GROUP = "Parameters";
var LABEL_MIN = 56;
var LABEL_MAX = 170;
var CONTROL_MIN = 150;
var CONTROL_MAX = 220;
var SECTION_PAD = 14;
var SLIDER_STYLE_ID = "tekto-slider-style";
function ensureSliderStyle(doc) {
  if (doc.getElementById(SLIDER_STYLE_ID)) return;
  const el = doc.createElement("style");
  el.id = SLIDER_STYLE_ID;
  el.textContent = `
    .tekto-slider{-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer;height:16px;outline:none;padding:0;}
    .tekto-slider::-webkit-slider-runnable-track{height:4px;background:var(--tekto-track,#444444);}
    .tekto-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:7px;height:14px;margin-top:-5px;border-radius:0;background:var(--tekto-thumb,#ffffff);}
    .tekto-slider::-moz-range-track{height:4px;background:var(--tekto-track,#444444);}
    .tekto-slider::-moz-range-thumb{width:7px;height:14px;border-radius:0;border:none;background:var(--tekto-thumb,#ffffff);}
  `;
  doc.head.appendChild(el);
}
function labelFromKey(key) {
  const words = key.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
var ControlPanel = class {
  constructor(cfg) {
    this.collapsedGroups = /* @__PURE__ */ new Set();
    this.activeTab = "";
    this.activeMenu = "";
    // Rebuilt on each render — current structure + live-DOM value updaters
    this.items = [];
    this.customRows = [];
    this.extraTabs = [];
    this.updaters = /* @__PURE__ */ new Map();
    // ── Width ──
    this.measureCtx = null;
    this.labelWidth = LABEL_MIN;
    this.railWidth = 0;
    this.cfg = cfg;
    this.store = cfg.store;
    this.theme = cfg.theme ?? getTheme();
    this.el = document.createElement("div");
    this.footer = document.createElement("div");
    ensureSliderStyle(document);
    this.unsubStore = this.store.onChange((key, value) => {
      this.updaters.get(key)?.(value);
    });
    this.docClick = () => this.closeMenus();
    document.addEventListener("click", this.docClick);
    document.fonts?.ready.then(() => {
      if (this.items.length) {
        this.fitLabels();
        this.cfg.onRender?.();
      }
    });
  }
  dispose() {
    this.unsubStore();
    document.removeEventListener("click", this.docClick);
    this.el.innerHTML = "";
  }
  /** Rebuild the panel DOM for a new control structure. */
  render(items, customRows = [], extraTabs = []) {
    this.items = items;
    this.customRows = customRows;
    this.extraTabs = extraTabs;
    this.updaters.clear();
    this.el.innerHTML = "";
    this.railWidth = 0;
    const t = this.theme;
    const buttons = this.cfg.getButtons?.() ?? [];
    const menuNames = [];
    for (const it of items) if (it.menu && !menuNames.includes(it.menu)) menuNames.push(it.menu);
    for (const b of buttons) if (b.menu && !menuNames.includes(b.menu)) menuNames.push(b.menu);
    if (menuNames.length > 0) this.el.appendChild(this.buildMenuBar(menuNames, items, buttons));
    const tabOrder = [];
    for (const it of items) if (it.tab && !tabOrder.includes(it.tab)) tabOrder.push(it.tab);
    for (const b of buttons) if (b.tab && !tabOrder.includes(b.tab)) tabOrder.push(b.tab);
    for (const r of customRows) if (r.tab && !tabOrder.includes(r.tab)) tabOrder.push(r.tab);
    for (const et of extraTabs) if (!tabOrder.includes(et.name)) tabOrder.push(et.name);
    const hasTabs = tabOrder.length > 1;
    if (hasTabs && (!this.activeTab || !tabOrder.includes(this.activeTab))) {
      this.activeTab = tabOrder[0];
    }
    const pinnedItems = hasTabs ? items.filter((it) => !it.tab && !it.menu) : [];
    const pinnedButtons = hasTabs ? buttons.filter((b) => !b.tab && !b.menu) : [];
    if (pinnedItems.length || pinnedButtons.length) {
      const strip = document.createElement("div");
      strip.style.cssText = `padding:4px 8px 2px 8px;border-bottom:1px solid ${t.border};`;
      for (const it of pinnedItems) {
        const row = this.buildControl(it);
        if (row) strip.appendChild(row);
      }
      for (const b of pinnedButtons) strip.appendChild(this.buildButtonRow(b));
      this.el.appendChild(strip);
    }
    const side = hasTabs && this.cfg.tabs === "side";
    let body = this.el;
    this.el.style.display = side ? "flex" : "";
    this.el.style.flexDirection = side ? "column" : "";
    this.el.style.minHeight = side ? "100%" : "";
    if (side) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:stretch;flex:1;";
      body = document.createElement("div");
      body.style.cssText = "flex:1;min-width:0;";
      row.append(this.buildTabList(tabOrder, items, buttons), body);
      this.el.appendChild(row);
    } else if (hasTabs) this.el.appendChild(this.buildTabBar(tabOrder));
    const activeExtra = hasTabs ? this.extraTabs.find((et) => et.name === this.activeTab) : void 0;
    const inTab = (tab, menu) => !menu && (hasTabs ? !!tab && tab === this.activeTab : true);
    const groups = /* @__PURE__ */ new Map();
    const groupOf = (name) => {
      const g = name || DEFAULT_GROUP;
      if (!groups.has(g)) groups.set(g, { items: [], buttons: [], rows: [] });
      return groups.get(g);
    };
    for (const it of items) if (inTab(it.tab, it.menu)) groupOf(it.group).items.push(it);
    for (const b of buttons) if (inTab(b.tab, b.menu)) groupOf(b.group).buttons.push(b);
    for (const r of customRows) if (inTab(r.tab)) groupOf(r.group).rows.push(r);
    const bare = groups.size === 1 && groups.has(DEFAULT_GROUP);
    for (const [name, content] of groups) {
      body.appendChild(this.buildSection(name, content, bare));
    }
    if (activeExtra) {
      const host = document.createElement("div");
      activeExtra.render(host);
      body.appendChild(host);
    }
    body.appendChild(this.footer);
    this.fitLabels();
    this.cfg.onRender?.();
  }
  /** The width of `text` in the panel's font at `px`, in CSS pixels. */
  textWidth(text, px) {
    this.measureCtx ?? (this.measureCtx = document.createElement("canvas").getContext("2d"));
    if (!this.measureCtx) return text.length * px * 0.6;
    this.measureCtx.font = `${px}px ${this.theme.font}`;
    return this.measureCtx.measureText(text).width;
  }
  /** Size the label column to the longest label of any tab (between LABEL_MIN and LABEL_MAX; longer ones wrap). */
  fitLabels() {
    let w = LABEL_MIN;
    for (const it of this.items) {
      const def = this.store.getDef(it.key);
      if (!def || it.menu || def.type === "button") continue;
      w = Math.max(w, Math.ceil(this.textWidth(def.label ?? labelFromKey(it.key), 11)) + 2);
    }
    this.labelWidth = Math.min(w, LABEL_MAX);
    this.el.style.setProperty("--tekto-label-w", `${this.labelWidth}px`);
  }
  /**
   * The panel width its controls ask for, in px: the label column, a control beside it
   * (wider for a select with long options), a button's text, and the tab list when the tabs
   * are on the side. A frame with `panelWidth: "auto"` asks after every render.
   */
  preferredWidth() {
    let control = CONTROL_MIN;
    let lone = 0;
    for (const it of this.items) {
      const def = this.store.getDef(it.key);
      if (def?.type === "select") {
        for (const opt of def.options ?? []) control = Math.max(control, this.textWidth(String(opt), 11) + 36);
      } else if (def?.type === "button") {
        lone = Math.max(lone, this.textWidth(def.label ?? it.key, 10) + 24);
      }
    }
    for (const b of this.cfg.getButtons?.() ?? []) if (!b.menu) lone = Math.max(lone, this.textWidth(b.label, 10) + 24);
    const row = this.labelWidth + 8 + Math.min(control, CONTROL_MAX);
    return Math.ceil(this.railWidth + 2 * SECTION_PAD + Math.max(row, lone)) + 1;
  }
  /** Push a value into a live control without going through the store. */
  applyValue(key, value) {
    this.updaters.get(key)?.(value);
  }
  closeMenus() {
    this.activeMenu = "";
    this.el.querySelectorAll("[data-menu-dropdown]").forEach((d) => {
      d.style.display = "none";
    });
    this.el.querySelectorAll("[data-menu-btn]").forEach((b) => {
      b.style.color = this.theme.textFaint;
    });
  }
  // ── Menu bar ──
  buildMenuBar(menuNames, items, buttons) {
    const t = this.theme;
    const bar = document.createElement("div");
    bar.style.cssText = `display:flex;border-bottom:1px solid ${t.border};flex-shrink:0;position:relative;`;
    for (const menuName of menuNames) {
      const btn = document.createElement("button");
      btn.dataset.menuBtn = menuName;
      btn.textContent = menuName + " \u25BE";
      btn.style.cssText = `
        padding:8px 10px;border:none;background:transparent;
        color:${t.textFaint};font-family:inherit;font-size:9px;font-weight:500;
        text-transform:uppercase;letter-spacing:1.2px;cursor:pointer;transition:color .12s;
      `;
      btn.addEventListener("mouseenter", () => {
        btn.style.color = t.accent;
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.color = this.activeMenu === menuName ? t.accent : t.textFaint;
      });
      const dropdown = document.createElement("div");
      dropdown.dataset.menuDropdown = menuName;
      dropdown.style.cssText = `
        display:none;position:fixed;z-index:1000;overflow-y:auto;
        min-width:160px;background:${t.popupBg};
        border:1px solid ${t.border};border-radius:4px;padding:4px 0;
        box-shadow:0 4px 16px rgba(0,0,0,.4);
      `;
      const menuItems = items.filter((it) => it.menu === menuName);
      const menuButtons = buttons.filter((b) => b.menu === menuName);
      for (const it of menuItems) {
        const def = this.store.getDef(it.key);
        if (!def) continue;
        if (def.type === "select") {
          const opts = def.options ?? [];
          const rows = [];
          for (const opt of opts) {
            const row2 = document.createElement("div");
            row2.style.cssText = `display:flex;align-items:center;gap:8px;padding:7px 12px;cursor:pointer;font-size:11px;color:${t.textDim};transition:background .1s;`;
            const check2 = document.createElement("span");
            check2.style.cssText = `width:12px;text-align:center;color:${t.accent};font-size:10px;`;
            check2.textContent = this.store.get(it.key) === opt ? "\u2713" : " ";
            const lbl2 = document.createElement("span");
            lbl2.textContent = opt;
            row2.append(check2, lbl2);
            row2.addEventListener("mouseenter", () => {
              row2.style.background = t.hoverBg;
            });
            row2.addEventListener("mouseleave", () => {
              row2.style.background = "transparent";
            });
            row2.addEventListener("click", (e) => {
              e.stopPropagation();
              this.store.set(it.key, opt);
              for (const r of rows) r.check.textContent = r.opt === opt ? "\u2713" : " ";
              this.cfg.onCommit?.(it.key);
            });
            rows.push({ opt, check: check2 });
            dropdown.appendChild(row2);
          }
          this.updaters.set(it.key, (v) => {
            for (const r of rows) r.check.textContent = r.opt === v ? "\u2713" : " ";
          });
          continue;
        }
        if (def.type !== "bool") continue;
        const row = document.createElement("div");
        row.style.cssText = `
          display:flex;align-items:center;gap:8px;padding:7px 12px;cursor:pointer;
          font-size:11px;color:${t.textDim};transition:background .1s;
        `;
        const check = document.createElement("span");
        check.style.cssText = `width:12px;text-align:center;color:${t.accent};font-size:10px;`;
        check.textContent = this.store.get(it.key) ? "\u2713" : " ";
        const lbl = document.createElement("span");
        lbl.textContent = def.label ?? it.key;
        row.append(check, lbl);
        row.addEventListener("mouseenter", () => {
          row.style.background = t.hoverBg;
        });
        row.addEventListener("mouseleave", () => {
          row.style.background = "transparent";
        });
        row.addEventListener("click", (e) => {
          e.stopPropagation();
          this.store.set(it.key, !this.store.get(it.key));
          this.cfg.onCommit?.(it.key);
        });
        this.updaters.set(it.key, (v) => {
          check.textContent = v ? "\u2713" : " ";
        });
        dropdown.appendChild(row);
      }
      if (menuItems.length > 0 && menuButtons.length > 0) {
        const sep = document.createElement("div");
        sep.style.cssText = `border-top:1px solid ${t.border};margin:4px 0;`;
        dropdown.appendChild(sep);
      }
      for (const b of menuButtons) {
        const row = document.createElement("div");
        row.style.cssText = `padding:7px 12px;cursor:pointer;font-size:11px;color:${t.textDim};transition:background .1s;`;
        row.textContent = b.label;
        row.addEventListener("mouseenter", () => {
          row.style.background = t.hoverBg;
          row.style.color = t.accent;
        });
        row.addEventListener("mouseleave", () => {
          row.style.background = "transparent";
          row.style.color = t.textDim;
        });
        const btnLabel = b.label, btnMenu = b.menu, btnGroup = b.group;
        row.addEventListener("click", () => {
          this.closeMenus();
          const current = (this.cfg.getButtons?.() ?? []).find((cb) => cb.label === btnLabel && cb.menu === btnMenu && cb.group === btnGroup);
          current?.action();
          if (!current?.display) this.cfg.onAction?.();
        });
        dropdown.appendChild(row);
      }
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = this.activeMenu === menuName;
        this.closeMenus();
        if (!isOpen) {
          this.activeMenu = menuName;
          const r = btn.getBoundingClientRect();
          dropdown.style.display = "block";
          dropdown.style.top = `${r.bottom}px`;
          dropdown.style.maxHeight = `${Math.max(120, window.innerHeight - r.bottom - 8)}px`;
          dropdown.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - dropdown.offsetWidth - 4))}px`;
          btn.style.color = t.accent;
        }
      });
      const holder = document.createElement("div");
      holder.style.cssText = `position:relative;display:inline-block;`;
      holder.appendChild(btn);
      holder.appendChild(dropdown);
      bar.appendChild(holder);
    }
    return bar;
  }
  // ── Tab bar ──
  /** The currently active tab name ("" when the panel has no tabs). */
  getActiveTab() {
    return this.activeTab;
  }
  buildTabBar(tabOrder) {
    const t = this.theme;
    const bar = document.createElement("div");
    bar.style.cssText = `display:flex;border-bottom:1px solid ${t.border};flex-shrink:0;`;
    for (const tab of tabOrder) {
      const btn = document.createElement("button");
      btn.textContent = tab;
      const isActive = tab === this.activeTab;
      btn.style.cssText = `
        flex:1;padding:9px 4px;border:none;
        border-bottom:2px solid ${isActive ? t.accent : "transparent"};
        background:transparent;color:${isActive ? t.accent : t.textFaint};
        font-family:inherit;font-size:9px;font-weight:500;text-transform:uppercase;
        letter-spacing:1.2px;cursor:pointer;transition:all .12s;
      `;
      btn.addEventListener("click", () => {
        this.activeTab = tab;
        this.render(this.items, this.customRows, this.extraTabs);
        this.cfg.onTabChange?.(tab);
      });
      bar.appendChild(btn);
    }
    return bar;
  }
  /** The tabs as a list down the panel's left side: a name, and how many controls it holds. */
  buildTabList(tabOrder, items, buttons) {
    const t = this.theme;
    const list = document.createElement("nav");
    list.dataset.tektoTabs = "side";
    let w = 0;
    for (const tab of tabOrder) w = Math.max(w, this.textWidth(tab, 11));
    this.railWidth = Math.min(Math.max(Math.ceil(w) + 26, 72), 160);
    list.style.cssText = `flex:0 0 ${this.railWidth}px;box-sizing:border-box;padding:6px 0;border-right:1px solid ${t.border};`;
    for (const tab of tabOrder) {
      const on = tab === this.activeTab;
      const n = items.filter((it) => it.tab === tab).length + buttons.filter((b) => b.tab === tab).length;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("aria-pressed", String(on));
      btn.style.cssText = `
        display:block;width:100%;box-sizing:border-box;padding:7px 10px 7px 12px;border:none;
        border-left:2px solid ${on ? t.accent : "transparent"};text-align:left;cursor:pointer;
        background:${on ? t.hoverBg : "transparent"};color:${on ? t.accent : t.textDim};
        font-family:inherit;font-size:11px;line-height:1.3;transition:background .12s;
      `;
      const name = document.createElement("span");
      name.style.cssText = `display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:${on ? 600 : 400};`;
      name.textContent = tab;
      btn.appendChild(name);
      if (n > 0) {
        const count = document.createElement("span");
        count.style.cssText = `display:block;font-size:9px;color:${t.textFaint};`;
        count.textContent = `${n} control${n === 1 ? "" : "s"}`;
        btn.appendChild(count);
      }
      if (!on) {
        btn.addEventListener("mouseenter", () => {
          btn.style.background = t.hoverBg;
        });
        btn.addEventListener("mouseleave", () => {
          btn.style.background = "transparent";
        });
      }
      btn.addEventListener("click", () => {
        this.activeTab = tab;
        this.render(this.items, this.customRows, this.extraTabs);
        this.cfg.onTabChange?.(tab);
      });
      list.appendChild(btn);
    }
    return list;
  }
  // ── Sections ──
  buildSection(name, content, bare = false) {
    const t = this.theme;
    const section = document.createElement("div");
    section.style.cssText = `border-bottom:1px solid ${t.border};`;
    const collapsed = !bare && this.collapsedGroups.has(name);
    const header = document.createElement("div");
    header.style.cssText = `
      padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:6px;
      user-select:none;transition:background .1s;
    `;
    header.addEventListener("mouseenter", () => {
      header.style.background = t.hoverBg;
    });
    header.addEventListener("mouseleave", () => {
      header.style.background = "transparent";
    });
    const arrow = document.createElement("span");
    arrow.style.cssText = `font-size:8px;color:${t.textFaint};transition:transform .15s;width:10px;`;
    const paintArrow = (c) => {
      arrow.textContent = c ? "\u25B6" : "\u25BC";
      if (t.plain) arrow.style.display = c ? "" : "none";
    };
    paintArrow(collapsed);
    header.appendChild(arrow);
    const title = document.createElement("span");
    title.style.cssText = `font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:1.8px;color:${t.textFaint};`;
    title.textContent = name;
    header.appendChild(title);
    if (!bare) section.appendChild(header);
    const body = document.createElement("div");
    body.style.cssText = `padding:${bare ? 10 : 0}px ${SECTION_PAD}px 10px;${collapsed ? "display:none;" : ""}`;
    for (const it of content.items) {
      const row = this.buildControl(it);
      if (row) body.appendChild(row);
    }
    for (const r of content.rows) {
      if (r.fullBleed) {
        const wrap = document.createElement("div");
        wrap.style.cssText = `margin:0 -${SECTION_PAD}px;`;
        wrap.appendChild(r.el);
        body.appendChild(wrap);
      } else {
        body.appendChild(r.el);
      }
    }
    for (const b of content.buttons) {
      body.appendChild(this.buildButtonRow(b));
    }
    section.appendChild(body);
    header.addEventListener("click", () => {
      const isCollapsed = this.collapsedGroups.has(name);
      if (isCollapsed) this.collapsedGroups.delete(name);
      else this.collapsedGroups.add(name);
      body.style.display = isCollapsed ? "" : "none";
      paintArrow(!isCollapsed);
    });
    return section;
  }
  // ── Individual controls ──
  buildButtonRow(b) {
    const t = this.theme;
    const row = document.createElement("div");
    row.style.cssText = "margin-bottom:4px;";
    const btn = document.createElement("button");
    btn.textContent = b.label;
    btn.style.cssText = `
      width:100%;padding:7px 10px;border:1px solid ${t.border};border-radius:5px;
      background:transparent;color:${t.textDim};font-family:inherit;font-size:10px;
      cursor:pointer;transition:all .12s;
    `;
    btn.addEventListener("mouseenter", () => {
      btn.style.background = t.hoverBg;
      btn.style.borderColor = t.accent;
      btn.style.color = t.accent;
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "transparent";
      btn.style.borderColor = t.border;
      btn.style.color = t.textDim;
    });
    const label = b.label, group = b.group, menu = b.menu;
    btn.addEventListener("click", () => {
      const current = (this.cfg.getButtons?.() ?? []).find((cb) => cb.label === label && cb.group === group && cb.menu === menu) ?? b;
      current.action();
      if (!current.display) this.cfg.onAction?.();
    });
    row.appendChild(btn);
    return row;
  }
  buildControl(it) {
    const def = this.store.getDef(it.key);
    if (!def) return null;
    const t = this.theme;
    if (def.type === "button") {
      return this.buildButtonRow({ label: def.label ?? it.key, action: def.action, group: it.group });
    }
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:5px;min-height:26px;";
    const label = document.createElement("span");
    label.style.cssText = `width:var(--tekto-label-w,80px);flex-shrink:0;font-size:11px;color:${t.textDim};`;
    label.textContent = def.label ?? labelFromKey(it.key);
    row.appendChild(label);
    switch (def.type) {
      case "float":
      case "int": {
        const step = def.step ?? (def.type === "int" ? 1 : (def.max - def.min) / 100);
        const input = document.createElement("input");
        input.type = "range";
        input.min = String(def.min);
        input.max = String(def.max);
        input.step = String(step);
        input.value = String(this.store.get(it.key));
        input.className = "tekto-slider";
        input.style.cssText = `flex:1;width:0;min-width:40px;--tekto-track:${t.controlBorder};--tekto-thumb:${it.accent || t.accent};`;
        const valueSpan = document.createElement("span");
        valueSpan.style.cssText = `width:42px;text-align:right;font-size:10px;color:${t.accent};`;
        const isInt = def.type === "int" || step >= 1;
        const rawDec = isInt ? 0 : Math.max(2, -Math.floor(Math.log10(step) - 1e-3));
        const decimals = Math.min(Math.max(0, rawDec), 20);
        const fmt = (v) => isInt ? String(Math.round(v)) : Number(v).toFixed(decimals);
        valueSpan.textContent = fmt(this.store.get(it.key));
        input.addEventListener("input", () => {
          this.store.set(it.key, parseFloat(input.value));
        });
        input.addEventListener("change", () => this.cfg.onCommit?.(it.key));
        this.updaters.set(it.key, (v) => {
          input.value = String(v);
          valueSpan.textContent = fmt(v);
        });
        row.append(input, valueSpan);
        break;
      }
      case "bool": {
        const wrap = document.createElement("label");
        wrap.style.cssText = "position:relative;width:32px;height:18px;cursor:pointer;flex-shrink:0;";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !!this.store.get(it.key);
        input.style.cssText = "position:absolute;opacity:0;width:0;height:0;";
        const track = document.createElement("span");
        const knob = document.createElement("span");
        const paint = (on) => {
          track.style.cssText = `position:absolute;inset:0;border-radius:9px;transition:.2s;background:${on ? t.accent : t.controlBorder};`;
          knob.style.cssText = `position:absolute;left:${on ? "16px" : "2px"};top:2px;width:14px;height:14px;border-radius:50%;background:${on ? t.panelBg : "#ffffff"};transition:.2s;`;
        };
        paint(input.checked);
        track.appendChild(knob);
        wrap.append(input, track);
        input.addEventListener("change", () => {
          paint(input.checked);
          this.store.set(it.key, input.checked);
          this.cfg.onCommit?.(it.key);
        });
        this.updaters.set(it.key, (v) => {
          input.checked = !!v;
          paint(!!v);
        });
        row.appendChild(wrap);
        break;
      }
      case "select": {
        const select = document.createElement("select");
        select.style.cssText = `
          flex:1;padding:4px 8px;background:${t.fieldBg};
          border:1px solid ${t.controlBorder};border-radius:4px;color:inherit;
          font-family:inherit;font-size:11px;outline:none;cursor:pointer;
        `;
        for (const opt of def.options) {
          const el = document.createElement("option");
          el.value = opt;
          el.textContent = opt;
          if (opt === this.store.get(it.key)) el.selected = true;
          select.appendChild(el);
        }
        select.addEventListener("change", () => {
          this.store.set(it.key, select.value);
          this.cfg.onCommit?.(it.key);
        });
        this.updaters.set(it.key, (v) => {
          select.value = v;
        });
        row.appendChild(select);
        break;
      }
      case "color": {
        const input = document.createElement("input");
        input.type = "color";
        input.value = this.store.get(it.key);
        input.style.cssText = `width:32px;height:24px;border:1px solid ${t.controlBorder};border-radius:4px;padding:0;cursor:pointer;background:none;`;
        const valueSpan = document.createElement("span");
        valueSpan.style.cssText = `font-size:10px;color:${t.textDim};`;
        valueSpan.textContent = this.store.get(it.key);
        input.addEventListener("input", () => {
          this.store.set(it.key, input.value);
          this.cfg.onCommit?.(it.key);
        });
        this.updaters.set(it.key, (v) => {
          input.value = v;
          valueSpan.textContent = v;
        });
        row.append(input, valueSpan);
        break;
      }
      case "string": {
        const input = document.createElement("input");
        input.type = "text";
        input.value = this.store.get(it.key) ?? "";
        input.placeholder = def.placeholder ?? "";
        input.style.cssText = `
          flex:1;padding:4px 8px;background:${t.fieldBg};
          border:1px solid ${t.controlBorder};border-radius:4px;color:inherit;
          font-family:inherit;font-size:11px;outline:none;
        `;
        input.addEventListener("input", () => {
          this.store.set(it.key, input.value);
        });
        input.addEventListener("change", () => this.cfg.onCommit?.(it.key));
        this.updaters.set(it.key, (v) => {
          if (input !== document.activeElement) input.value = v;
        });
        row.appendChild(input);
        break;
      }
      case "vec3": {
        const inputs = [];
        for (let i = 0; i < 3; i++) {
          const input = document.createElement("input");
          input.type = "number";
          if (def.step != null) input.step = String(def.step);
          input.value = String((this.store.get(it.key) ?? def.default)[i]);
          input.style.cssText = `
            flex:1;width:0;padding:3px 4px;background:${t.fieldBg};
            border:1px solid ${t.controlBorder};border-radius:4px;color:inherit;
            font-family:inherit;font-size:10px;outline:none;
          `;
          input.addEventListener("change", () => {
            const next = inputs.map((el) => Number(el.value));
            this.store.set(it.key, next);
            this.cfg.onCommit?.(it.key);
          });
          inputs.push(input);
          row.appendChild(input);
        }
        this.updaters.set(it.key, (v) => {
          for (let i = 0; i < 3; i++) inputs[i].value = String(v[i]);
        });
        break;
      }
    }
    return row;
  }
};

// src/gui/Commands.ts
var isMacPlatform = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
function keyMatches(binding, e, mac = isMacPlatform()) {
  const parts = binding.split("+").map((s) => s.trim()).filter(Boolean);
  const key = binding.endsWith("++") ? "+" : parts.pop();
  if (!key) return false;
  const want = { meta: false, ctrl: false, alt: false, shift: false };
  for (const m of parts) {
    const k = m.toLowerCase();
    if (k === "mod") mac ? want.meta = true : want.ctrl = true;
    else if (k === "meta" || k === "cmd") want.meta = true;
    else if (k === "ctrl" || k === "control") want.ctrl = true;
    else if (k === "alt" || k === "option") want.alt = true;
    else if (k === "shift") want.shift = true;
  }
  if (e.metaKey !== want.meta || e.ctrlKey !== want.ctrl || e.altKey !== want.alt) return false;
  const letterOrNamed = key.length > 1 || /^[a-z0-9]$/i.test(key);
  if (letterOrNamed && e.shiftKey !== want.shift) return false;
  return e.key.length === 1 ? e.key.toLowerCase() === key.toLowerCase() : e.key === key;
}
function formatKeys(binding, mac = isMacPlatform()) {
  const parts = binding.split("+").map((s) => s.trim()).filter(Boolean);
  const key = binding.endsWith("++") ? "+" : parts.pop() ?? "";
  const has = (...names) => parts.some((p) => names.includes(p.toLowerCase()));
  const named = mac ? { ArrowUp: "\u2191", ArrowDown: "\u2193", ArrowLeft: "\u2190", ArrowRight: "\u2192", Delete: "\u2326", Backspace: "\u232B", Escape: "\u238B", Enter: "\u21A9" } : { ArrowUp: "\u2191", ArrowDown: "\u2193", ArrowLeft: "\u2190", ArrowRight: "\u2192", Escape: "Esc" };
  const k = named[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  if (mac) {
    return (has("ctrl", "control") ? "\u2303" : "") + (has("alt", "option") ? "\u2325" : "") + (has("shift") ? "\u21E7" : "") + (has("mod", "meta", "cmd") ? "\u2318" : "") + k;
  }
  const mods = [has("mod", "ctrl", "control") && "Ctrl", has("meta", "cmd") && "Win", has("alt", "option") && "Alt", has("shift") && "Shift"].filter(Boolean);
  return [...mods, k].join("+");
}
function typing(target) {
  const el = target;
  if (!el || typeof el.tagName !== "string") return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}
function viewCommands(view) {
  const v = (id, label) => ({ id: `view.${id}`, label, group: "View", run: () => view.setView(id) });
  return [
    { id: "view.fitAll", label: "Frame all", group: "View", run: () => view.fitAll() },
    v("top", "Plan (top)"),
    v("front", "Front"),
    v("right", "Right"),
    v("back", "Back"),
    v("left", "Left"),
    v("iso", "Iso"),
    {
      id: "view.toggleProjection",
      label: "Perspective / orthographic",
      group: "View",
      run: () => view.setProjection(view.projection === "perspective" ? "orthographic" : "perspective")
    },
    ...view.setHiddenLineInverse ? [{
      id: "view.hiddenLineInverse",
      label: "Hidden line: paper / inverse",
      group: "View",
      run: () => view.setHiddenLineInverse(!view.hiddenLineInverse)
    }] : []
  ];
}
var Commands = class {
  constructor() {
    this.byId = /* @__PURE__ */ new Map();
    this.listeners = /* @__PURE__ */ new Set();
  }
  /** Add commands (an id already there is replaced). Returns a function that removes them. */
  add(commands) {
    const list = Array.isArray(commands) ? commands : [commands];
    for (const c of list) {
      if (!c.id || typeof c.run !== "function") throw new Error(`Commands.add: a command needs an id and run(), got ${JSON.stringify(c)}`);
      this.byId.set(c.id, c);
    }
    this.emit();
    return () => {
      for (const c of list) if (this.byId.get(c.id) === c) this.byId.delete(c.id);
      this.emit();
    };
  }
  remove(id) {
    if (this.byId.delete(id)) this.emit();
  }
  get(id) {
    return this.byId.get(id);
  }
  has(id) {
    return this.byId.has(id);
  }
  /** Every command, in the order added, with its keys and whether it can run now. */
  list() {
    return [...this.byId.values()].map((c) => ({
      id: c.id,
      label: c.label,
      group: c.group,
      keys: c.keys === void 0 ? [] : typeof c.keys === "string" ? [c.keys] : [...c.keys],
      enabled: this.canRun(c)
    }));
  }
  /** Run a command by id. False if there is none or it can't run now. */
  async run(id) {
    const c = this.byId.get(id);
    if (!c || !this.canRun(c)) return false;
    await c.run();
    return true;
  }
  /** The command a key event presses, if any (and enabled). */
  match(e, mac) {
    for (const c of this.byId.values()) {
      const keys = c.keys === void 0 ? [] : typeof c.keys === "string" ? [c.keys] : c.keys;
      if (keys.some((k) => keyMatches(k, e, mac)) && this.canRun(c)) return c;
    }
    return void 0;
  }
  /**
   * Run commands from their keys on `target` (default: the window). Keys typed into a
   * field stay with the field; a matched key's default is prevented. Returns the unbind.
   */
  bindKeys(target = window) {
    const onKey = (ev) => {
      const e = ev;
      if (e.defaultPrevented || typing(e.target)) return;
      const c = this.match(e);
      if (!c) return;
      e.preventDefault();
      void Promise.resolve(c.run()).catch((err) => console.error(`command ${c.id}:`, err));
    };
    target.addEventListener("keydown", onKey);
    return () => target.removeEventListener("keydown", onKey);
  }
  /** Hear when commands are added or removed. Returns the unsubscribe. */
  onChange(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  canRun(c) {
    try {
      return c.enabled ? c.enabled() !== false : true;
    } catch {
      return false;
    }
  }
  emit() {
    for (const l of this.listeners) l();
  }
};

// src/gui/MenuBar.ts
var STANDARD = ["File", "Edit", "View"];
function menuOf(c) {
  if (c.group) return c.group;
  const head = c.id.includes(".") ? c.id.slice(0, c.id.indexOf(".")) : "tools";
  return head.charAt(0).toUpperCase() + head.slice(1);
}
var familyOf = (id) => id.split(".").length > 2 ? id.slice(0, id.lastIndexOf(".")) : "";
function menuBar(commands, opts = {}) {
  const t = opts.theme ?? getTheme();
  const el = document.createElement("nav");
  el.dataset.tektoMenubar = "";
  el.setAttribute("aria-label", "Menus");
  el.style.cssText = `display:flex;align-items:center;gap:2px;font:12px ${t.font};user-select:none;`;
  let open = null;
  let signature = "";
  const close = () => {
    if (!open) return;
    open.list.remove();
    open.btn.style.background = "transparent";
    open.btn.style.color = t.textDim;
    open.btn.setAttribute("aria-expanded", "false");
    open = null;
  };
  const show = (name, btn) => {
    close();
    const list = document.createElement("div");
    list.setAttribute("role", "menu");
    list.dataset.tektoMenu = name;
    list.style.cssText = `position:fixed;z-index:100000;min-width:200px;max-height:70vh;overflow-y:auto;padding:4px;
      background:${t.popupBg};border:1px solid ${t.controlBorder};border-radius:6px;
      box-shadow:0 6px 22px rgba(0,0,0,${t.isDark ? ".45" : ".16"});font:12px ${t.font};color:${t.text};`;
    let family = null;
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
      item.setAttribute("aria-label", c.label);
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
        item.addEventListener("mouseenter", () => {
          item.style.background = t.hoverBg;
        });
        item.addEventListener("mouseleave", () => {
          item.style.background = "transparent";
        });
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
    const names = [];
    for (const c of list) {
      const m = menuOf(c);
      if (!names.includes(m)) names.push(m);
    }
    names.sort((a, b) => {
      const ia = STANDARD.indexOf(a), ib = STANDARD.indexOf(b);
      return (ia < 0 ? STANDARD.length : ia) - (ib < 0 ? STANDARD.length : ib);
    });
    const sig = names.join("|");
    if (sig === signature) return;
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
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (open?.name === name) close();
        else show(name, btn);
      });
      btn.addEventListener("mouseenter", () => {
        if (open && open.name !== name) show(name, btn);
      });
      el.appendChild(btn);
    }
  };
  let pending = 0;
  const off = commands.onChange(() => {
    if (!pending) pending = requestAnimationFrame(() => {
      pending = 0;
      render();
    });
  });
  const onDoc = (e) => {
    if (open && !open.list.contains(e.target)) close();
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
  };
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
    }
  };
}
function menuSlot(own) {
  return own ?? document.querySelector("[data-tekto-menu-slot]");
}

// src/gui/ParamHistory.ts
var same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
var ParamHistory = class {
  constructor(store, limit = 200) {
    this.store = store;
    this.limit = limit;
    this.past = [];
    this.future = [];
    this.applying = false;
    this.last = this.snapshot();
  }
  snapshot() {
    return JSON.parse(JSON.stringify(this.store.getAll() ?? {}));
  }
  /** Controls that appeared since (a sketch declared them) start from their current value: no step. */
  adopt() {
    const now = this.snapshot();
    for (const k of Object.keys(now)) if (!(k in this.last)) this.last[k] = now[k];
  }
  /** Whether the values differ from the last step (a change made in code, not yet committed). */
  dirty(now = this.snapshot()) {
    return Object.keys(now).some((k) => k in this.last && !same(now[k], this.last[k]));
  }
  /** A change is complete: one undo step, if anything differs from the last one. */
  commit() {
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
  canUndo() {
    return this.past.length > 0 || this.dirty();
  }
  canRedo() {
    return this.future.length > 0;
  }
  undo() {
    this.commit();
    const target = this.past.pop();
    if (!target) return;
    this.future.push(this.last);
    this.restore(target);
  }
  redo() {
    this.commit();
    const target = this.future.pop();
    if (!target) return;
    this.past.push(this.last);
    this.restore(target);
  }
  restore(target) {
    this.apply(target);
    this.last = { ...this.last, ...target };
  }
  /** Write a snapshot's values back; controls that no longer exist are left out. */
  apply(target) {
    this.applying = true;
    try {
      for (const [k, v] of Object.entries(target)) {
        if (this.store.has(k) && !same(this.store.get(k), v)) this.store.set(k, v);
      }
    } finally {
      this.applying = false;
    }
  }
  /** The Edit menu's Undo and Redo, with their keys. */
  commands() {
    return [
      { id: "edit.undo", label: "Undo", keys: "Mod+Z", group: "Edit", run: () => this.undo(), enabled: () => this.canUndo() },
      { id: "edit.redo", label: "Redo", keys: ["Shift+Mod+Z", "Mod+Y"], group: "Edit", run: () => this.redo(), enabled: () => this.canRedo() }
    ];
  }
};

// src/sketch/panelFrame.ts
var MIN_WIDTH = 180;
var MAX_WIDTH = 800;
var FOLDED_INSET = 32;
function ensureFoldedStyle() {
  if (document.getElementById("tekto-panel-folded")) return;
  const style = document.createElement("style");
  style.id = "tekto-panel-folded";
  style.textContent = `[data-tekto-panel=folded] [data-tekto-viewer-header]{padding-left:${FOLDED_INSET}px !important}[data-tekto-panel=folded] [data-tekto-shading-bar]:not([data-tekto-viewer-header]){margin-left:${FOLDED_INSET - 6}px}`;
  document.head.appendChild(style);
}
var PANEL_TOP_H = 34;
function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
  }
}
function panelFrame(o) {
  const { root, panelEl, theme: t } = o;
  const widthKey = `tekto.panelWidth.${o.storageKey}`;
  const foldKey = `tekto.panelCollapsed.${o.storageKey}`;
  const clamp = (w) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(w)));
  const dragged = parseInt(read(widthKey) ?? "", 10);
  let chosen = Number.isFinite(dragged) ? clamp(dragged) : null;
  let folded = read(foldKey) === "1";
  const defaultWidth = () => clamp(o.width === "auto" ? o.preferred?.() ?? 260 : o.width);
  let width = chosen ?? defaultWidth();
  const handle = document.createElement("div");
  handle.title = "Drag to resize the panel \xB7 double-click to reset";
  const idle = "transparent", hover = t.isDark ? "rgba(255,255,255,.3)" : "rgba(0,0,0,.25)";
  handle.style.cssText = `position:absolute;top:${o.top}px;bottom:0;width:6px;cursor:col-resize;z-index:10;background:${idle};transition:background .15s;`;
  handle.addEventListener("mouseenter", () => {
    handle.style.background = hover;
  });
  handle.addEventListener("mouseleave", () => {
    handle.style.background = idle;
  });
  handle.addEventListener("dblclick", () => {
    chosen = null;
    write(widthKey, null);
    width = defaultWidth();
    apply();
  });
  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = width;
    const move = (ev) => {
      chosen = width = clamp(w0 + ev.clientX - x0);
      write(widthKey, String(width));
      apply();
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
  const top = document.createElement("div");
  top.dataset.tektoPanelTop = "";
  const named = !!o.title;
  top.style.cssText = `
    position:absolute; left:0; top:${o.top}px; height:${PANEL_TOP_H}px; box-sizing:border-box; z-index:9;
    display:flex; align-items:center; padding:0 32px 0 14px; overflow:hidden; user-select:none;
    background:${t.panelBg}; border-right:1px solid ${t.border};
    border-bottom:1px solid ${t.plain && !named ? "transparent" : t.border};
  `;
  const name = document.createElement("span");
  name.textContent = o.title ?? "";
  name.title = o.title ?? "";
  name.style.cssText = t.plain ? `font:600 13px/1 ${t.font};color:${t.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;` : `font:500 10px/1 ${t.font};letter-spacing:1.6px;text-transform:uppercase;color:${t.textDim};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
  top.appendChild(name);
  panelEl.style.marginTop = `${PANEL_TOP_H}px`;
  const chevron = document.createElement("button");
  chevron.type = "button";
  chevron.dataset.tektoPanelFold = "";
  chevron.style.cssText = `
    position:absolute; top:${o.top + (PANEL_TOP_H - 24) / 2}px; width:20px; height:24px; z-index:11; padding:0;
    display:flex; align-items:center; justify-content:center; cursor:pointer;
    font:13px/1 ui-monospace,monospace; border-radius:4px;
    border:1px solid ${t.controlBorder}; background:${t.panelBg}; color:${t.accent};
  `;
  chevron.addEventListener("click", () => {
    folded = !folded;
    write(foldKey, folded ? "1" : "0");
    apply();
  });
  const isEmpty = () => !panelEl.textContent?.trim() && !panelEl.querySelector("input,button,select,textarea,canvas,svg,img");
  let empty = isEmpty();
  ensureFoldedStyle();
  const apply = () => {
    root.style.gridTemplateColumns = `${empty || folded ? 0 : width}px 1fr`;
    root.dataset.tektoPanel = empty ? "none" : folded ? "folded" : "open";
    panelEl.style.display = folded || empty ? "none" : "";
    chevron.style.display = empty ? "none" : "flex";
    top.style.display = empty || folded ? "none" : "flex";
    top.style.width = `${width}px`;
    chevron.style.zIndex = folded ? "30" : "11";
    handle.style.display = folded || empty ? "none" : "";
    handle.style.left = `${width - 3}px`;
    chevron.style.left = `${folded ? 6 : width - 26}px`;
    chevron.textContent = folded ? "\u203A" : "\u2039";
    chevron.title = folded ? "Show the panel" : "Hide the panel";
    chevron.setAttribute("aria-label", chevron.title);
    chevron.setAttribute("aria-expanded", String(!folded));
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      o.onResize?.();
    });
  };
  root.append(top, handle, chevron);
  apply();
  const sync = () => {
    const now = isEmpty();
    if (now !== empty) {
      empty = now;
      apply();
    }
  };
  let queued = 0;
  const watch = new MutationObserver(() => {
    if (!queued) queued = requestAnimationFrame(() => {
      queued = 0;
      sync();
    });
  });
  watch.observe(panelEl, { childList: true, subtree: true, characterData: true });
  return {
    fit() {
      sync();
      if (chosen !== null || o.width !== "auto") return;
      const w = defaultWidth();
      if (w !== width) {
        width = w;
        apply();
      }
    },
    dispose() {
      watch.disconnect();
      if (queued) cancelAnimationFrame(queued);
      top.remove();
      handle.remove();
      chevron.remove();
      panelEl.style.marginTop = "";
    }
  };
}

// src/sketch/Sketch2D.ts
function sketch2d(fn, config) {
  return new Sketch2DInstance(fn, config ?? {});
}
var Sketch2DInstance = class {
  constructor(fn, config) {
    this.logColors = ["", ""];
    this._logHtml = "";
    // Param model: values in the ParamStore, placement in `items` — rendered
    // by the shared ControlPanel.
    this.store = new ParamStore({});
    /** What the sketch can do, with its keys: Undo and Redo over its controls, to begin with. */
    this.commands = new Commands();
    this.history = new ParamHistory(this.store);
    this.menus = null;
    this.unbindKeys = null;
    this.items = /* @__PURE__ */ new Map();
    this.buttons = [];
    this.logs = [];
    this.bridge = null;
    this.drawFn = null;
    this.animateFn = null;
    this.pointerDownFns = [];
    this.pointerMoveFns = [];
    this.pointerUpFns = [];
    this.continuous = false;
    this.drawQueued = 0;
    /** Handle name → its position, and the `x, y` it was declared with (it follows those until dragged). */
    this.handleState = /* @__PURE__ */ new Map();
    /** The handles this run declared, in order. */
    this.handleList = [];
    this.dragging = null;
    this._prevFingerprint = "";
    this._baseLogCount = 0;
    this._onceRan = [];
    this._onceSeq = 0;
    this.rng = createRandom();
    this.disposed = false;
    this.startTime = performance.now();
    this.lastTime = performance.now();
    this.rerunTimer = 0;
    this._running = false;
    // Input state
    this._mouseX = 0;
    this._mouseY = 0;
    this._mousePressed = false;
    this.fn = fn;
    this.config = config;
    if (typeof config.container === "string") {
      this.container = document.querySelector(config.container);
    } else if (config.container) {
      this.container = config.container;
    } else {
      this.container = document.body;
    }
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.buildDOM();
    this.wireInput();
    this.runSketch();
    this.startLoop();
    this.bridge = installAgentBridge({
      owner: this,
      harness: "sketch2d",
      store: this.store,
      commands: this.commands,
      snapshot: (opts) => plainBundle({
        ...opts,
        title: this.config.title ?? "sketch2d",
        harness: "sketch2d",
        png: this.canvas.toDataURL("image/png"),
        viewport: { width: this.canvas.clientWidth, height: this.canvas.clientHeight },
        context: {
          params: this.store.getAll(),
          // The body's lines plus this frame's: keep the latest value per label.
          logs: [...new Map(this.logs.map((l) => [l.label, { ...l }])).values()],
          errors: this.bridge?.errors() ?? []
        }
      })
    });
  }
  // ── DOM ──
  buildDOM() {
    const paper = this.config.style === "paper";
    const t = getTheme(paper ? "paper" : this.config.theme);
    const inShell = this.container.dataset.shell != null;
    const showHeader = this.config.showHeader ?? (!paper && !inShell);
    const headerH = showHeader ? 44 : 0;
    const root = document.createElement("div");
    root.style.cssText = `
      display:grid; grid-template-columns:280px 1fr; grid-template-rows:${showHeader ? "44px " : ""}1fr;
      height:100%; width:100%; overflow:hidden; position:relative;
      background:${t.bg}; color:${t.text};
      font-family:${t.font};
    `;
    let menuHost = null;
    if (showHeader) {
      const header = document.createElement("div");
      header.style.cssText = `
        grid-column:1/-1; display:flex; align-items:center; padding:0 16px; gap:12px;
        background:${t.panelBg}; border-bottom:1px solid ${t.border};
      `;
      header.innerHTML = `
        <span style="font-weight:600;font-size:14px;color:${t.accent}">
          &#x2B21; ${this.config.title ?? "Tekto Sketch2D"}
        </span>
        <span style="font-size:9px;padding:2px 6px;border-radius:3px;
          background:${t.hoverBg};color:${t.accent}">2D</span>
      `;
      root.appendChild(header);
      menuHost = header;
    }
    this.commands.add(this.history.commands());
    this.unbindKeys = this.commands.bindKeys();
    const slot = paper ? null : menuSlot(menuHost);
    if (slot) {
      this.menus = menuBar(this.commands, { theme: t });
      slot.appendChild(this.menus.el);
    }
    this.panelEl = document.createElement("div");
    this.panelEl.style.cssText = `
      grid-column:1; grid-row:${showHeader ? 2 : 1}; overflow-y:auto; overflow-x:hidden; padding:0;
      background:${t.panelBg}; border-right:1px solid ${t.border};
    `;
    root.appendChild(this.panelEl);
    let frame = null;
    this.panel = new ControlPanel({
      store: this.store,
      theme: t,
      getButtons: () => this.buttons,
      onAction: () => this.scheduleRerun(),
      onCommit: () => this.history.commit(),
      // a finished change: one undo step
      tabs: this.config.tabs,
      onRender: () => frame?.fit()
    });
    this.panelEl.appendChild(this.panel.el);
    this.store.onChange(() => this.scheduleRerun());
    const view = document.createElement("div");
    view.style.cssText = `grid-column:2;grid-row:${showHeader ? 2 : 1};display:flex;flex-direction:column;min-width:0;min-height:0;`;
    const vpWrap = document.createElement("div");
    vpWrap.style.cssText = "flex:1;min-height:0;position:relative;overflow:hidden;";
    this.canvas.style.cssText = `
      width:100%; height:100%; display:block;
      background:${this.config.background ?? (t.isDark ? "#0b0b0b" : "#ffffff")};
    `;
    vpWrap.appendChild(this.canvas);
    this.logEl = document.createElement("div");
    this.logEl.dataset.tektoStatus = "";
    this.logEl.style.cssText = `
      flex:none; display:none; flex-wrap:wrap; column-gap:20px; padding:5px 12px;
      background:${t.panelBg}; border-top:1px solid ${t.border};
      font-size:11px; line-height:1.55; color:${t.text};
    `;
    this.logColors = [t.textFaint, t.text];
    view.append(vpWrap, this.logEl);
    root.appendChild(view);
    if (this.container === document.body) {
      this.container.style.margin = "0";
      this.container.style.height = "100vh";
      this.container.style.overflow = "hidden";
    }
    this.container.appendChild(root);
    frame = panelFrame({
      root,
      panelEl: this.panelEl,
      theme: t,
      top: headerH,
      width: this.config.panelWidth ?? (paper ? "auto" : 280),
      // A paper figure has no bar: its title is the panel's name (a shell names it already).
      title: this.config.panelTitle ?? (paper ? inShell ? "" : this.config.title ?? "" : "Parameters"),
      storageKey: this.config.title ?? "sketch2d",
      preferred: () => this.panel.preferredWidth()
    });
    const ro = new ResizeObserver(() => this.resizeCanvas());
    ro.observe(vpWrap);
    this.resizeCanvas();
  }
  resizeCanvas() {
    const parent = this.canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w > 0 && h > 0) {
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.redraw();
    }
  }
  wireInput() {
    this.canvas.style.touchAction = "none";
    const sample = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top, id: e.pointerId };
    };
    const run = (fns, p) => {
      if (!fns.length) return;
      for (const fn of fns) fn(p);
      this.queueDraw();
    };
    this.canvas.addEventListener("pointerdown", (e) => {
      const p = sample(e);
      this._mouseX = p.x;
      this._mouseY = p.y;
      this._mousePressed = true;
      const hit = this.handleAt(p.x, p.y);
      if (hit) {
        this.dragging = { name: hit.name, id: p.id };
        try {
          this.canvas.setPointerCapture(p.id);
        } catch {
        }
        this.canvas.style.cursor = "grabbing";
        this.queueDraw();
        return;
      }
      run(this.pointerDownFns, p);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      const p = sample(e);
      this._mouseX = p.x;
      this._mouseY = p.y;
      if (this.dragging && this.dragging.id === p.id) {
        const h = this.handleList.find((x) => x.name === this.dragging.name);
        const st = this.handleState.get(this.dragging.name);
        if (h && st) {
          st.value = this.fromScreen(p.x, p.y, h.opts);
          this.scheduleRerun();
        }
        return;
      }
      if (this.handleList.length) this.canvas.style.cursor = this.handleAt(p.x, p.y) ? "grab" : "";
      run(this.pointerMoveFns, p);
    });
    const onUp = (e) => {
      const p = sample(e);
      this._mouseX = p.x;
      this._mouseY = p.y;
      this._mousePressed = false;
      if (this.dragging && this.dragging.id === p.id) {
        this.dragging = null;
        this.canvas.style.cursor = this.handleAt(p.x, p.y) ? "grab" : "";
        this.queueDraw();
        return;
      }
      run(this.pointerUpFns, p);
    };
    this.canvas.addEventListener("pointerup", onUp);
    this.canvas.addEventListener("pointercancel", onUp);
  }
  // ── Sketch execution ──
  runSketch() {
    this.buttons = [];
    this.logs = [];
    this.drawFn = null;
    this.animateFn = null;
    this.continuous = false;
    this.pointerDownFns = [];
    this.pointerMoveFns = [];
    this.pointerUpFns = [];
    this.handleList = [];
    this._onceSeq = 0;
    const usedParams = /* @__PURE__ */ new Set();
    const lab = this.buildLab(usedParams);
    this._running = true;
    try {
      this.fn(lab);
    } catch (e) {
      console.error("Sketch2D error:", e);
      this.logs.push({ label: "ERROR", value: String(e) });
    }
    this._running = false;
    for (const key of this.store.keys()) {
      if (!usedParams.has(key)) {
        this.store.remove(key);
        this.items.delete(key);
      }
    }
    const fingerprint = [...this.items.keys()].sort().join("|") + "\u2016" + this.buttons.map((b) => `${b.group}:${b.label}`).join("|");
    if (fingerprint !== this._prevFingerprint) {
      this._prevFingerprint = fingerprint;
      this.panel.render([...this.items.values()]);
    }
    this.history.adopt();
    this._baseLogCount = this.logs.length;
    this.updateLog();
    this.redraw();
  }
  redraw() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;
    if (w > 0 && h > 0 && this.drawFn) {
      this.ctx.save();
      this.drawFn(this.ctx, w, h);
      this.ctx.restore();
    }
    if (w > 0 && h > 0) this.drawHandles();
  }
  /** Draw on the next frame, once however often it is asked for. */
  queueDraw() {
    if (this.drawQueued || this.disposed) return;
    this.drawQueued = requestAnimationFrame(() => {
      this.drawQueued = 0;
      if (!this.continuous) {
        this.redraw();
        this.updateLog();
      }
    });
  }
  // ── Drag handles ──
  viewOf(opts) {
    return typeof opts.view === "function" ? opts.view() : opts.view ?? null;
  }
  toScreen(p, opts) {
    const v = this.viewOf(opts);
    return v ? new Vec2(v.x + p.x * v.scale, v.y - p.y * v.scale) : p;
  }
  fromScreen(x, y, opts) {
    const v = this.viewOf(opts);
    const p = v ? new Vec2((x - v.x) / v.scale, (v.y - y) / v.scale) : new Vec2(x, y);
    if (!opts.constrain) return p;
    const [cx, cy] = opts.constrain(p.x, p.y);
    return new Vec2(cx, cy);
  }
  /** The topmost handle within reach of a canvas point, or null. */
  handleAt(x, y) {
    for (let i = this.handleList.length - 1; i >= 0; i--) {
      const h = this.handleList[i];
      const st = this.handleState.get(h.name);
      if (!st) continue;
      const q = this.toScreen(st.value, h.opts);
      if (Math.hypot(q.x - x, q.y - y) <= (h.opts.size ?? 6) + 5) return h;
    }
    return null;
  }
  drawHandles() {
    if (!this.handleList.length) return;
    const ctx = this.ctx;
    ctx.save();
    for (const h of this.handleList) {
      const st = this.handleState.get(h.name);
      if (!st) continue;
      const q = this.toScreen(st.value, h.opts);
      const r = h.opts.size ?? 6;
      const active = this.dragging?.name === h.name;
      ctx.beginPath();
      ctx.arc(q.x, q.y, active ? r + 1.5 : r, 0, Math.PI * 2);
      ctx.fillStyle = h.opts.color ?? "#ffffff";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#1a1a1a";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(q.x, q.y, (active ? r + 1.5 : r) + 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,.85)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
  scheduleRerun() {
    if (this._running || this.rerunTimer) return;
    this.rerunTimer = requestAnimationFrame(() => {
      this.rerunTimer = 0;
      this.runSketch();
    });
  }
  buildLab(usedParams) {
    const self = this;
    function makeParam(key, def, item) {
      usedParams.add(key);
      if (!self.store.has(key)) {
        self.store.define(key, def);
        self.items.set(key, item);
      }
      return { get value() {
        return self.store.get(key);
      }, set(v) {
        self.store.set(key, v);
      } };
    }
    return {
      slider(label, min, max, def, opts) {
        const group = opts?.group ?? "Parameters";
        const key = `slider:${opts?.group ?? ""}:${label}`;
        return makeParam(
          key,
          { type: "float", min, max, default: def, step: opts?.step ?? (max - min) / 100, label },
          { key, group, tab: opts?.tab }
        );
      },
      toggle(label, def = false, opts) {
        const group = opts?.group ?? "Parameters";
        const key = `toggle:${opts?.group ?? ""}:${label}`;
        return makeParam(key, { type: "bool", default: def, label }, { key, group, tab: opts?.tab });
      },
      select(label, options, def, opts) {
        const group = opts?.group ?? "Parameters";
        const key = `select:${opts?.group ?? ""}:${label}`;
        return makeParam(
          key,
          { type: "select", options, default: def ?? options[0], label },
          { key, group, tab: opts?.tab }
        );
      },
      colorPicker(label, def = "#38d9a9", opts) {
        const group = opts?.group ?? "Display";
        const key = `color:${opts?.group ?? ""}:${label}`;
        return makeParam(key, { type: "color", default: def, label }, { key, group, tab: opts?.tab });
      },
      button(label, action, opts) {
        self.buttons.push({ label, action, group: opts?.group ?? "Actions", tab: opts?.tab });
      },
      draw(fn) {
        self.drawFn = fn;
      },
      redraw() {
        self.queueDraw();
      },
      dragHandle(x, y, opts = {}) {
        const name = opts.name ?? `handle:${self.handleList.length}`;
        if (self.handleList.some((h) => h.name === name)) throw new Error(`lab.dragHandle: two handles named "${name}"; give each its own name`);
        const declared = new Vec2(x, y);
        let st = self.handleState.get(name);
        if (!st || self.dragging?.name !== name && st.declared.distTo(declared) > 1e-12) {
          st = { value: declared, declared };
          self.handleState.set(name, st);
        }
        self.handleList.push({ name, opts });
        return {
          get value() {
            return self.handleState.get(name)?.value ?? declared;
          },
          set(v) {
            const cur = self.handleState.get(name);
            if (cur) {
              cur.value = new Vec2(v.x, v.y);
              self.scheduleRerun();
            }
          }
        };
      },
      animate(fn) {
        self.animateFn = fn;
        self.continuous = true;
      },
      once(fn) {
        const i = self._onceSeq++;
        if (!self._onceRan[i]) {
          self._onceRan[i] = true;
          fn();
        }
      },
      get canvas() {
        return self.canvas;
      },
      get ctx() {
        return self.ctx;
      },
      get width() {
        const dpr = Math.min(window.devicePixelRatio, 2);
        return self.canvas.width / dpr;
      },
      get height() {
        const dpr = Math.min(window.devicePixelRatio, 2);
        return self.canvas.height / dpr;
      },
      get dpr() {
        return Math.min(window.devicePixelRatio, 2);
      },
      log(label, value) {
        self.logs.push({ label, value: value != null ? String(value) : "" });
      },
      // Math
      vec2: (x, y) => new Vec2(x, y),
      PI: Math.PI,
      TWO_PI: Math.PI * 2,
      sin: Math.sin,
      cos: Math.cos,
      atan2: Math.atan2,
      abs: Math.abs,
      sqrt: Math.sqrt,
      floor: Math.floor,
      ceil: Math.ceil,
      round: Math.round,
      min: Math.min,
      max: Math.max,
      lerp: MathUtils.lerp,
      clamp: MathUtils.clamp,
      noise(x, y, z) {
        return noise(x, y ?? 0, z ?? 0);
      },
      random(min, max) {
        return self.rng.random(min, max);
      },
      randomSeed(seed) {
        self.rng = createRandom(seed);
      },
      // Input
      get mouseX() {
        return self._mouseX;
      },
      get mouseY() {
        return self._mouseY;
      },
      get mousePressed() {
        return self._mousePressed;
      },
      onPointerDown(fn) {
        self.pointerDownFns.push(fn);
      },
      onPointerMove(fn) {
        self.pointerMoveFns.push(fn);
      },
      onPointerUp(fn) {
        self.pointerUpFns.push(fn);
      }
    };
  }
  updateLog() {
    const [dim, ink] = this.logColors;
    const html = this.logs.map(
      (l) => `<div style="display:flex;gap:8px;white-space:nowrap;"><span style="color:${dim}">${l.label}</span><span style="color:${ink}">${l.value}</span></div>`
    ).join("");
    if (html === this._logHtml) return;
    this._logHtml = html;
    this.logEl.style.display = this.logs.length ? "flex" : "none";
    this.logEl.innerHTML = html;
  }
  // ── Animation Loop ──
  startLoop() {
    const loop = () => {
      if (this.disposed) return;
      if (this.continuous && this.animateFn) {
        const now = performance.now();
        const dt = (now - this.lastTime) / 1e3;
        this.lastTime = now;
        this.logs.length = this._baseLogCount;
        this.animateFn((now - this.startTime) / 1e3, Math.min(dt, 1 / 15));
        this.redraw();
        this.updateLog();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  /** The current value of every control, keyed for `setParams` — save it to reopen a design. */
  getParams() {
    return { ...this.store.getAll() };
  }
  /** Set controls by label, "Group:Label" or key, and re-run once; reports what it couldn't apply. */
  setParams(values) {
    return this.store.setByName(values);
  }
  /** Tear down the sketch */
  dispose() {
    this.disposed = true;
    if (this.drawQueued) cancelAnimationFrame(this.drawQueued);
    this.bridge?.dispose();
    this.unbindKeys?.();
    this.menus?.dispose();
    this.panel.dispose();
    this.container.innerHTML = "";
  }
};

// src/render/SheetCanvas.ts
var FONT = "Helvetica, Arial, sans-serif";
var MIN_PEN_PX = 0.75;
var HIGHLIGHT = "#1e88e5";
function fitSheet(bounds, width, height, margin = 24) {
  if (!bounds) return { scale: 1, x: width / 2, y: height / 2 };
  const bw = Math.max(bounds.max.x - bounds.min.x, 1e-9), bh = Math.max(bounds.max.y - bounds.min.y, 1e-9);
  const scale = Math.max(1e-9, Math.min((width - 2 * margin) / bw, (height - 2 * margin) / bh));
  const cx = (bounds.min.x + bounds.max.x) / 2, cy = (bounds.min.y + bounds.max.y) / 2;
  return { scale, x: width / 2 - cx * scale, y: height / 2 + cy * scale };
}
function drawSheet(ctx, sheet, t, opts = {}) {
  const prims = opts.prims ?? sheet.explode();
  const hl = opts.highlight ? new Set(opts.highlight) : null;
  const hlColor = opts.highlightColor ?? HIGHLIGHT;
  const mmPx = sheet.scale / 1e3 * t.scale;
  const X = (p) => t.x + p.x * t.scale, Y = (p) => t.y - p.y * t.scale;
  const pen = (s, lit) => {
    ctx.strokeStyle = lit ? hlColor : s.color;
    ctx.lineWidth = Math.max(MIN_PEN_PX, s.weight * mmPx) + (lit ? 1.5 : 0);
    ctx.setLineDash(s.dash === "solid" ? [] : DASH_PATTERNS[s.dash].map((d) => Math.max(d * mmPx, 0.5)));
  };
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const p of prims) {
    const lit = !!(hl && p.key && hl.has(p.key));
    if (p.kind === "fill") {
      ctx.beginPath();
      for (const r of p.rings) r.forEach((q, i) => i ? ctx.lineTo(X(q), Y(q)) : ctx.moveTo(X(q), Y(q)));
      ctx.fillStyle = p.color;
      ctx.fill("evenodd");
      if (lit) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = hlColor;
        ctx.fill("evenodd");
        ctx.globalAlpha = 1;
      }
    } else if (p.kind === "polyline") {
      pen(p.style, lit);
      ctx.beginPath();
      p.points.forEach((q, i) => i ? ctx.lineTo(X(q), Y(q)) : ctx.moveTo(X(q), Y(q)));
      if (p.closed) ctx.closePath();
      ctx.stroke();
    } else if (p.kind === "circle") {
      pen(p.style, lit);
      ctx.beginPath();
      ctx.arc(X(p.center), Y(p.center), p.radius * t.scale, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === "arc") {
      let sweep = (p.endDeg - p.startDeg) % 360;
      if (sweep <= 0) sweep += 360;
      const a0 = -p.startDeg * Math.PI / 180, a1 = -(p.startDeg + sweep) * Math.PI / 180;
      pen(p.style, lit);
      ctx.beginPath();
      ctx.arc(X(p.center), Y(p.center), p.radius * t.scale, a0, a1, true);
      ctx.stroke();
    } else {
      const px = p.height * t.scale;
      if (px < 0.5) continue;
      ctx.save();
      ctx.translate(X(p.at), Y(p.at));
      if (p.rotation) ctx.rotate(-p.rotation * Math.PI / 180);
      ctx.font = `${px}px ${FONT}`;
      ctx.fillStyle = lit ? hlColor : p.style.color;
      ctx.textAlign = p.align;
      ctx.textBaseline = p.baseline === "bottom" ? "alphabetic" : p.baseline === "middle" ? "middle" : "hanging";
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}
var SheetCanvas = class {
  constructor(container, opts = {}) {
    this._sheet = null;
    this.prims = [];
    this.t = { scale: 1, x: 0, y: 0 };
    this.fitted = false;
    this.highlight = [];
    this.pickFns = [];
    this.drawFns = [];
    this.frame = 0;
    this.opts = opts;
    this.canvas = document.createElement("canvas");
    this.canvas.dataset.tektoOverlay = "";
    this.canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;";
    if (getComputedStyle(container).position === "static") container.style.position = "relative";
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.off = this.wire();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    if (opts.sheet) this.setSheet(opts.sheet);
  }
  get sheet() {
    return this._sheet;
  }
  /** The primitives on screen (the sheet, exploded once per `setSheet`). */
  get primitives() {
    return this.prims;
  }
  get transform() {
    return { ...this.t };
  }
  /** Show a sheet. The first one is fitted; later ones keep the zoom, so a sheet rebuilt on
   *  every edit stays put (`fit: true` to refit). */
  setSheet(sheet, opts = {}) {
    this._sheet = sheet;
    this.prims = sheet ? sheet.explode() : [];
    if (opts.fit || !this.fitted) this.fit();
    else this.redraw();
  }
  setTransform(t) {
    this.t = { ...t };
    this.redraw();
  }
  fit() {
    const { width, height } = this.size();
    if (!this._sheet || !width || !height) {
      this.redraw();
      return;
    }
    this.t = fitSheet(boundsOf(this.prims), width, height, this.opts.margin ?? 24);
    this.fitted = true;
    this.redraw();
  }
  toSheet(x, y) {
    return { x: (x - this.t.x) / this.t.scale, y: (this.t.y - y) / this.t.scale };
  }
  toScreen(p) {
    return { x: this.t.x + p.x * this.t.scale, y: this.t.y - p.y * this.t.scale };
  }
  /** The primitive at a canvas position (CSS pixels), or null. */
  pick(x, y) {
    return pickPrim(this.prims, this.toSheet(x, y), (this.opts.pickTolerance ?? 6) / this.t.scale);
  }
  /** Clicks (not drags): the picked primitive, or null for paper. Returns the unsubscribe. */
  onPick(fn) {
    this.pickFns.push(fn);
    return () => {
      this.pickFns = this.pickFns.filter((f) => f !== fn);
    };
  }
  /** Draw primitives with these keys highlighted (a selection); null clears. */
  setHighlight(keys) {
    this.highlight = keys ? [...keys] : [];
    this.redraw();
  }
  /** Paint over the sheet in screen pixels after every redraw. Returns the unsubscribe. */
  onDraw(fn) {
    this.drawFns.push(fn);
    this.redraw();
    return () => {
      this.drawFns = this.drawFns.filter((f) => f !== fn);
      this.redraw();
    };
  }
  /** Redraw on the next frame (calls coalesce). */
  redraw() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.paint();
    });
  }
  /** Draw now — before reading the canvas back. */
  paint() {
    const { width, height, dpr } = this.size();
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const bg = this.opts.background ?? "#ffffff";
    if (bg !== "transparent") {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
    }
    if (this._sheet) drawSheet(ctx, this._sheet, this.t, { prims: this.prims, highlight: this.highlight, highlightColor: this.opts.highlightColor });
    for (const fn of this.drawFns) {
      ctx.save();
      fn(ctx, this.transform);
      ctx.restore();
    }
  }
  dispose() {
    cancelAnimationFrame(this.frame);
    this.ro.disconnect();
    this.off();
    this.canvas.remove();
  }
  size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return { width: this.canvas.clientWidth, height: this.canvas.clientHeight, dpr };
  }
  resize() {
    const { width, height, dpr } = this.size();
    if (!width || !height) return;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    if (!this.fitted && this._sheet) this.fit();
    else this.paint();
  }
  wire() {
    const c = this.canvas;
    const local = (e) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onWheel = (e) => {
      e.preventDefault();
      const p = local(e), k = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 15e-4));
      this.t = { scale: this.t.scale * k, x: p.x - (p.x - this.t.x) * k, y: p.y - (p.y - this.t.y) * k };
      this.redraw();
    };
    let drag = null;
    const onDown = (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      const p = local(e);
      drag = { id: e.pointerId, x: p.x, y: p.y, t: { ...this.t }, moved: false };
      c.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const p = local(e);
      if (!drag.moved && Math.hypot(p.x - drag.x, p.y - drag.y) < 4) return;
      drag.moved = true;
      this.t = { ...drag.t, x: drag.t.x + p.x - drag.x, y: drag.t.y + p.y - drag.y };
      this.redraw();
    };
    const onUp = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const wasClick = !drag.moved && e.button === 0;
      drag = null;
      if (!wasClick) return;
      const p = local(e), prim = this.pick(p.x, p.y);
      for (const fn of this.pickFns) fn(prim, { shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey });
    };
    const onCancel = () => {
      drag = null;
    };
    const onDbl = () => this.fit();
    c.addEventListener("wheel", onWheel, { passive: false });
    c.addEventListener("pointerdown", onDown);
    c.addEventListener("pointermove", onMove);
    c.addEventListener("pointerup", onUp);
    c.addEventListener("pointercancel", onCancel);
    c.addEventListener("dblclick", onDbl);
    return () => {
      c.removeEventListener("wheel", onWheel);
      c.removeEventListener("pointerdown", onDown);
      c.removeEventListener("pointermove", onMove);
      c.removeEventListener("pointerup", onUp);
      c.removeEventListener("pointercancel", onCancel);
      c.removeEventListener("dblclick", onDbl);
    };
  }
};

export {
  ensureSliderStyle,
  ControlPanel,
  panelFrame,
  keyMatches,
  formatKeys,
  viewCommands,
  Commands,
  menuBar,
  menuSlot,
  ParamHistory,
  sketch2d,
  Sketch2DInstance,
  fitSheet,
  drawSheet,
  SheetCanvas
};
