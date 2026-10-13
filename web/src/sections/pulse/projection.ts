/**
 * Equirectangular projection for the world map, and the view maths around it. Longitude spans the
 * full width; the latitude span follows from the box, so the map is never stretched: a taller box
 * simply shows more of the poles and a shorter one trims them. Framework-free.
 */

export interface GeoBounds {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}

export interface MapView {
  /** CSS px. */
  width: number;
  height: number;
  bounds: GeoBounds;
}

/** The latitude the view is centred on: the middle of the inhabited world, a little north of the equator. */
export const CENTRE_LAT = 14;
/** The poles are never worth showing: the mask is fine there but no node lives there. */
export const MAX_LAT = 86;
export const MIN_LAT = -66;

/**
 * The bounds for a box of the given size: the full 360 degrees of longitude and as much latitude as
 * the box's proportions allow, centred on `CENTRE_LAT` and kept inside the usable band. Always square
 * in degrees (same px per degree on both axes).
 */
export function fitBounds(width: number, height: number, centreLat = CENTRE_LAT): GeoBounds {
  const pxPerDeg = width > 0 ? width / 360 : 1;
  let span = height > 0 ? height / pxPerDeg : 144;
  span = Math.min(span, MAX_LAT - MIN_LAT);
  let latMax = centreLat + span / 2;
  let latMin = centreLat - span / 2;
  if (latMax > MAX_LAT) {
    latMin -= latMax - MAX_LAT;
    latMax = MAX_LAT;
  }
  if (latMin < MIN_LAT) {
    latMax += MIN_LAT - latMin;
    latMin = MIN_LAT;
  }
  return { lonMin: -180, lonMax: 180, latMin, latMax: Math.min(MAX_LAT, latMax) };
}

export function makeView(width: number, height: number): MapView {
  return { width, height, bounds: fitBounds(width, height) };
}

export function lonToX(lon: number, view: MapView): number {
  const { lonMin, lonMax } = view.bounds;
  return ((lon - lonMin) / (lonMax - lonMin)) * view.width;
}

export function latToY(lat: number, view: MapView): number {
  const { latMin, latMax } = view.bounds;
  return ((latMax - lat) / (latMax - latMin)) * view.height;
}

export function project(lon: number, lat: number, view: MapView): { x: number; y: number } {
  return { x: lonToX(lon, view), y: latToY(lat, view) };
}

export function unproject(x: number, y: number, view: MapView): { lon: number; lat: number } {
  const { lonMin, lonMax, latMin, latMax } = view.bounds;
  return {
    lon: lonMin + (x / view.width) * (lonMax - lonMin),
    lat: latMax - (y / view.height) * (latMax - latMin),
  };
}

/** Degrees per CSS pixel on both axes (they are equal by construction). */
export function degPerPx(view: MapView): number {
  return (view.bounds.lonMax - view.bounds.lonMin) / view.width;
}

export interface GraticuleLine {
  /** Degrees. */
  at: number;
  /** The equator and the prime meridian are drawn stronger. */
  major: boolean;
}

/** Meridians and parallels every `step` degrees that fall inside the view. */
export function graticule(view: MapView, step = 30): { lons: GraticuleLine[]; lats: GraticuleLine[] } {
  const lons: GraticuleLine[] = [];
  const lats: GraticuleLine[] = [];
  const { lonMin, lonMax, latMin, latMax } = view.bounds;
  for (let lon = Math.ceil(lonMin / step) * step; lon <= lonMax; lon += step) {
    lons.push({ at: lon, major: lon === 0 });
  }
  for (let lat = Math.ceil(latMin / step) * step; lat <= latMax; lat += step) {
    lats.push({ at: lat, major: lat === 0 });
  }
  return { lons, lats };
}

/** "30N", "0", "120W": the compact label a graticule tick carries. */
export function graticuleLabel(deg: number, axis: 'lon' | 'lat'): string {
  if (deg === 0) return '0';
  const hemi = axis === 'lon' ? (deg > 0 ? 'E' : 'W') : deg > 0 ? 'N' : 'S';
  return `${Math.abs(deg)}${hemi}`;
}

/** "50.16°N 8.49°E", for a tooltip. */
export function formatCoordinates(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns} ${Math.abs(lon).toFixed(2)}°${ew}`;
}
