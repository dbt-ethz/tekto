/**
 * Panel options (sketch2d) — tabs down the side, and a panel as wide as its controls.
 *
 * A façade drawn from four groups of numbers, one tab each. `tabs: "side"` lists the
 * tabs down the panel's left edge, which holds more and longer names than a bar on
 * top; `panelWidth: "auto"` sizes the panel to its longest label and widest control
 * (drag its edge to choose a width yourself, double-click the edge to go back). A
 * control without a tab stays above the tabs, on show whichever tab is open.
 *
 * The same two options exist on `sketch()` and `appShell()`.
 */
import { sketch2d, Sketch2DInstance } from "../../src";

export default function (container: HTMLElement): Sketch2DInstance {
  return sketch2d((lab) => {
    const dims = lab.toggle("Dimensions", true);

    const width = lab.slider("Width m", 6, 24, 14, { step: 0.5, tab: "Building" });
    const storeys = lab.slider("Storeys", 1, 6, 3, { step: 1, tab: "Building" });
    const storeyH = lab.slider("Storey height m", 2.6, 4, 3, { step: 0.05, tab: "Building" });
    const plinth = lab.slider("Plinth m", 0, 1.5, 0.6, { step: 0.05, tab: "Building" });

    const perFloor = lab.slider("Windows per floor", 1, 10, 5, { step: 1, tab: "Windows" });
    const winW = lab.slider("Width m", 0.6, 2.4, 1.2, { step: 0.05, tab: "Windows", group: "Size" });
    const winH = lab.slider("Height m", 0.8, 2.6, 1.6, { step: 0.05, tab: "Windows", group: "Size" });
    const sill = lab.slider("Sill above the floor m", 0, 1.4, 0.9, { step: 0.05, tab: "Windows", group: "Size" });
    const mullion = lab.toggle("Mullion", true, { tab: "Windows", group: "Size" });

    const roof = lab.select("Roof", ["Gable", "Flat with parapet"] as const, "Gable", { tab: "Roof and ground" });
    const pitch = lab.slider("Pitch °", 10, 55, 30, { step: 1, tab: "Roof and ground" });
    const overhang = lab.slider("Overhang m", 0, 1.2, 0.4, { step: 0.05, tab: "Roof and ground" });
    const hatch = lab.toggle("Hatch the ground", true, { tab: "Roof and ground" });

    lab.draw((ctx, w, h) => {
      const dark = getComputedStyle(lab.canvas).backgroundColor !== "rgb(255, 255, 255)";
      const ink = dark ? "#e8e9f0" : "#111111", dim = dark ? "#7a80a0" : "#777777";
      ctx.clearRect(0, 0, w, h);

      const W = width.value, wallH = plinth.value + storeys.value * storeyH.value;
      const rise = roof.value === "Gable" ? Math.tan(pitch.value * Math.PI / 180) * (W / 2 + overhang.value) : 0.5;
      const pad = 70;
      const s = Math.min((w - 2 * pad) / (W + 2 * overhang.value), (h - 2 * pad) / (wallH + rise));
      const X = (x: number) => w / 2 + (x - W / 2) * s;
      const Y = (y: number) => h - pad - y * s;

      ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineJoin = "round";

      // ground
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(X(-3), Y(0)); ctx.lineTo(X(W + 3), Y(0)); ctx.stroke();
      if (hatch.value) {
        ctx.lineWidth = 0.6; ctx.beginPath();
        for (let x = X(-3); x < X(W + 3); x += 7) { ctx.moveTo(x, Y(0)); ctx.lineTo(x - 8, Y(0) + 10); }
        ctx.stroke();
      }

      // wall and plinth
      ctx.lineWidth = 2;
      ctx.strokeRect(X(0), Y(wallH), W * s, wallH * s);
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(X(0), Y(plinth.value)); ctx.lineTo(X(W), Y(plinth.value)); ctx.stroke();

      // roof
      ctx.lineWidth = 2; ctx.beginPath();
      if (roof.value === "Gable") {
        ctx.moveTo(X(-overhang.value), Y(wallH)); ctx.lineTo(X(W / 2), Y(wallH + rise)); ctx.lineTo(X(W + overhang.value), Y(wallH));
      } else {
        ctx.rect(X(-overhang.value), Y(wallH + rise), (W + 2 * overhang.value) * s, rise * s);
      }
      ctx.stroke();

      // windows
      const n = perFloor.value, gap = (W - n * winW.value) / (n + 1);
      ctx.lineWidth = 1;
      if (gap > 0.05) {
        for (let f = 0; f < storeys.value; f++) {
          const y0 = plinth.value + f * storeyH.value + sill.value;
          const top = Math.min(y0 + winH.value, plinth.value + (f + 1) * storeyH.value - 0.2);
          for (let i = 0; i < n; i++) {
            const x0 = gap + i * (winW.value + gap);
            ctx.strokeRect(X(x0), Y(top), winW.value * s, (top - y0) * s);
            if (mullion.value) { ctx.beginPath(); ctx.moveTo(X(x0 + winW.value / 2), Y(top)); ctx.lineTo(X(x0 + winW.value / 2), Y(y0)); ctx.stroke(); }
          }
        }
      }

      // dimensions
      if (dims.value) {
        ctx.strokeStyle = dim; ctx.fillStyle = dim; ctx.lineWidth = 0.8;
        ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
        const yd = Y(0) + 28;
        ctx.beginPath(); ctx.moveTo(X(0), yd); ctx.lineTo(X(W), yd);
        ctx.moveTo(X(0), yd - 5); ctx.lineTo(X(0), yd + 5); ctx.moveTo(X(W), yd - 5); ctx.lineTo(X(W), yd + 5); ctx.stroke();
        ctx.textAlign = "center"; ctx.fillText(`${W.toFixed(2)} m`, X(W / 2), yd + 16);
        const xd = X(W + overhang.value) + 26;
        ctx.beginPath(); ctx.moveTo(xd, Y(0)); ctx.lineTo(xd, Y(wallH));
        ctx.moveTo(xd - 5, Y(0)); ctx.lineTo(xd + 5, Y(0)); ctx.moveTo(xd - 5, Y(wallH)); ctx.lineTo(xd + 5, Y(wallH)); ctx.stroke();
        ctx.textAlign = "left"; ctx.fillText(`${wallH.toFixed(2)} m`, xd + 8, Y(wallH / 2) + 4);
      }
    });

    // the status line, under the drawing
    const area = width.value * (plinth.value + storeys.value * storeyH.value);
    const fits = (width.value - perFloor.value * winW.value) / (perFloor.value + 1) > 0.05;
    lab.log("Façade", `${area.toFixed(1)} m²`);
    lab.log("Glazed", fits ? `${Math.round(100 * perFloor.value * storeys.value * winW.value * winH.value / area)} %` : "the windows do not fit");
  }, { container, title: "Panel options", tabs: "side", panelWidth: "auto" });
}
