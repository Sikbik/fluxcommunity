#!/usr/bin/env node
// Turns the raw generations (assets-src/raw/<id>.png) into shippable art:
//   web/public/art/<id>.webp (always) and <id>.avif (only where it is meaningfully smaller),
// then rewrites web/src/content/art.ts.
//
//   node scripts/optimize-art.mjs                 every piece that has a raw file
//   node scripts/optimize-art.mjs --only tier-cumulus,gateway-cloud
//   node scripts/optimize-art.mjs --no-avif
//   node scripts/optimize-art.mjs --report        print the table only (reads what is on disk)
//
// Per piece (see assets-src/art-spec.mjs):
//   1. crop to the target aspect (centre), resize with Lanczos to the target size
//   2. crush the near-black floor, then multiply by a smooth edge mask so the outer ring is exactly
//      #000 (this is what makes mix-blend-mode: screen and additive blending seamless)
//   3. sprites: derive alpha from luminance (colour is un-premultiplied), or grayscale for dirt
//   4. WebP at quality 86 (stepping down only if the byte budget demands it); AVIF at the smallest size
//      whose DSSIM is no worse than the WebP's, kept only if it is at least 15 percent smaller
//   5. measure corners, average colour, sizes; write the manifest
//
// Needs ImageMagick (`magick`) and `avifenc` on PATH.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PIECES } from '../../assets-src/art-spec.mjs';
import { manifestJson, repoRoot, webRoot, writeArtManifest } from './art-manifest.mjs';

const rawDir = join(repoRoot, 'assets-src', 'raw');
const outDir = join(webRoot, 'public', 'art');
const srcOnlyDir = join(repoRoot, 'assets-src');
const DEFAULT_MAX_KB = 120;
const WEBP_START_Q = 86;
const AVIF_MIN_SAVING = 0.85;

function parseArgs(argv) {
  const o = { only: null, avif: true, report: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') o.only = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--no-avif') o.avif = false;
    else if (a === '--report') o.report = true;
    else {
      console.error(`unknown option ${a}`);
      process.exit(2);
    }
  }
  return o;
}

const mg = (args) => execFileSync('magick', args, { maxBuffer: 256 * 1024 * 1024 });
const mgText = (args) => mg(args).toString('utf8').trim();

function dims(file) {
  const [w, h] = mgText(['identify', '-format', '%w %h', file]).split(' ').map(Number);
  return { w, h };
}

/** Row (0-based) with the highest mean luminance, to centre thin horizontal subjects such as a streak. */
function brightestRow(raw, rh) {
  const txt = mgText([raw, '-colorspace', 'Gray', '-scale', `1x${rh}!`, '-depth', '8', 'txt:-']);
  let best = 0;
  let bestV = -1;
  for (const line of txt.split('\n')) {
    const m = line.match(/^0,(\d+):\s*\((\d+)/);
    if (m && Number(m[2]) > bestV) {
      bestV = Number(m[2]);
      best = Number(m[1]);
    }
  }
  return best;
}

/** Build the master PNG (final pixels, lossless) for a piece. */
function buildMaster(piece, raw, master, tmp) {
  const { w: rw, h: rh } = dims(raw);
  const aspect = piece.w / piece.h;
  let cw = rw;
  let ch = Math.round(rw / aspect);
  if (ch > rh) {
    ch = rh;
    cw = Math.round(rh * aspect);
  }
  const post = piece.post ?? {};
  const black = post.black ?? 1.2; // percent of full scale crushed to 0
  const fx = post.featherX ?? post.feather ?? 0.075; // fraction of width
  const fy = post.featherY ?? post.feather ?? 0.075; // fraction of height
  const cx = Math.round((rw - cw) / 2);
  let cy = Math.round((rh - ch) / 2);
  if (post.centerBrightRow) {
    cy = Math.max(0, Math.min(rh - ch, brightestRow(raw, rh) - Math.round(ch / 2)));
  }

  const steps = [
    raw,
    '-crop',
    `${cw}x${ch}+${cx}+${cy}`,
    '+repage',
    '-filter',
    'Lanczos',
    '-resize',
    `${piece.w}x${piece.h}!`,
    '-level',
    `${black}%,100%`,
  ];

  // Smooth edge mask: 1 inside, easing to exactly 0 on the outer pixel ring. Built at quarter size
  // (the function is smooth) and scaled up. A feather of 0 means "leave the edges alone".
  if (fx > 0 && fy > 0) {
    const maskFile = join(tmp, 'mask.png');
    const mw = Math.max(2, Math.round(piece.w / 4));
    const mh = Math.max(2, Math.round(piece.h / 4));
    const fpx = Math.max(1, (fx * piece.w) / 4);
    const fpy = Math.max(1, (fy * piece.h) / 4);
    mg([
      '-size',
      `${mw}x${mh}`,
      'xc:white',
      '-fx',
      `dx=min(i,w-1-i)/${fpx}; dy=min(j,h-1-j)/${fpy}; dist=min(dx,dy); tt=min(dist,1); tt*tt*(3-2*tt)`,
      '-filter',
      'Triangle',
      '-resize',
      `${piece.w}x${piece.h}!`,
      '-colorspace',
      'Gray',
      maskFile,
    ]);
    steps.push(maskFile, '-compose', 'multiply', '-composite');
  }
  if (post.gray) steps.push('-colorspace', 'Gray', '-colorspace', 'sRGB');
  steps.push('-strip', master);
  mg(steps);

  if (post.alpha) {
    // alpha = brightest channel; colour = original / alpha, so compositing over black reproduces the
    // original and compositing over anything else behaves like added light.
    const alphaFile = join(tmp, 'alpha.png');
    const colourFile = join(tmp, 'colour.png');
    mg([master, '-separate', '-evaluate-sequence', 'max', '-colorspace', 'Gray', alphaFile]);
    mg([master, alphaFile, '-fx', 'u/max(v,0.02)', '-clamp', colourFile]);
    mg([colourFile, alphaFile, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', '-strip', master]);
  }
}

function encodeWebp(master, out, maxBytes, hasAlpha) {
  let best = null;
  for (let q = WEBP_START_Q; q >= 40; q -= 2) {
    const args = [
      master,
      '-define',
      'webp:method=6',
      '-define',
      'webp:use-sharp-yuv=true',
      '-define',
      'webp:sns-strength=80',
      '-quality',
      String(q),
    ];
    if (hasAlpha) args.push('-define', 'webp:alpha-quality=92');
    args.push(out);
    mg(args);
    const size = statSync(out).size;
    if (size <= maxBytes) {
      best = { q, size };
      break;
    }
  }
  if (!best) throw new Error(`cannot fit ${out} under ${maxBytes} bytes`);
  return best;
}

/** Normalised DSSIM between two images (0 is identical, lower is better). */
function dssim(a, b) {
  const r = spawnSync('magick', ['compare', '-metric', 'DSSIM', a, b, 'null:'], { encoding: 'utf8' });
  const m = String(r.stderr).match(/\(([\d.eE+-]+)\)/);
  return m ? Number.parseFloat(m[1]) : Number.POSITIVE_INFINITY;
}

function encodeAvif(master, out, dssimTarget, tmp) {
  // Search from low quality upward: the first quality that is as good as the WebP is the smallest.
  for (let q = 36; q <= 92; q += 4) {
    const r = spawnSync('avifenc', ['-q', String(q), '-s', '4', '-j', '4', '--yuv', '444', master, out], {
      encoding: 'utf8',
    });
    if (r.status !== 0) throw new Error(`avifenc failed: ${r.stderr}`);
    const dec = join(tmp, 'avif-dec.png');
    mg([out, dec]);
    const d = dssim(master, dec);
    if (d <= dssimTarget) return { q, size: statSync(out).size, dssim: d };
  }
  return null;
}

function measure(master) {
  const { w, h } = dims(master);
  const k = Math.max(8, Math.round(Math.min(w, h) * 0.03));
  const corners = [
    `${k}x${k}+0+0`,
    `${k}x${k}+${w - k}+0`,
    `${k}x${k}+0+${h - k}`,
    `${k}x${k}+${w - k}+${h - k}`,
  ];
  let cornerMax = 0;
  for (const g of corners) {
    // Over black, so alpha pieces are measured as they will look on the page.
    const v = Number(
      mgText([
        master,
        '-background',
        'black',
        '-alpha',
        'remove',
        '-crop',
        g,
        '+repage',
        '-colorspace',
        'Gray',
        '-format',
        '%[fx:maxima*255]',
        'info:',
      ]),
    );
    cornerMax = Math.max(cornerMax, v);
  }
  // Outer 1 px ring (all four sides).
  const ring = Number(
    mgText([
      master,
      '-background',
      'black',
      '-alpha',
      'remove',
      '-colorspace',
      'Gray',
      '(',
      '+clone',
      '-crop',
      `${w}x1+0+0`,
      '+repage',
      ')',
      '(',
      '-clone',
      '0',
      '-crop',
      `${w}x1+0+${h - 1}`,
      '+repage',
      ')',
      '(',
      '-clone',
      '0',
      '-crop',
      `1x${h}+0+0`,
      '+repage',
      '-rotate',
      '90',
      ')',
      '(',
      '-clone',
      '0',
      '-crop',
      `1x${h}+${w - 1}+0`,
      '+repage',
      '-rotate',
      '90',
      ')',
      '-delete',
      '0',
      '-append',
      '-format',
      '%[fx:maxima*255]',
      'info:',
    ]),
  );
  const avg = mgText([
    master,
    '-background',
    'black',
    '-alpha',
    'remove',
    '-resize',
    '1x1!',
    '-depth',
    '8',
    '-format',
    '#%[hex:u.p{0,0}]',
    'info:',
  ]).toLowerCase();
  // Bounding box of everything brighter than 12 percent luminance, as fractions of the frame:
  // the safe area for cropping and positioning.
  const trim = mgText([
    master,
    '-background',
    'black',
    '-alpha',
    'remove',
    '-colorspace',
    'Gray',
    '-threshold',
    '12%',
    '-format',
    '%@',
    'info:',
  ]);
  const t = trim.match(/^(\d+)x(\d+)\+(\d+)\+(\d+)$/);
  const f2 = (v) => Math.round(v * 100) / 100;
  const box = t
    ? [
        f2(Number(t[3]) / w),
        f2(Number(t[4]) / h),
        f2((Number(t[3]) + Number(t[1])) / w),
        f2((Number(t[4]) + Number(t[2])) / h),
      ]
    : [0, 0, 1, 1];
  return { cornerMax, ring, avg: avg.slice(0, 7), box };
}

const o = parseArgs(process.argv.slice(2));

if (o.report) {
  const m = JSON.parse(readFileSync(manifestJson, 'utf8'));
  console.table(
    m.art.map((a) => ({ id: a.id, size: `${a.width}x${a.height}`, webpKB: a.webpKB, avifKB: a.avifKB })),
  );
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'flux-art-'));
const previous = existsSync(manifestJson) ? JSON.parse(readFileSync(manifestJson, 'utf8')).art : [];
const byId = new Map(previous.map((a) => [a.id, a]));
const rows = [];

try {
  for (const piece of PIECES) {
    if (o.only && !o.only.includes(piece.id)) continue;
    const raw = join(rawDir, `${piece.id}.png`);
    if (!existsSync(raw)) {
      console.log(`skip  ${piece.id} (no raw)`);
      continue;
    }
    const master = join(tmp, `${piece.id}.png`);
    buildMaster(piece, raw, master, tmp);
    const hasAlpha = !!piece.post?.alpha;
    const maxBytes = (piece.maxKB ?? DEFAULT_MAX_KB) * 1024;
    const shipped = piece.ship !== false;
    const webpOut = shipped ? join(outDir, `${piece.id}.webp`) : join(srcOnlyDir, `${piece.id}.webp`);
    const webp = encodeWebp(master, webpOut, maxBytes, hasAlpha);

    let avifInfo = null;
    const avifOut = join(outDir, `${piece.id}.avif`);
    if (o.avif && shipped) {
      const webpPng = join(tmp, 'webp-dec.png');
      mg([webpOut, webpPng]);
      avifInfo = encodeAvif(master, avifOut, dssim(master, webpPng), tmp);
      if (!avifInfo || avifInfo.size > webp.size * AVIF_MIN_SAVING || avifInfo.size > maxBytes) {
        rmSync(avifOut, { force: true });
        avifInfo = null;
      }
    } else if (shipped) {
      rmSync(avifOut, { force: true });
    }

    const m = measure(master);
    const entry = {
      id: piece.id,
      group: piece.group,
      src: `/art/${piece.id}.webp`,
      ...(avifInfo ? { avif: `/art/${piece.id}.avif` } : {}),
      width: piece.w,
      height: piece.h,
      avg: m.avg,
      box: m.box,
      ...(piece.post?.alpha ? { alpha: true } : {}),
      alt: piece.alt,
      blend: piece.blend,
      webpKB: Number((webp.size / 1024).toFixed(1)),
      webpQ: webp.q,
      ...(avifInfo ? { avifKB: Number((avifInfo.size / 1024).toFixed(1)), avifQ: avifInfo.q } : {}),
      cornerMax: m.cornerMax,
      ringMax: m.ring,
      shipped,
    };
    byId.set(piece.id, entry);
    rows.push(entry);
    console.log(
      `ok    ${piece.id.padEnd(18)} ${piece.w}x${piece.h}  webp ${entry.webpKB} KB (q${webp.q})` +
        `${avifInfo ? `  avif ${entry.avifKB} KB (q${avifInfo.q})` : '  no avif'}  corner<=${m.cornerMax} ring<=${m.ring}  avg ${m.avg}`,
    );
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// Keep manifest order identical to the spec; the og backdrop is a build input, not site art.
const ordered = PIECES.map((p) => byId.get(p.id)).filter(Boolean);
writeFileSync(manifestJson, `${JSON.stringify({ art: ordered.filter((a) => a.shipped) }, null, 2)}\n`);
const r = writeArtManifest();
console.log(`\nart.ts updated: ${r.art} art entries, ${r.previews} previews`);
