#!/usr/bin/env node
// Builds the compact land mask the Pulse world map draws its dot matrix from.
//
// It is a ONE-OFF generator, run by hand when the mask needs to change. Its two inputs are public
// domain Natural Earth data, packaged by the `world-atlas` and `topojson-client` npm packages, which are
// deliberately NOT dependencies of this repo. Install them somewhere else and point the script at them:
//
//   mkdir -p /tmp/land && cd /tmp/land && npm init -y && npm i world-atlas topojson-client
//   node web/scripts/build-land-mask.mjs --modules /tmp/land
//
// Options
//   --modules <dir>   directory whose node_modules holds world-atlas and topojson-client (default: cwd)
//   --res <50m|110m>  Natural Earth land resolution to rasterise (default 50m)
//   --out <file>      output TypeScript module (default: web/src/sections/pulse/land-mask.data.ts)
//   --threshold <n>   share of a 1 degree cell that must be land for the cell to count (default 0.5)
//   --preview         print an ASCII preview (180 columns) and the size report, write nothing
//
// Output: a 360 x 180 equirectangular bitmap (1 degree cells, row 0 is the northernmost, column 0 is 180W),
// run-length encoded over the row-major bit string. Runs alternate water, land, water, ... starting with
// water, each as an unsigned LEB128 varint, and the byte string is base64. About 3 KB for the whole world.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 360;
const H = 180;
const SUPER = 6; // samples per cell edge: 36 samples decide each 1 degree cell

function parseArgs(argv) {
  const o = { modules: process.cwd(), res: '50m', threshold: 0.5, preview: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--modules') o.modules = resolve(next());
    else if (a === '--res') o.res = next();
    else if (a === '--out') o.out = resolve(next());
    else if (a === '--threshold') o.threshold = Number(next());
    else if (a === '--preview') o.preview = true;
    else {
      console.error(`unknown option ${a}`);
      process.exit(2);
    }
  }
  if (!['50m', '110m'].includes(o.res)) {
    console.error('--res must be 50m or 110m');
    process.exit(2);
  }
  if (!(o.threshold > 0 && o.threshold <= 1)) {
    console.error('--threshold must be in (0, 1]');
    process.exit(2);
  }
  return o;
}

const here = dirname(fileURLToPath(import.meta.url));
const opts = parseArgs(process.argv.slice(2));
const outFile = opts.out ?? resolve(here, '../src/sections/pulse/land-mask.data.ts');

const req = createRequire(`${opts.modules}/`);
let topojson;
let atlasDir;
try {
  topojson = req('topojson-client');
  atlasDir = dirname(req.resolve('world-atlas/package.json'));
} catch (error) {
  console.error(
    `Could not load world-atlas and topojson-client from ${opts.modules}.\n` +
      'Install them there (npm i world-atlas topojson-client) and pass --modules <dir>.\n' +
      String(error),
  );
  process.exit(1);
}
const atlasVersion = JSON.parse(readFileSync(`${atlasDir}/package.json`, 'utf8')).version;
const topology = JSON.parse(readFileSync(`${atlasDir}/land-${opts.res}.json`, 'utf8'));
const land = topojson.feature(topology, topology.objects.land);

// --- Collect every ring edge of every polygon -------------------------------------------------------------
// Land polygons do not overlap, so one even-odd scanline fill over all rings (outer rings and holes
// together) is the whole point-in-polygon test, and it is fast enough to run at 6 x 6 samples per cell.
//
// The topology is spherical: a ring that crosses the antimeridian (Chukotka) jumps from +180 to -180, which
// a planar fill would draw as an edge across the whole map. So each ring is unwrapped to continuous
// longitudes first (it may then run past +180), a ring that circles a pole (Antarctica) is closed down to
// the pole, and every ring is added at -360, 0 and +360 so the part beyond the seam lands on the far side.

const edges = [];
function addRing(ring) {
  if (ring.length < 4) return;
  const pts = [];
  let offset = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = ring[i];
    if (i > 0) {
      const prev = ring[i - 1][0];
      if (x - prev > 180) offset -= 360;
      else if (x - prev < -180) offset += 360;
    }
    pts.push([x + offset, y]);
  }
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (Math.abs(last[0] - first[0]) > 1e-9) {
    // The ring winds once around a pole: close it along the pole so it stays a simple planar polygon.
    const meanLat = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const pole = meanLat < 0 ? -90 : 90;
    pts.push([last[0], pole], [first[0], pole], [first[0], first[1]]);
  }
  for (const shift of [-360, 0, 360]) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      if (y1 !== y2) edges.push(x1 + shift, y1, x2 + shift, y2);
    }
  }
}
function visit(geometry) {
  if (!geometry) return;
  if (geometry.type === 'Polygon') for (const ring of geometry.coordinates) addRing(ring);
  else if (geometry.type === 'MultiPolygon')
    for (const polygon of geometry.coordinates) for (const ring of polygon) addRing(ring);
  else if (geometry.type === 'GeometryCollection') for (const g of geometry.geometries) visit(g);
}
if (land.type === 'FeatureCollection') for (const f of land.features) visit(f.geometry);
else if (land.type === 'Feature') visit(land.geometry);
else visit(land);
const edgeCount = edges.length / 4;

// --- Rasterise ---------------------------------------------------------------------------------------------------

const hits = new Uint16Array(W * H);
const SAMPLE_W = W * SUPER;
const SAMPLE_H = H * SUPER;
const crossings = [];
for (let sy = 0; sy < SAMPLE_H; sy++) {
  const y = 90 - (sy + 0.5) / SUPER;
  crossings.length = 0;
  for (let e = 0; e < edges.length; e += 4) {
    const y1 = edges[e + 1];
    const y2 = edges[e + 3];
    if (y1 > y !== y2 > y) {
      const x1 = edges[e];
      crossings.push(x1 + ((y - y1) * (edges[e + 2] - x1)) / (y2 - y1));
    }
  }
  crossings.sort((a, b) => a - b);
  const row = Math.floor(sy / SUPER);
  let k = 0;
  let odd = false;
  for (let sx = 0; sx < SAMPLE_W; sx++) {
    const x = -180 + (sx + 0.5) / SUPER;
    while (k < crossings.length && crossings[k] < x) {
      odd = !odd;
      k++;
    }
    if (odd) hits[row * W + Math.floor(sx / SUPER)]++;
  }
}
const needed = Math.ceil(opts.threshold * SUPER * SUPER);
const bits = new Uint8Array(W * H);
for (let i = 0; i < bits.length; i++) bits[i] = hits[i] >= needed ? 1 : 0;

// --- Encode ------------------------------------------------------------------------------------------------------

function encodeRuns(flat) {
  const bytes = [];
  const push = (n) => {
    let v = n;
    while (v >= 0x80) {
      bytes.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    bytes.push(v);
  };
  let current = 0; // runs start with water
  let run = 0;
  for (const bit of flat) {
    if (bit === current) {
      run++;
    } else {
      push(run);
      current = bit;
      run = 1;
    }
  }
  push(run);
  return Buffer.from(bytes);
}

function decodeRuns(base64) {
  const bytes = Buffer.from(base64, 'base64');
  const out = new Uint8Array(W * H);
  let pos = 0;
  let value = 0;
  let shift = 0;
  let bit = 0;
  for (const b of bytes) {
    value |= (b & 0x7f) << shift;
    if (b & 0x80) {
      shift += 7;
      continue;
    }
    if (bit === 1) out.fill(1, pos, pos + value);
    pos += value;
    value = 0;
    shift = 0;
    bit ^= 1;
  }
  if (pos !== W * H) throw new Error(`decoded ${pos} cells, expected ${W * H}`);
  return out;
}

const encoded = encodeRuns(bits).toString('base64');
const roundTrip = decodeRuns(encoded);
for (let i = 0; i < bits.length; i++) {
  if (roundTrip[i] !== bits[i]) throw new Error(`round trip differs at cell ${i}`);
}
const landCells = bits.reduce((a, b) => a + b, 0);

console.log(
  `land-${opts.res} (world-atlas@${atlasVersion}): ${edgeCount} edges, ` +
    `${landCells} of ${W * H} cells are land (${((landCells / (W * H)) * 100).toFixed(1)}%), ` +
    `${encoded.length} base64 chars`,
);

if (opts.preview) {
  // Two columns per character would halve the width; 1 column per cell is 360 wide, so halve both axes.
  const rows = [];
  for (let r = 0; r < H; r += 4) {
    let line = '';
    for (let c = 0; c < W; c += 2) {
      let n = 0;
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) n += bits[(r + dy) * W + c + dx];
      line += n >= 5 ? '#' : n >= 2 ? '+' : n >= 1 ? '.' : ' ';
    }
    rows.push(line);
  }
  console.log(rows.join('\n'));
  process.exit(0);
}

// --- Write the module --------------------------------------------------------------------------------------------

const chunks = encoded.match(/.{1,96}/g) ?? [];
const body = `/**
 * GENERATED by web/scripts/build-land-mask.mjs. Do not edit by hand; run the script to change it.
 *
 * Land mask for the Pulse world map: Natural Earth 1:${opts.res.replace('m', '')}m land (public domain),
 * via world-atlas@${atlasVersion}, rasterised to an equirectangular ${W} x ${H} bitmap. One cell is one
 * degree of longitude by one of latitude; a cell is land when at least ${Math.round(opts.threshold * 100)} percent of it is.
 * Row 0 is the northernmost (90N to 89N), column 0 is the westernmost (180W to 179W).
 *
 * Encoding: run lengths over the row-major bit string, alternating water, land, water, ... and starting
 * with water. Each run is an unsigned LEB128 varint and the byte string is base64. \`mask.ts\` decodes it.
 */
export const LAND_MASK_WIDTH = ${W};
export const LAND_MASK_HEIGHT = ${H};
/** Land cells in the bitmap, for sanity checks. */
export const LAND_MASK_LAND_CELLS = ${landCells};
export const LAND_MASK_RUNS = [
${chunks.map((c) => `  '${c}',`).join('\n')}
].join('');
`;
writeFileSync(outFile, body);
console.log(`wrote ${outFile} (${Buffer.byteLength(body)} bytes)`);
