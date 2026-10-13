import { describe, expect, it } from 'vitest';
import {
  CENTRE_LAT,
  degPerPx,
  fitBounds,
  formatCoordinates,
  graticule,
  graticuleLabel,
  latToY,
  lonToX,
  MAX_LAT,
  MIN_LAT,
  makeView,
  project,
  unproject,
} from './projection';

describe('fitBounds', () => {
  it('always spans the full longitude', () => {
    const b = fitBounds(800, 320);
    expect(b.lonMin).toBe(-180);
    expect(b.lonMax).toBe(180);
  });

  it('keeps degrees square: same pixels per degree on both axes', () => {
    const view = makeView(800, 320);
    const lonSpan = view.bounds.lonMax - view.bounds.lonMin;
    const latSpan = view.bounds.latMax - view.bounds.latMin;
    expect(view.width / lonSpan).toBeCloseTo(view.height / latSpan, 6);
  });

  it('centres on the inhabited latitude when it fits', () => {
    const b = fitBounds(800, 320);
    expect((b.latMin + b.latMax) / 2).toBeCloseTo(CENTRE_LAT, 6);
  });

  it('shows more of the poles in a taller box and trims them in a shorter one', () => {
    const tall = fitBounds(800, 380);
    const short = fitBounds(800, 240);
    expect(tall.latMax - tall.latMin).toBeGreaterThan(
      fitBounds(800, 320).latMax - fitBounds(800, 320).latMin,
    );
    expect(short.latMax - short.latMin).toBeLessThan(fitBounds(800, 320).latMax - fitBounds(800, 320).latMin);
  });

  it('never leaves the usable latitude band, however tall the box', () => {
    const b = fitBounds(300, 3000);
    expect(b.latMax).toBeLessThanOrEqual(MAX_LAT);
    expect(b.latMin).toBeGreaterThanOrEqual(MIN_LAT);
  });

  it('survives a zero sized box', () => {
    const b = fitBounds(0, 0);
    expect(Number.isFinite(b.latMin)).toBe(true);
    expect(Number.isFinite(b.latMax)).toBe(true);
  });
});

describe('project and unproject', () => {
  const view = makeView(720, 280);

  it('puts the west edge at x 0, the east edge at the full width and the top at y 0', () => {
    expect(lonToX(-180, view)).toBe(0);
    expect(lonToX(180, view)).toBeCloseTo(720, 6);
    expect(latToY(view.bounds.latMax, view)).toBeCloseTo(0, 6);
    expect(latToY(view.bounds.latMin, view)).toBeCloseTo(280, 6);
  });

  it('puts the prime meridian in the middle', () => {
    expect(lonToX(0, view)).toBeCloseTo(360, 6);
  });

  it('round trips', () => {
    for (const [lon, lat] of [
      [8.7, 50.1],
      [-122.4, 37.8],
      [151.2, -33.9],
    ] as const) {
      const p = project(lon, lat, view);
      const back = unproject(p.x, p.y, view);
      expect(back.lon).toBeCloseTo(lon, 6);
      expect(back.lat).toBeCloseTo(lat, 6);
    }
  });

  it('puts north above south', () => {
    expect(latToY(60, view)).toBeLessThan(latToY(-20, view));
  });

  it('degPerPx is the inverse scale', () => {
    expect(degPerPx(view) * view.width).toBeCloseTo(360, 6);
  });
});

describe('graticule', () => {
  it('lists the meridians and parallels inside the view with the origin lines marked', () => {
    const g = graticule(makeView(800, 320), 30);
    expect(g.lons.map((l) => l.at)).toContain(0);
    expect(g.lons.find((l) => l.at === 0)?.major).toBe(true);
    expect(g.lons.filter((l) => l.major)).toHaveLength(1);
    expect(g.lats.find((l) => l.at === 0)?.major).toBe(true);
    expect(g.lons[0]?.at).toBe(-180);
    expect(g.lons.at(-1)?.at).toBe(180);
  });

  it('labels with hemisphere letters', () => {
    expect(graticuleLabel(0, 'lon')).toBe('0');
    expect(graticuleLabel(-120, 'lon')).toBe('120W');
    expect(graticuleLabel(60, 'lon')).toBe('60E');
    expect(graticuleLabel(30, 'lat')).toBe('30N');
    expect(graticuleLabel(-30, 'lat')).toBe('30S');
  });
});

describe('formatCoordinates', () => {
  it('prints degrees with hemisphere letters', () => {
    expect(formatCoordinates(50.16, 8.49)).toBe('50.16°N 8.49°E');
    expect(formatCoordinates(-33.9, -70.65)).toBe('33.90°S 70.65°W');
  });
});
