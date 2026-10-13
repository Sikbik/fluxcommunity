#!/usr/bin/env node
// Derives RGBA twins of the emissive art in web/public/art, for use INSIDE translucent glass.
//
// Why: the shipped pieces are light on opaque #000 and need `mix-blend-mode: screen`. Screen only
// makes black vanish against an OPAQUE backdrop. Inside a glass Panel (a 62 percent fill over a
// blurred lattice) the backdrop is translucent, so the result has alpha 1: the frame shows as a
// darker, opaque box and the glass loses its see-through. Inside the page shell (`.page` has
// z-index 1) screen cannot reach the WebGL stage either. Real alpha has neither problem.
//
// Recipe (the same one optimize-art.mjs uses for the sprites): alpha is the brightest channel and
// the colour is divided by it, so compositing normally over black reproduces the original pixels,
// and over a lit backdrop it adds light the way screen would.
//
//   node web/src/sections/gateways/art/rgba/build.mjs            all pieces
//   node web/src/sections/gateways/art/rgba/build.mjs gateway-ai only these ids
//
// Needs ImageMagick (`magick`) and `avifenc` on PATH. Inputs are web/public/art/<id>.webp.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const artDir = resolve(here, '../../../../../public/art');

const IDS = [
  'gateway-cloud',
  'gateway-edge',
  'gateway-ai',
  'gateway-games',
  'gateway-docs',
  'gateway-explorer',
  'gateway-node',
  'gateway-site',
  'gateway-wallet',
  'play-tunnel',
  'play-controller',
];

const only = process.argv.slice(2);
const ids = only.length ? IDS.filter((id) => only.includes(id)) : IDS;
const mg = (args) => execFileSync('magick', args, { maxBuffer: 256 * 1024 * 1024 });
const kb = (file) => `${(statSync(file).size / 1024).toFixed(0)} KB`;

const tmp = mkdtempSync(join(tmpdir(), 'rgba-'));
try {
  for (const id of ids) {
    const input = join(artDir, `${id}.webp`);
    if (!existsSync(input)) {
      process.stderr.write(`missing ${input}\n`);
      continue;
    }
    const alpha = join(tmp, `${id}-a.png`);
    const colour = join(tmp, `${id}-c.png`);
    const rgba = join(tmp, `${id}.png`);
    mg([input, '-separate', '-evaluate-sequence', 'max', '-colorspace', 'Gray', alpha]);
    mg([input, alpha, '-fx', 'u/max(v,0.02)', '-clamp', colour]);
    mg([colour, alpha, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', '-strip', rgba]);

    const webp = join(here, `${id}.webp`);
    mg([
      rgba,
      '-define',
      'webp:alpha-quality=88',
      '-define',
      'webp:method=6',
      '-quality',
      '80',
      '-strip',
      webp,
    ]);
    const avif = join(here, `${id}.avif`);
    execFileSync(
      'avifenc',
      ['-q', '56', '--qalpha', '58', '-s', '4', '-j', 'all', '--ignore-icc', rgba, avif],
      { stdio: 'ignore' },
    );
    process.stdout.write(`${id}: webp ${kb(webp)}, avif ${kb(avif)}\n`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
