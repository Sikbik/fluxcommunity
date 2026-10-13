import { describe, expect, it } from 'vitest';
import { ART } from '@/content/art';
import { boxCentre, boxHeight, boxWidth, fitArt, pct, safeDrift } from './fit';

const cloud = ART['gateway-cloud'];
const site = ART['gateway-site'];
const tunnel = ART['play-tunnel'];

describe('fitArt', () => {
  it('fits the content box inside a wide region, limited by height', () => {
    const fit = fitArt({ box: cloud.box, aspect: 1, regionW: 600, regionH: 300, fill: 0.9 });
    // The content must be 90 percent of the height (the limiting axis) and no wider than the region.
    expect(fit.content.height).toBeCloseTo(300 * 0.9, 3);
    expect(fit.content.width).toBeLessThanOrEqual(600 * 0.9 + 1e-6);
    // Centred by default.
    expect(fit.content.left + fit.content.width / 2).toBeCloseTo(300, 3);
    expect(fit.content.top + fit.content.height / 2).toBeCloseTo(150, 3);
  });

  it('fits a tall region by width', () => {
    const fit = fitArt({ box: cloud.box, aspect: 1, regionW: 200, regionH: 800, fill: 1 });
    expect(fit.content.width).toBeCloseTo(200, 3);
    expect(fit.content.height).toBeLessThanOrEqual(800);
  });

  it('keeps the frame aspect', () => {
    const fit = fitArt({ box: tunnel.box, aspect: tunnel.width / tunnel.height, regionW: 700, regionH: 500 });
    expect(fit.frame.width / fit.frame.height).toBeCloseTo(1600 / 900, 4);
  });

  it('places the content centre on the anchor', () => {
    const fit = fitArt({ box: cloud.box, aspect: 1, regionW: 400, regionH: 400, anchor: [0.75, 0.4] });
    expect(fit.content.left + fit.content.width / 2).toBeCloseTo(300, 3);
    expect(fit.content.top + fit.content.height / 2).toBeCloseTo(160, 3);
  });

  it('reports the content centre in frame px as the transform origin', () => {
    const fit = fitArt({ box: cloud.box, aspect: 1, regionW: 400, regionH: 400 });
    const c = boxCentre(cloud.box);
    expect(fit.origin.x).toBeCloseTo(c.x * fit.frame.width, 6);
    expect(fit.origin.y).toBeCloseTo(c.y * fit.frame.height, 6);
  });

  it('cover mode makes the content box cover the region on both axes', () => {
    // The site piece is a wide strip: covering a 600x200 region needs the strip to span the width.
    const fit = fitArt({ box: site.box, aspect: 1, regionW: 600, regionH: 200, fill: 1, mode: 'cover' });
    expect(fit.content.width).toBeGreaterThanOrEqual(600 - 1e-6);
    expect(fit.content.height).toBeGreaterThanOrEqual(200 - 1e-6);
    // Contain on the same input is smaller.
    const contain = fitArt({ box: site.box, aspect: 1, regionW: 600, regionH: 200, fill: 1 });
    expect(contain.frame.width).toBeLessThan(fit.frame.width);
  });

  it('applies the scale multiplier after fitting', () => {
    const base = fitArt({ box: cloud.box, aspect: 1, regionW: 400, regionH: 400 });
    const bigger = fitArt({ box: cloud.box, aspect: 1, regionW: 400, regionH: 400, scale: 1.25 });
    expect(bigger.frame.width).toBeCloseTo(base.frame.width * 1.25, 6);
  });

  it('tolerates degenerate input', () => {
    const fit = fitArt({ box: [0.5, 0.5, 0.5, 0.5], aspect: 0, regionW: 0, regionH: 0 });
    expect(Number.isFinite(fit.frame.width)).toBe(true);
    expect(Number.isFinite(fit.content.left)).toBe(true);
  });
});

describe('box helpers', () => {
  it('reads the manifest box', () => {
    expect(boxWidth(cloud.box)).toBeCloseTo(0.68, 6);
    expect(boxHeight(cloud.box)).toBeCloseTo(0.7, 6);
    expect(boxCentre(cloud.box).x).toBeCloseTo(0.48, 6);
  });
});

describe('safeDrift', () => {
  it('is capped at 4 percent of the frame by default', () => {
    const fit = fitArt({ box: cloud.box, aspect: 1, regionW: 800, regionH: 800, fill: 0.5 });
    const d = safeDrift({ fit, boundsW: 800, boundsH: 800 });
    expect(d.x).toBeCloseTo(0.04 * fit.frame.width, 6);
    expect(d.y).toBeCloseTo(0.04 * fit.frame.height, 6);
  });

  it('never lets the content leave the bounds', () => {
    // fill 1 leaves no room at all on the limiting axis.
    const fit = fitArt({ box: cloud.box, aspect: 1, regionW: 400, regionH: 400, fill: 1 });
    const d = safeDrift({ fit, boundsW: 400, boundsH: 400 });
    expect(d.y).toBeCloseTo(0, 6);
    expect(d.x).toBeGreaterThanOrEqual(0);
  });

  it('measures room against the bounds, not the region', () => {
    // Content sits on the right of a 400 wide tile: the right side has less room.
    const fit = fitArt({
      box: cloud.box,
      aspect: 1,
      regionW: 200,
      regionH: 300,
      fill: 0.8,
      anchor: [0.5, 0.5],
    });
    const left = safeDrift({ fit, boundsW: 400, boundsH: 300, regionLeft: 0 });
    const right = safeDrift({ fit, boundsW: 400, boundsH: 300, regionLeft: 200 });
    expect(left.x).toBeLessThanOrEqual(0.04 * fit.frame.width + 1e-9);
    expect(right.x).toBeLessThanOrEqual(0.04 * fit.frame.width + 1e-9);
    // Room on the outer side is what limits it: moving the region right shrinks the right gap.
    expect(right.x).toBeLessThanOrEqual(left.x + 1e-9);
  });

  it('bleed ignores the bounds', () => {
    const fit = fitArt({ box: site.box, aspect: 1, regionW: 600, regionH: 200, fill: 1, mode: 'cover' });
    const d = safeDrift({ fit, boundsW: 600, boundsH: 200, bleed: true });
    expect(d.x).toBeCloseTo(0.04 * fit.frame.width, 6);
  });
});

describe('pct', () => {
  it('formats fractions as percentages without noise', () => {
    expect(pct(0.5)).toBe('50%');
    expect(pct(0.123456)).toBe('12.35%');
    expect(pct(0)).toBe('0%');
  });
});
