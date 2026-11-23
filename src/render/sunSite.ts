/**
 * The sun for a date, an hour and a place — what the viewer's sun menu sets beside its three
 * named suns (`renderer.setSunAt`). Pure: no scene, no DOM.
 */
import { SunPosition, type SunPositionResult } from "../core/solar/SunPosition";
import { Vec3 } from "../core/math/vectors";

/** A place, a date and an hour of the day for the sun (`renderer.setSunAt`). */
export interface SunSite {
  /** The place's name, if it is one of `SUN_PLACES` (shown in the sun menu). */
  place?: string;
  /** Latitude in degrees, north positive (Zurich: 47.37). */
  latitude: number;
  /** Longitude in degrees, east positive (Zurich: 8.55). */
  longitude: number;
  /** Hours ahead of UTC that `hour` is told in. Default: from the longitude (15° an hour). */
  timeZone?: number;
  /** The day, as "YYYY-MM-DD". */
  date: string;
  /** The hour of the day, 0 to 24, in the place's standard time (13.5 is 13:30). */
  hour: number;
  /**
   * Where north is in the model, as CAD tools' "true north": degrees clockwise from the
   * model's +Y axis (up on the plan) to north. 0 (the default): +Y is north, +X east.
   * 90: north points along +X, to the right on the plan.
   */
  north?: number;
}

/** A place the sun menu offers: where it is, and its standard time ahead of UTC. */
export interface SunPlace { name: string; latitude: number; longitude: number; timeZone: number }

/** The places the sun menu offers (standard time: no summer time). */
export const SUN_PLACES: readonly SunPlace[] = [
  { name: "Zurich", latitude: 47.37, longitude: 8.55, timeZone: 1 },
  { name: "Berlin", latitude: 52.52, longitude: 13.4, timeZone: 1 },
  { name: "Paris", latitude: 48.86, longitude: 2.35, timeZone: 1 },
  { name: "London", latitude: 51.51, longitude: -0.13, timeZone: 0 },
  { name: "Madrid", latitude: 40.42, longitude: -3.7, timeZone: 1 },
  { name: "Rome", latitude: 41.9, longitude: 12.5, timeZone: 1 },
  { name: "Stockholm", latitude: 59.33, longitude: 18.07, timeZone: 1 },
  { name: "Reykjavik", latitude: 64.13, longitude: -21.95, timeZone: 0 },
  { name: "Moscow", latitude: 55.76, longitude: 37.62, timeZone: 3 },
  { name: "Dubai", latitude: 25.27, longitude: 55.3, timeZone: 4 },
  { name: "Mumbai", latitude: 19.08, longitude: 72.88, timeZone: 5.5 },
  { name: "Singapore", latitude: 1.35, longitude: 103.82, timeZone: 8 },
  { name: "Beijing", latitude: 39.9, longitude: 116.41, timeZone: 8 },
  { name: "Tokyo", latitude: 35.68, longitude: 139.69, timeZone: 9 },
  { name: "Sydney", latitude: -33.87, longitude: 151.21, timeZone: 10 },
  { name: "Honolulu", latitude: 21.31, longitude: -157.86, timeZone: -10 },
  { name: "Anchorage", latitude: 61.22, longitude: -149.9, timeZone: -9 },
  { name: "San Francisco", latitude: 37.77, longitude: -122.42, timeZone: -8 },
  { name: "Mexico City", latitude: 19.43, longitude: -99.13, timeZone: -6 },
  { name: "Chicago", latitude: 41.88, longitude: -87.63, timeZone: -6 },
  { name: "New York", latitude: 40.71, longitude: -74.01, timeZone: -5 },
  { name: "Buenos Aires", latitude: -34.61, longitude: -58.38, timeZone: -3 },
  { name: "São Paulo", latitude: -23.55, longitude: -46.63, timeZone: -3 },
  { name: "Cape Town", latitude: -33.92, longitude: 18.42, timeZone: 2 },
];

/** The hours ahead of UTC a site's `hour` is told in: its own `timeZone`, else from the longitude. */
export function sunTimeZone(site: Pick<SunSite, "longitude" | "timeZone">): number {
  return site.timeZone ?? Math.round(site.longitude / 15);
}

/**
 * Where the sun stands for a site: altitude and azimuth (a compass bearing, from true north),
 * and the direction toward it in the model (Z-up), turned by the site's `north`.
 */
export function sunFor(site: SunSite): SunPositionResult {
  const [y, m, d] = site.date.split("-").map(Number);
  if (![y, m, d].every(Number.isFinite)) throw new Error(`sunFor: date "${site.date}" is not "YYYY-MM-DD"`);
  const utc = site.hour - sunTimeZone(site);
  const date = new Date(Date.UTC(y, m - 1, d, 0, Math.round(utc * 60)));   // minutes carry over midnight
  const sun = SunPosition.compute({ date, latitude: site.latitude, longitude: site.longitude });
  if (!site.north) return sun;
  // East and north of the compass, laid on the model's axes: north is `north`° clockwise from +Y.
  const a = site.north * Math.PI / 180, { x: e, y: n, z } = sun.direction;
  return { ...sun, direction: new Vec3(e * Math.cos(a) + n * Math.sin(a), n * Math.cos(a) - e * Math.sin(a), z) };
}

/** An hour of the day as "HH:MM" (13.5 → "13:30"). */
export function hhmm(hour: number): string {
  const min = Math.round(hour * 60);
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Today's date and the hour now, in a site's standard time. */
export function sunNow(site: Pick<SunSite, "longitude" | "timeZone">, now = new Date()): { date: string; hour: number } {
  const local = new Date(now.getTime() + sunTimeZone(site) * 3600_000);
  return { date: local.toISOString().slice(0, 10), hour: local.getUTCHours() + local.getUTCMinutes() / 60 };
}
