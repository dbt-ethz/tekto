/**
 * A Sheet as pixels: `rasterizeSheet` and the PNG file (`sheet.toPNG`), with no browser.
 */
import { describe, it, expect } from "vitest";
import { Sheet } from "../src/core/drawing/Sheet";
import { rasterizeSheet, encodePNG, type SheetRaster } from "../src/core/drawing/sheetRaster";

const at = (img: SheetRaster, x: number, y: number) => {
  const p = img.toPixel({ x, y });
  const o = (Math.round(p.y) * img.width + Math.round(p.x)) * 4;
  return [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]];
};
/** How many pixels in a box (sheet coordinates) are not the paper's white. */
const inked = (img: SheetRaster, x0: number, y0: number, x1: number, y1: number) => {
  const a = img.toPixel({ x: x0, y: y1 }), b = img.toPixel({ x: x1, y: y0 });
  let n = 0;
  for (let y = Math.floor(a.y); y <= Math.ceil(b.y); y++) for (let x = Math.floor(a.x); x <= Math.ceil(b.x); x++) {
    const o = (y * img.width + x) * 4;
    if (img.data[o] < 200) n++;
  }
  return n;
};

describe("rasterizeSheet", () => {
  it("draws fills, lines and text where the sheet has them, on white paper", () => {
    const sheet = new Sheet({ scale: 100 });
    sheet.main.fill([[0, 0], [4, 0], [4, 3], [0, 3]], { color: "#ff0000" });
    sheet.main.fill([[[6, 0], [10, 0], [10, 4], [6, 4]], [[7, 1], [9, 1], [9, 3], [7, 3]]], { color: "#0000ff" });   // a ring: a hole
    sheet.main.polyline([[0, 5], [10, 5]], { weight: 0.5, color: "#000000" });
    sheet.main.text("Hall 21.0 m²", [0, 6], { size: 3 });
    const img = rasterizeSheet(sheet, { width: 800 });
    expect(img.width).toBe(800);
    expect(img.data.length).toBe(img.width * img.height * 4);
    expect(at(img, 2, 1.5)).toEqual([255, 0, 0, 255]);
    expect(at(img, 5, 1.5)).toEqual([255, 255, 255, 255]);          // between the two fills: paper
    expect(at(img, 6.5, 2)).toEqual([0, 0, 255, 255]);
    expect(at(img, 8, 2)).toEqual([255, 255, 255, 255]);            // the hole
    expect(at(img, 5, 5)[0]).toBeLessThan(40);                      // on the line
    expect(at(img, 5, 5.4)).toEqual([255, 255, 255, 255]);
    expect(inked(img, 0, 6, 2.2, 6.3)).toBeGreaterThan(40);         // the text's strokes
    expect(inked(img, 5, 6, 10, 6.3)).toBe(0);                      // and nothing beside it
  });

  it("writes every character it is given: letters, digits, umlauts, and a box for the unknown", () => {
    for (const text of ["ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz", "0123456789", "Küche ÄÖÜ ß m² 45° walls/w3", "日本"]) {
      const sheet = new Sheet({ scale: 100 });
      sheet.main.text(text, [0, 0], { size: 3 });
      const img = rasterizeSheet(sheet, { width: 600 });
      let dark = 0;
      for (let i = 0; i < img.data.length; i += 4) if (img.data[i] < 128) dark++;
      expect(dark, text).toBeGreaterThan(text.length * 4);
    }
  });

  it("dashes a dashed line and keeps the height under maxHeight", () => {
    const sheet = new Sheet({ scale: 100 });
    sheet.main.polyline([[0, 0], [0, 30]], { dash: "dashed", weight: 2, color: "#000000" });
    sheet.main.polyline([[2, 0], [2, 30]], { weight: 2, color: "#000000" });
    const img = rasterizeSheet(sheet, { width: 1000, maxHeight: 900 });
    expect(img.height).toBeLessThanOrEqual(900);
    const column = (x: number) => { let n = 0; for (let y = 0; y <= 30; y += 0.02) if (at(img, x, y)[0] < 128) n++; return n; };
    const solid = column(2), dashed = column(0);
    expect(solid).toBeGreaterThan(1400);
    expect(dashed / solid).toBeGreaterThan(0.5);                   // 3 mm dashes, 1.5 mm gaps
    expect(dashed / solid).toBeLessThan(0.8);
  });
});

describe("sheet.toPNG", () => {
  it("is a PNG file whose pixels are the raster's", async () => {
    const sheet = new Sheet({ scale: 50 });
    sheet.main.rect(0, 0, 2, 1, { fill: "#cfe2f2" });
    sheet.main.text("A", [1, 0.5], { align: "center", baseline: "middle" });
    const png = await sheet.toPNG({ width: 300 });
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(String.fromCharCode(...png.subarray(12, 16))).toBe("IHDR");
    const width = view.getUint32(16), height = view.getUint32(20);
    const img = rasterizeSheet(sheet, { width: 300 });
    expect([width, height, png[24], png[25]]).toEqual([img.width, img.height, 8, 2]);
    // The IDAT chunk inflates to the rows: a filter byte, then RGB.
    const length = view.getUint32(33);
    expect(String.fromCharCode(...png.subarray(37, 41))).toBe("IDAT");
    const raw = new Uint8Array(await new Response(new Blob([png.slice(41, 41 + length) as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
    expect(raw.length).toBe(height * (1 + width * 3));
    const y = Math.floor(height / 2), x = Math.floor(width / 4);
    expect([...raw.subarray(y * (1 + width * 3) + 1 + x * 3, y * (1 + width * 3) + 4 + x * 3)]).toEqual([...img.data.subarray((y * width + x) * 4, (y * width + x) * 4 + 3)]);
    expect(String.fromCharCode(...png.subarray(png.length - 8, png.length - 4))).toBe("IEND");
  });

  it("packs a drawing small enough to hand to an agent", async () => {
    const png = await encodePNG(rasterizeSheet(new Sheet({ scale: 100 }).main.rect(0, 0, 10, 8, { fill: "#f1f1f1" }).sheetRef, { width: 1400 }));
    expect(png.length).toBeLessThan(60_000);
  });
});
