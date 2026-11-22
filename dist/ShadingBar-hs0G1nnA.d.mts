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
interface Theme {
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
/**
 * A look for a whole app. "studio" (default): the dark, tool-like chrome of a 3D app
 * (or its light variant, by `theme`). "paper": white and minimal, for a 2D figure:
 * the drawing first, one ink, no title bar.
 */
type UiStyle = "studio" | "paper";
/** The panel chrome colours for dark (default, white-on-dark), light or paper mode. */
declare function getTheme(mode?: "dark" | "light" | "paper"): Theme;

/** Corner of the view the bar sits in. */
type ShadingBarCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
/** Where the bar sits: a corner of the view, or `"header"` — a strip across the top of the view, as
 *  Blender's viewport header: the app's own controls on its left (`renderer.viewerHeader.left`), the
 *  shading icons, the snapshot and ✎ Markup on its right, and zoom in / out / to bounds in a column
 *  under the axis widget (the hand above them in a strict-2D view). */
type ShadingBarPlacement = ShadingBarCorner | "header";
/**
 * Which of the viewer's tools an app shows; each is on unless set to false. An app without
 * daylight drops `sun`, a drawing viewer drops `light`, and so on: fewer tools, same places.
 */
interface ViewerTools {
    /** The render style: solid, wireframe, hidden line, ghost. */
    modes?: boolean;
    /** Flat / Studio lighting, and ambient occlusion beside it. */
    light?: boolean;
    /** The sun: morning, noon, sunset, or a date, an hour and a place. */
    sun?: boolean;
    /** The section through the model. */
    section?: boolean;
    /** The overlays' switches: grid, axes, wireframe, labels, notes. */
    overlays?: boolean;
    /** Save the view as a PNG. */
    snapshot?: boolean;
    /** Zoom in / out / to bounds (the column under the axis widget in the header layout). */
    zoom?: boolean;
}

export { type ShadingBarPlacement as S, type Theme as T, type UiStyle as U, type ViewerTools as V, type ShadingBarCorner as a, getTheme as g };
