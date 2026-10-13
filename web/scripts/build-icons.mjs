#!/usr/bin/env node
// Builds the raster icon set from the official round mark in web/public/favicon.svg
// (the Flux symbol, white on Flux Blue Wave). favicon.svg itself is never touched.
//
//   node scripts/build-icons.mjs
//
// Output (all in web/public):
//   favicon.ico              16, 32 and 48 px frames
//   apple-touch-icon.png     180 px, the mark on solid black (iOS rounds the corners itself)
//   icon-192.png             192 px, purpose "any", transparent
//   icon-512.png             512 px, purpose "any", transparent
//   icon-maskable-512.png    512 px, purpose "maskable": full-bleed black, mark inside the safe zone
//
// Needs rsvg-convert and ImageMagick (`magick`).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webRoot } from './art-manifest.mjs';

const pub = join(webRoot, 'public');
const svg = join(pub, 'favicon.svg');
if (!existsSync(svg)) {
  console.error(`missing ${svg}`);
  process.exit(2);
}

const tmp = mkdtempSync(join(tmpdir(), 'flux-icons-'));
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

/** Render the round mark at `size` px into a PNG with transparency. */
function mark(size, out) {
  run('rsvg-convert', ['-w', String(size), '-h', String(size), svg, '-o', out]);
}

/** The mark scaled to `ratio` of the canvas, centred on a `size` square of `bg` ('none' = transparent). */
function onCanvas(size, ratio, bg, out) {
  const m = join(tmp, `m-${size}-${ratio}.png`);
  mark(Math.round(size * ratio), m);
  run('magick', [
    '-size',
    `${size}x${size}`,
    `xc:${bg}`,
    m,
    '-gravity',
    'center',
    '-composite',
    '-depth',
    '8',
    '-strip',
    out,
  ]);
}

try {
  // favicon.ico: render each frame at its own size so the small ones stay crisp.
  const frames = [16, 32, 48].map((s) => {
    const f = join(tmp, `ico-${s}.png`);
    mark(s, f);
    return f;
  });
  run('magick', [...frames, join(pub, 'favicon.ico')]);

  onCanvas(180, 0.8, '#000000', join(pub, 'apple-touch-icon.png'));
  onCanvas(192, 0.96, 'none', join(pub, 'icon-192.png'));
  onCanvas(512, 0.96, 'none', join(pub, 'icon-512.png'));
  // Maskable: Android may crop to a circle of 80 percent of the width, so keep the mark inside 70 percent.
  onCanvas(512, 0.7, '#000000', join(pub, 'icon-maskable-512.png'));
  console.log('icons written to web/public');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
