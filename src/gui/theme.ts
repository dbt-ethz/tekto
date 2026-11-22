/**
 * Tekto GUI theme — the single source of panel chrome colors.
 *
 * Every tekto panel (sketch, sketch2d, appShell, LayerPanel, ControlPanel)
 * derives its colors from here instead of re-declaring hex literals inline.
 *
 * Chrome is WHITE on dark GREY by design: neutral greys with no blue in them,
 * white slider accents and value labels, white toggle tracks, plain white
 * titles — no colored accents in panel chrome, and never green. (Content colors — e.g. a colorPicker's default value — are
 * the sketch's business, not the theme's.)
 */

/** The colours of tekto's panel chrome (white on dark by default), from `getTheme`; every panel reads them instead of its own hex literals. */
export interface Theme {
  isDark: boolean;
  /** App background behind the viewport */
  bg: string;
  /** Panel / header background */
  panelBg: string;
  /** Elevated surface (dropdowns, popovers) */
  popupBg: string;
  /** Hairline borders between panel sections */
  border: string;
  /** Borders on individual controls (inputs, selects, buttons) */
  controlBorder: string;
  /** Primary text */
  text: string;
  /** Secondary text (control labels) */
  textDim: string;
  /** Tertiary text (group headers, disabled) */
  textFaint: string;
  /** Chrome accent — white on dark, near-black on light */
  accent: string;
  /** Hover wash for rows / buttons */
  hoverBg: string;
  /** Input field background (selects, text inputs) */
  fieldBg: string;
  /** Panel font stack */
  font: string;
  /** Minimal chrome (the paper style): no title bar or badge, section names without arrows, no heading over a lone default group. */
  plain?: boolean;
}

// Dark: neutral greys, as an editor's dark theme. The chrome (panels, bars, menus) is a dark
// grey; the view behind it is darker still, almost black, so the model is what stands out.
const DARK: Theme = {
  isDark: true,
  bg: "#0b0b0b",
  panelBg: "#1e1e1e",
  popupBg: "#252526",
  border: "#303030",
  controlBorder: "#444444",
  text: "#cccccc",
  textDim: "#a8a8a8",
  textFaint: "#808080",
  accent: "#ffffff",
  hoverBg: "rgba(255,255,255,.08)",
  fieldBg: "#141414",
  font: "'IBM Plex Mono',ui-monospace,monospace",
};

/** The dark theme's view background (a 3D view, a 2D canvas): almost black, darker than the chrome. */
export const VIEW_BG_DARK = 0x0b0b0b;

const LIGHT: Theme = {
  isDark: false,
  bg: "#f4f5f8",
  panelBg: "#ffffff",
  popupBg: "#f5f6fa",
  border: "#e0e2ea",
  controlBorder: "#d0d3de",
  text: "#2a2d3a",
  textDim: "#5a6080",
  textFaint: "#8a8fa0",
  accent: "#16182c",
  hoverBg: "rgba(0,0,0,.05)",
  fieldBg: "#f4f5f8",
  font: "'IBM Plex Mono',ui-monospace,monospace",
};

// Paper: a figure in a book. White, one ink for every text, hairlines, no chrome.
const PAPER: Theme = {
  isDark: false,
  bg: "#ffffff",
  panelBg: "#ffffff",
  popupBg: "#ffffff",
  border: "#d9d9d9",
  controlBorder: "#c4c4c4",
  text: "#111111",
  textDim: "#111111",
  textFaint: "#111111",
  accent: "#111111",
  hoverBg: "rgba(0,0,0,.05)",
  fieldBg: "#ffffff",
  font: "'IBM Plex Mono',ui-monospace,monospace",
  plain: true,
};

/**
 * A look for a whole app. "studio" (default): the dark, tool-like chrome of a 3D app
 * (or its light variant, by `theme`). "paper": white and minimal, for a 2D figure:
 * the drawing first, one ink, no title bar.
 */
export type UiStyle = "studio" | "paper";

/** The panel chrome colours for dark (default, white-on-dark), light or paper mode. */
export function getTheme(mode: "dark" | "light" | "paper" = "dark"): Theme {
  return mode === "paper" ? PAPER : mode === "light" ? LIGHT : DARK;
}
