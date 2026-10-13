#!/usr/bin/env node
// Screenshot and console-audit tool for the web app. Drives the system Chromium through
// playwright-core with WebGL enabled. Prints console errors, page errors and failed requests so a
// shot doubles as a smoke test.
//
//   node scripts/shot.mjs --url http://127.0.0.1:5173/ --out ../.shots/hero.png
//
// Options
//   --url <url>            page to open (required; add ?q=low etc. yourself)
//   --out <file.png>       output path (default ../.shots/shot.png)
//   --w <px> --h <px>      viewport (default 1440x900); --dpr <n> device scale (default 1)
//   --mobile               390x844, dpr 2, touch, mobile UA
//   --scroll <px>          scroll the window to this y before the shot
//   --section <id>         scroll to #<id> (document.getElementById) before the shot
//   --full                 full page screenshot
//   --wait <ms>            wait after load/scroll before shooting (default 1200)
//   --hover <selector>     hover an element first
//   --click <selector>     click an element first
//   --key <key>            press a key first (for example Control+K)
//   --eval <js>            run JS in the page before the shot; its result is printed
//   --reduced-motion       emulate prefers-reduced-motion: reduce
//   --no-webgl             launch with WebGL disabled
//   --sequence <n:ms>      take n shots, ms apart, suffixing the filename (-1, -2, ...)
//   --console              print all console messages, not only errors and warnings
//   --video <dir>          record a video of the session into <dir> (webm)
//   --headed               show the browser window
//
// Environment: CHROME_PATH overrides the browser executable.
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright-core';

function parse(argv) {
  const o = { w: 1440, h: 900, dpr: 1, wait: 1200, out: '../.shots/shot.png' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--url':
        o.url = next();
        break;
      case '--out':
        o.out = next();
        break;
      case '--w':
        o.w = Number(next());
        break;
      case '--h':
        o.h = Number(next());
        break;
      case '--dpr':
        o.dpr = Number(next());
        break;
      case '--mobile':
        o.mobile = true;
        break;
      case '--scroll':
        o.scroll = Number(next());
        break;
      case '--section':
        o.section = next();
        break;
      case '--full':
        o.full = true;
        break;
      case '--wait':
        o.wait = Number(next());
        break;
      case '--hover':
        o.hover = next();
        break;
      case '--click':
        o.click = next();
        break;
      case '--key':
        o.key = next();
        break;
      case '--eval':
        o.eval = next();
        break;
      case '--reduced-motion':
        o.reduced = true;
        break;
      case '--no-webgl':
        o.noWebgl = true;
        break;
      case '--sequence':
        o.sequence = next();
        break;
      case '--console':
        o.allConsole = true;
        break;
      case '--video':
        o.video = next();
        break;
      case '--headed':
        o.headed = true;
        break;
      default:
        console.error(`unknown option ${a}`);
        process.exit(2);
    }
  }
  return o;
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

const o = parse(process.argv.slice(2));
if (!o.url) {
  console.error('missing --url');
  process.exit(2);
}
if (o.mobile) {
  o.w = 390;
  o.h = 844;
  o.dpr = 2;
}

const executablePath = findChrome();
if (!executablePath) {
  console.error('no Chromium found; set CHROME_PATH');
  process.exit(2);
}

const args = ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'];
if (!o.noWebgl) args.push('--use-gl=angle', '--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist');
else args.push('--disable-gpu', '--disable-webgl', '--disable-3d-apis');

const browser = await chromium.launch({ executablePath, headless: !o.headed, args });
const context = await browser.newContext({
  viewport: { width: o.w, height: o.h },
  deviceScaleFactor: o.dpr,
  isMobile: !!o.mobile,
  hasTouch: !!o.mobile,
  reducedMotion: o.reduced ? 'reduce' : 'no-preference',
  colorScheme: 'dark',
  ...(o.video ? { recordVideo: { dir: resolve(o.video), size: { width: o.w, height: o.h } } } : {}),
});
const page = await context.newPage();

const problems = [];
page.on('console', (msg) => {
  const t = msg.type();
  if (o.allConsole || t === 'error' || t === 'warning') problems.push(`[console.${t}] ${msg.text()}`);
});
page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) =>
  problems.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText ?? ''}`),
);
page.on('response', (res) => {
  if (res.status() >= 400) problems.push(`[http ${res.status()}] ${res.url()}`);
});

await page.goto(o.url, { waitUntil: 'load', timeout: 60_000 });
await page.waitForTimeout(400);

if (o.section) {
  await page.evaluate((id) => document.getElementById(id)?.scrollIntoView({ block: 'start' }), o.section);
} else if (o.scroll != null) {
  await page.evaluate((y) => window.scrollTo(0, y), o.scroll);
}
if (o.key) await page.keyboard.press(o.key);
if (o.hover) await page.hover(o.hover, { timeout: 5000 }).catch((e) => problems.push(`[hover] ${e.message}`));
if (o.click) await page.click(o.click, { timeout: 5000 }).catch((e) => problems.push(`[click] ${e.message}`));
if (o.eval) {
  const result = await page.evaluate(o.eval).catch((e) => `eval error: ${e.message}`);
  console.log('eval:', JSON.stringify(result));
}
await page.waitForTimeout(o.wait);

const out = resolve(o.out);
mkdirSync(dirname(out), { recursive: true });
const shots = [];
if (o.sequence) {
  const [n, ms] = o.sequence.split(':').map(Number);
  for (let i = 1; i <= n; i++) {
    const file = out.replace(/\.png$/, `-${i}.png`);
    await page.screenshot({ path: file, fullPage: !!o.full });
    shots.push(file);
    if (i < n) await page.waitForTimeout(ms);
  }
} else {
  await page.screenshot({ path: out, fullPage: !!o.full });
  shots.push(out);
}

const info = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  let renderer = null;
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'webgl (renderer hidden)';
  }
  return { webgl: renderer, title: document.title, scrollHeight: document.documentElement.scrollHeight };
});

if (o.video) await context.close();
await browser.close();

console.log(`shots: ${shots.join(', ')}`);
console.log(`page: ${JSON.stringify(info)}`);
if (problems.length) {
  console.log(`problems (${problems.length}):`);
  for (const p of problems.slice(0, 40)) console.log(`  ${p}`);
  if (problems.length > 40) console.log(`  ... ${problems.length - 40} more`);
} else {
  console.log('problems: none');
}
