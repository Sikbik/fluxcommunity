#!/usr/bin/env node
// Captures app and host previews for the site: web/public/previews/<id>.webp (960x600, under 70 KB).
//
//   node scripts/capture-previews.mjs                   every catalog app (except this site) and host with a URL
//   node scripts/capture-previews.mjs --only atlas,noxide
//   node scripts/capture-previews.mjs --list            print targets and exit
//   node scripts/capture-previews.mjs --wait 9000       settle delay for every page (ms)
//   node scripts/capture-previews.mjs --jobs 2          pages in parallel (default 3)
//   node scripts/capture-previews.mjs --prune           delete previews whose capture failed this run
//
// How: the system Chromium (WebGL on) at 1280x800, one fresh context per page. The page is loaded, the
// network is allowed to go idle, then a settle delay runs (longer when the page has a canvas) before a
// viewport-only screenshot, resized to 960x600 and encoded to WebP at the best quality under 70 KB.
//
// Rules: never log in, never click a consent banner, never submit anything. The script only loads
// pages and looks. A page that answers 4xx or 5xx, times out, or renders blank produces nothing; the UI
// then falls back to generated art. A previous good capture is kept unless --prune is given.
//
// The list of previews and their blurred loading placeholders (PREVIEW_LQIP) are written to
// web/src/content/art.ts on every run, for every preview on disk, so nothing else needs regenerating by hand.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { COMMUNITY_APPS, NODE_HOSTS } from '../../shared/catalog.ts';
import { previewsDir, repoRoot, writeArtManifest } from './art-manifest.mjs';

const VIEWPORT = { width: 1280, height: 800 };
const OUT = { width: 960, height: 600 };
const MAX_BYTES = 70 * 1024;
const NAV_TIMEOUT_MS = 25_000;
const IDLE_TIMEOUT_MS = 8_000;
const HARD_TIMEOUT_MS = 70_000;
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

function parseArgs(argv) {
  const o = { only: null, list: false, wait: null, jobs: 3, prune: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') o.only = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--list') o.list = true;
    else if (a === '--wait') o.wait = Number(argv[++i]);
    else if (a === '--jobs') o.jobs = Math.max(1, Math.min(4, Number(argv[++i])));
    else if (a === '--prune') o.prune = true;
    else {
      console.error(`unknown option ${a}`);
      process.exit(2);
    }
  }
  return o;
}

function targets() {
  const apps = COMMUNITY_APPS.filter((a) => !a.self && a.url).map((a) => ({
    id: a.id,
    name: a.name,
    url: a.url,
    kind: 'app',
  }));
  const hosts = NODE_HOSTS.filter((h) => h.url).map((h) => ({
    id: h.id,
    name: h.name,
    url: h.url,
    kind: 'host',
  }));
  return [...apps, ...hosts];
}

function findChrome() {
  return [
    process.env.CHROME_PATH,
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ]
    .filter(Boolean)
    .find((p) => existsSync(p));
}

/** Encode a PNG buffer to a 960x600 WebP, the highest quality that fits MAX_BYTES. */
function encode(png) {
  for (let quality = 92; quality >= 30; quality -= 4) {
    const r = spawnSync(
      'magick',
      [
        'png:-',
        '-filter',
        'Lanczos',
        '-resize',
        `${OUT.width}x${OUT.height}!`,
        '-strip',
        '-define',
        'webp:method=6',
        '-quality',
        String(quality),
        'webp:-',
      ],
      { input: png, maxBuffer: 64 * 1024 * 1024 },
    );
    if (r.status !== 0) throw new Error(`magick failed: ${String(r.stderr).slice(0, 200)}`);
    if (r.stdout.length <= MAX_BYTES) return { buf: r.stdout, quality };
  }
  throw new Error('could not fit under the byte budget');
}

/** Mean and standard deviation (0..1) of luminance, to catch blank pages. */
function stats(png) {
  const r = spawnSync(
    'magick',
    [
      'png:-',
      '-resize',
      '96x60!',
      '-colorspace',
      'Gray',
      '-format',
      '%[fx:mean] %[fx:standard_deviation]',
      'info:',
    ],
    { input: png },
  );
  const [mean, sd] = String(r.stdout).trim().split(' ').map(Number);
  return { mean, sd };
}

async function captureOnce(browser, t, settleMs) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'en-US',
    userAgent: UA,
  });
  const page = await context.newPage();
  try {
    const resp = await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    const status = resp ? resp.status() : 0;
    if (status >= 400) return { ok: false, status, note: `HTTP ${status}` };
    await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT_MS }).catch(() => {});
    const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas')).catch(() => false);
    await page.waitForTimeout(settleMs ?? (hasCanvas ? 7500 : 2500));
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, ...VIEWPORT } });
    const title = await page.title().catch(() => '');
    return { ok: true, status, png, hasCanvas, title };
  } finally {
    await context.close();
  }
}

async function capture(browser, t, o) {
  const started = Date.now();
  const run = async () => {
    let r = await captureOnce(browser, t, o.wait);
    if (r.ok) {
      const s = stats(r.png);
      // Blank or near-uniform: the page is probably still booting. Try once more, much longer.
      if (s.sd < 0.012) {
        const again = await captureOnce(browser, t, (o.wait ?? 3000) + 9000);
        if (again.ok) r = again;
      }
    }
    return r;
  };
  let r;
  try {
    r = await Promise.race([
      run(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('hard timeout')), HARD_TIMEOUT_MS)),
    ]);
  } catch (e) {
    return { ...t, ok: false, note: String(e.message).split('\n')[0].slice(0, 90), ms: Date.now() - started };
  }
  if (!r.ok) return { ...t, ok: false, status: r.status, note: r.note, ms: Date.now() - started };
  const s = stats(r.png);
  if (s.sd < 0.012) {
    return {
      ...t,
      ok: false,
      status: r.status,
      note: `blank (sd ${s.sd.toFixed(3)})`,
      ms: Date.now() - started,
    };
  }
  const { buf, quality } = encode(r.png);
  writeFileSync(join(previewsDir, `${t.id}.webp`), buf);
  return {
    ...t,
    ok: true,
    status: r.status,
    bytes: buf.length,
    quality,
    note: `${r.hasCanvas ? 'canvas ' : ''}${r.title.slice(0, 40)}`,
    ms: Date.now() - started,
  };
}

const o = parseArgs(process.argv.slice(2));
let list = targets();
if (o.only) list = list.filter((t) => o.only.includes(t.id));
if (o.list) {
  for (const t of list) console.log(`${t.id.padEnd(18)} ${t.kind.padEnd(5)} ${t.url}`);
  process.exit(0);
}
if (list.length === 0) {
  console.error('no matching targets');
  process.exit(2);
}

const executablePath = findChrome();
if (!executablePath) {
  console.error('no Chromium found; set CHROME_PATH');
  process.exit(2);
}
mkdirSync(previewsDir, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--use-gl=angle',
    '--use-angle=gl',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
  ],
});

console.log(`capturing ${list.length} page(s) at ${VIEWPORT.width}x${VIEWPORT.height}, ${o.jobs} at a time`);
const results = [];
const queue = [...list];
async function worker() {
  while (queue.length) {
    const t = queue.shift();
    const r = await capture(browser, t, o);
    results.push(r);
    const mark = r.ok ? 'ok  ' : 'FAIL';
    console.log(`${mark} ${t.id.padEnd(18)} ${r.ok ? `${(r.bytes / 1024).toFixed(1)} KB` : r.note}`);
  }
}
await Promise.all(Array.from({ length: Math.min(o.jobs, list.length) }, worker));
await browser.close();

if (o.prune) {
  for (const r of results) {
    const f = join(previewsDir, `${r.id}.webp`);
    if (!r.ok && existsSync(f)) {
      unlinkSync(f);
      console.log(`pruned ${r.id}`);
    }
  }
}

const order = new Map(list.map((t, i) => [t.id, i]));
results.sort((a, b) => order.get(a.id) - order.get(b.id));
console.log('\nid                 kind  result  http  KB     q   seconds  note');
for (const r of results) {
  const kept = !r.ok && existsSync(join(previewsDir, `${r.id}.webp`)) ? ' (previous kept)' : '';
  console.log(
    [
      r.id.padEnd(18),
      r.kind.padEnd(5),
      (r.ok ? 'ok' : 'FAIL').padEnd(7),
      String(r.status ?? '-').padEnd(5),
      (r.ok ? (r.bytes / 1024).toFixed(1) : '-').padEnd(6),
      String(r.ok ? r.quality : '-').padEnd(3),
      (r.ms / 1000).toFixed(0).padEnd(8),
      `${r.note ?? ''}${kept}`,
    ].join(' '),
  );
}
const m = writeArtManifest();
console.log(
  `\nart.ts updated: ${m.previews} preview(s) listed, ${m.placeholders} placeholder(s) regenerated`,
);
console.log(`failed: ${results.filter((r) => !r.ok).length}, ok: ${results.filter((r) => r.ok).length}`);
console.log(`repo: ${resolve(repoRoot)}`);
