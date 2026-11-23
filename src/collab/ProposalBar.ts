/**
 * ProposalBar — where a person reviews what an agent proposes.
 *
 * Shown over the view while the document has open proposals (`proposals.ts`), one at a time:
 * who proposes it, what it does and why, the records it adds, changes (field by field, before
 * → after) and removes, and Accept / Reject. Accept applies the patch as one undo step, so
 * "try it and undo" is the preview: after an undo the proposal is open again. Reject keeps
 * the proposal with the reason typed beside it, for the agent to read.
 *
 *   const bar = new ProposalBar(doc, viewEl, { schema: buildingSchema(), onFocus: (keys) => selection.select(keys) });
 */
import { getTheme, type Theme } from "../gui/theme";
import type { Doc } from "./Doc";
import type { RecordSchema } from "./recordSchema";
import { acceptProposal, listProposals, rejectProposal, type ProposalInfo } from "./proposals";

/** Options for `new ProposalBar(doc, host, …)`: the schema a patch is checked against, who decides, and what a click on a record does. */
export interface ProposalBarOptions {
  /** Each collection's schema: an accepted patch is checked against it, as an agent's edit is. */
  schema?: Partial<Record<string, RecordSchema>>;
  /** Who accepts or rejects (default: the signed-in user of the shared document, if any). */
  by?: () => string | undefined;
  /** Called with a proposal's records when its card is shown and when one is clicked: select them in the view. */
  onFocus?: (keys: string[]) => void;
  /** CSS position inside the host (default: bottom centre, above a status line). */
  position?: string;
  theme?: Theme;
}

const show = (v: unknown): string => {
  if (v === undefined) return "—";
  if (typeof v === "number") return String(Math.round(v * 1000) / 1000);
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 34 ? `${s.slice(0, 33)}…` : s;
};

/** The review bar of a document's proposals. `destroy()` removes it. */
export class ProposalBar {
  readonly el: HTMLDivElement;
  private index = 0;
  private error = "";
  private pending = 0;
  private shown = "";
  private off: () => void;
  private t: Theme;

  constructor(private doc: Doc<any>, host: HTMLElement, private opts: ProposalBarOptions = {}) {
    this.t = opts.theme ?? getTheme();
    const t = this.t;
    this.el = document.createElement("div");
    this.el.dataset.tektoProposals = "";
    this.el.setAttribute("role", "region");
    this.el.setAttribute("aria-label", "Proposals");
    this.el.style.cssText = `position:absolute;${opts.position ?? "left:50%;bottom:56px;transform:translateX(-50%);"}z-index:24;display:none;
      width:min(420px,calc(100% - 32px));max-height:60%;overflow-y:auto;box-sizing:border-box;padding:10px 12px;
      background:${t.popupBg};color:${t.text};border:1px solid ${t.controlBorder};border-radius:8px;
      box-shadow:0 6px 22px rgba(0,0,0,${t.isDark ? ".45" : ".16"});font:12px/1.45 ${t.font};`;
    host.appendChild(this.el);
    // A sketch redraws on every change; one render a frame is enough.
    this.off = doc.onChange(() => { if (!this.pending) this.pending = requestAnimationFrame(() => { this.pending = 0; this.render(); }); });
    this.render();
  }

  destroy(): void {
    this.off();
    if (this.pending) cancelAnimationFrame(this.pending);
    this.el.remove();
  }

  private decider(): string | undefined {
    return this.opts.by?.() ?? this.doc.store.user?.name;
  }

  render(): void {
    const t = this.t;
    const open = listProposals(this.doc);
    if (!open.length) { this.el.style.display = "none"; this.el.replaceChildren(); this.shown = ""; this.error = ""; return; }
    this.index = Math.min(this.index, open.length - 1);
    const p = open[this.index];
    if (p.id !== this.shown) { this.shown = p.id; this.error = ""; }
    this.el.style.display = "block";
    const make = <K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string) => {
      const e = document.createElement(tag);
      e.style.cssText = css;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const button = (label: string, solid: boolean, run: () => void) => {
      const b = make("button", `padding:5px 12px;border-radius:5px;font:inherit;cursor:pointer;border:1px solid ${solid ? t.accent : t.controlBorder};
        background:${solid ? t.accent : "transparent"};color:${solid ? t.popupBg : t.text};`, label);
      b.type = "button";
      b.addEventListener("click", run);
      return b;
    };

    const head = make("div", `display:flex;align-items:center;gap:6px;color:${t.textDim};font-size:11px;`);
    head.append(make("span", "flex:1;", `${p.by} proposes${open.length > 1 ? ` · ${this.index + 1} of ${open.length}` : ""}`));
    if (open.length > 1) {
      const step = (d: number, label: string, name: string) => {
        const b = button(label, false, () => { this.index = (this.index + d + open.length) % open.length; this.render(); });
        b.style.padding = "1px 8px";
        b.setAttribute("aria-label", name);
        return b;
      };
      head.append(step(-1, "‹", "Previous proposal"), step(1, "›", "Next proposal"));
    }
    const title = make("div", "font-weight:600;font-size:13px;margin:3px 0 2px;", p.label);
    title.dataset.proposal = p.id;
    const rows: HTMLElement[] = [head, title];
    if (p.note) rows.push(make("div", `color:${t.textDim};margin-bottom:6px;white-space:pre-wrap;`, p.note));

    const list = make("div", `margin:6px 0;padding:6px 0;border-top:1px solid ${t.controlBorder};border-bottom:1px solid ${t.controlBorder};display:grid;gap:3px;`);
    for (const c of p.changes) {
      const row = make("button", `display:block;width:100%;text-align:left;padding:2px 4px;border:0;border-radius:4px;background:transparent;color:${t.text};font:inherit;cursor:${this.opts.onFocus ? "pointer" : "default"};`);
      row.type = "button";
      row.dataset.change = c.key;
      const sign = c.kind === "add" ? "+" : c.kind === "remove" ? "−" : "~";
      row.append(make("span", `display:inline-block;width:14px;color:${t.textDim};`, sign), make("span", "", c.key));
      if (c.kind === "change") for (const f of c.fields ?? []) row.append(make("div", `padding-left:14px;color:${t.textDim};`, `${f.name}: ${show(f.from)} → ${show(f.to)}`));
      row.setAttribute("aria-label", `${c.kind === "add" ? "Adds" : c.kind === "remove" ? "Removes" : "Changes"} ${c.key}`);
      if (this.opts.onFocus) {
        row.addEventListener("click", () => this.opts.onFocus!([c.key]));
        row.addEventListener("mouseenter", () => { row.style.background = t.hoverBg; });
        row.addEventListener("mouseleave", () => { row.style.background = "transparent"; });
      }
      list.append(row);
    }
    rows.push(list);
    if (p.stale.length) rows.push(make("div", `color:${t.textDim};margin-bottom:6px;`, `Changed since it was proposed: ${p.stale.join(", ")}`));
    if (this.error) { const e = make("div", "color:#ff8a80;margin-bottom:6px;white-space:pre-wrap;", this.error); e.setAttribute("role", "alert"); rows.push(e); }

    const foot = make("div", "display:flex;gap:6px;align-items:center;");
    const reason = make("input", `flex:1;min-width:0;padding:5px 8px;border-radius:5px;border:1px solid ${t.controlBorder};background:transparent;color:${t.text};font:inherit;`);
    reason.placeholder = "Reason, if you reject";
    reason.setAttribute("aria-label", "Reason for rejecting");
    const reject = () => { rejectProposal(this.doc, p.id, { by: this.decider(), reason: reason.value.trim() || undefined }); this.render(); };
    reason.addEventListener("keydown", (e) => { if (e.key === "Enter") reject(); e.stopPropagation(); });
    foot.append(reason, button("Reject", false, reject), button("Accept", true, () => {
      const r = acceptProposal(this.doc, p.id, { schema: this.opts.schema, by: this.decider() });
      this.error = r.ok ? "" : `It no longer applies:\n${r.rejected.map((x) => `${x.key}: ${x.message}`).join("\n")}`;
      this.render();
    }));
    rows.push(foot);
    this.el.replaceChildren(...rows);
  }
}
