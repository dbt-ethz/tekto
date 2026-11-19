import { describe, expect, it } from "vitest";
import { hhmm, sunFor, sunNow, sunTimeZone, SUN_PLACES } from "../src/render/sunSite";

const deg = (r: number) => (r * 180) / Math.PI;
const zurich = { latitude: 47.37, longitude: 8.55, timeZone: 1 };

describe("the sun for a date and a place", () => {
  it("stands high in the south at midsummer noon in Zurich, and is down at night", () => {
    const noon = sunFor({ ...zurich, date: "2026-06-21", hour: 12.5 });
    expect(deg(noon.altitude)).toBeGreaterThan(65);
    expect(deg(noon.altitude)).toBeLessThan(67);
    expect(Math.abs(deg(noon.azimuth) - 180)).toBeLessThan(5);
    expect(noon.direction.z).toBeGreaterThan(0.9);
    expect(sunFor({ ...zurich, date: "2026-06-21", hour: 23 }).isDaytime).toBe(false);
  });

  it("is lower in winter, and in the east in the morning", () => {
    const winter = sunFor({ ...zurich, date: "2026-12-21", hour: 12.5 });
    expect(deg(winter.altitude)).toBeGreaterThan(18);
    expect(deg(winter.altitude)).toBeLessThan(20);
    expect(sunFor({ ...zurich, date: "2026-06-21", hour: 8 }).direction.x).toBeGreaterThan(0.5);   // +X is east
  });

  it("tells the hour in the place's own time, across midnight UTC too", () => {
    const tokyo = SUN_PLACES.find((p) => p.name === "Tokyo")!;
    const morning = sunFor({ ...tokyo, date: "2026-06-21", hour: 6 });      // 21:00 UTC the day before
    expect(morning.isDaytime).toBe(true);
    expect(morning.direction.x).toBeGreaterThan(0.5);
  });

  it("turns with the model's north: the compass stays, the direction in the model moves", () => {
    const site = { ...zurich, date: "2026-06-21", hour: 12.5 };
    const plain = sunFor(site), turned = sunFor({ ...site, north: 90 });   // north along +X
    expect(turned.azimuth).toBe(plain.azimuth);                              // still in the south
    expect(turned.altitude).toBe(plain.altitude);
    expect(plain.direction.y).toBeLessThan(-0.35);                           // south is −Y
    expect(turned.direction.x).toBeCloseTo(plain.direction.y, 6);            // south is now −X
    expect(turned.direction.y).toBeCloseTo(-plain.direction.x, 6);
    expect(turned.direction.z).toBe(plain.direction.z);
    const full = sunFor({ ...site, north: 360 });
    expect(full.direction.x).toBeCloseTo(plain.direction.x, 9);
  });

  it("takes the time zone from the longitude when none is given", () => {
    expect(sunTimeZone({ longitude: 8.55 })).toBe(1);
    expect(sunTimeZone({ longitude: -74 })).toBe(-5);
    expect(sunTimeZone({ longitude: 8.55, timeZone: 2 })).toBe(2);
  });

  it("rejects a date that is not YYYY-MM-DD", () => {
    expect(() => sunFor({ ...zurich, date: "midsummer", hour: 12 })).toThrow(/YYYY-MM-DD/);
  });

  it("formats hours, and reads now in the place's time", () => {
    expect(hhmm(13.5)).toBe("13:30");
    expect(hhmm(0)).toBe("00:00");
    expect(hhmm(9.25)).toBe("09:15");
    expect(sunNow({ longitude: 139.69, timeZone: 9 }, new Date(Date.UTC(2026, 5, 20, 21, 30)))).toEqual({ date: "2026-06-21", hour: 6.5 });
  });
});
