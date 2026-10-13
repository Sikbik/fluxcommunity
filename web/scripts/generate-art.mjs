#!/usr/bin/env node
// Generates the raw artwork (assets-src/raw/<id>.png) through scripts/imagegen.mjs, the wrapper around
// the Codex CLI image generation tool. Prompts live in assets-src/art-spec.mjs.
//
//   node web/scripts/generate-art.mjs                       generate everything that is missing
//   node web/scripts/generate-art.mjs --only gateway-cloud,tier-cumulus
//   node web/scripts/generate-art.mjs --group gateways      one group
//   node web/scripts/generate-art.mjs --force               regenerate (the old raw is kept in raw/_prev)
//   node web/scripts/generate-art.mjs --jobs 3 --effort low
//   node web/scripts/generate-art.mjs --list                print ids and prompts, generate nothing
//   node web/scripts/generate-art.mjs --prompts-md          rewrite assets-src/PROMPTS.md from the spec
//   node web/scripts/generate-art.mjs --prompt-suffix "extra text"   (one-off steer, not recorded)
//
// A generation takes 45 to 120 s. The default is 4 in parallel, the most the shared machine should run.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCENTS, buildPrompt, PIECES, STYLE_PREFIX } from '../../assets-src/art-spec.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const rawDir = join(repo, 'assets-src', 'raw');
const prevDir = join(rawDir, '_prev');
const imagegen = join(repo, 'scripts', 'imagegen.mjs');

function parseArgs(argv) {
  const o = {
    only: null,
    group: null,
    force: false,
    jobs: 4,
    effort: 'low',
    list: false,
    suffix: '',
    promptsMd: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') o.only = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--group') o.group = argv[++i];
    else if (a === '--force') o.force = true;
    else if (a === '--jobs') o.jobs = Math.max(1, Math.min(4, Number(argv[++i])));
    else if (a === '--effort') o.effort = argv[++i];
    else if (a === '--list') o.list = true;
    else if (a === '--prompts-md') o.promptsMd = true;
    else if (a === '--prompt-suffix') o.suffix = argv[++i];
    else {
      console.error(`unknown option ${a}`);
      process.exit(2);
    }
  }
  return o;
}

function archive(id) {
  const file = join(rawDir, `${id}.png`);
  if (!existsSync(file)) return;
  mkdirSync(prevDir, { recursive: true });
  const n = readdirSync(prevDir).filter((f) => f.startsWith(`${id}-`)).length + 1;
  renameSync(file, join(prevDir, `${id}-${n}.png`));
}

const md5 = (file) => createHash('md5').update(readFileSync(file)).digest('hex');

/** Id of another raw file with identical bytes, if any. Concurrent runs occasionally return the same image. */
function duplicateOf(piece) {
  const mine = md5(join(rawDir, `${piece.id}.png`));
  for (const f of readdirSync(rawDir).filter((n) => n.endsWith('.png'))) {
    if (f === `${piece.id}.png`) continue;
    if (md5(join(rawDir, f)) === mine) return f.replace(/\.png$/, '');
  }
  return null;
}

function generateOnce(piece, o) {
  return new Promise((done) => {
    const started = Date.now();
    const prompt = piece.prompt + (o.suffix ? `\n\n${o.suffix}` : '');
    const out = join(rawDir, `${piece.id}.png`);
    const args = [imagegen, '--out', out, '--effort', o.effort, '--retries', '1'];
    for (const r of piece.refs ?? []) args.push('--ref', resolve(repo, r));
    args.push('-');
    const child = spawn('node', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => {
      err += d;
    });
    child.on('close', (code) => {
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      if (code !== 0) {
        console.log(`FAIL  ${piece.id.padEnd(18)} ${secs}s ${err.trim().split('\n').pop()}`);
        return done(false);
      }
      const dup = duplicateOf(piece);
      if (dup) {
        unlinkSync(out);
        console.log(`DUP   ${piece.id.padEnd(18)} ${secs}s identical to ${dup}, discarded`);
        return done(false);
      }
      console.log(`ok    ${piece.id.padEnd(18)} ${secs}s`);
      done(true);
    });
    child.stdin.end(prompt);
  });
}

async function generate(piece, o) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (await generateOnce(piece, o)) return true;
  }
  return false;
}

function promptsMd() {
  const out = [];
  out.push(
    '# Prompts',
    '',
    'The exact prompts behind every generated piece, the file each produced, and what it took.',
    'This file is generated: edit `assets-src/art-spec.mjs`, then run',
    '`node web/scripts/generate-art.mjs --prompts-md`.',
    '',
    '## How a prompt is built',
    '',
    'Every prompt is `style prefix` + `Subject` + `lighting rig` + `frame` + `forbidden list`, so the whole set',
    'shares one lens, one lighting rig and one black. The wrapper (`scripts/imagegen.mjs`) adds one line',
    'asking the tool to return a single image.',
    '',
    '**Style prefix** (docs/DESIGN.md section 9, verbatim; `{accent}` is the only substitution):',
    '',
    `> ${STYLE_PREFIX}`,
    '',
    '**Accents**',
    '',
    ...Object.entries(ACCENTS).map(([k, v]) => `- \`${k}\`: ${v}`),
    '',
    'Raw generations are 1254 px squares or 1536 to 1774 px wide frames. `web/scripts/optimize-art.mjs`',
    'crops, crushes the black floor, applies an edge mask and encodes WebP and AVIF.',
    '',
    '## Pieces',
    '',
  );
  const groups = [...new Set(PIECES.map((p) => p.group))];
  for (const g of groups) {
    out.push(`### ${g}`, '');
    for (const p of PIECES.filter((x) => x.group === g)) {
      out.push(`#### ${p.id}`, '');
      const target =
        p.ship === false
          ? `\`assets-src/${p.id}.webp\` (build input only, not shipped)`
          : `\`web/public/art/${p.id}.webp\` (and \`.avif\` where it is smaller)`;
      out.push(`- Produces: ${target}, ${p.w}x${p.h}`);
      out.push(
        `- Raw: \`assets-src/raw/${p.id}.png\` (not in git), accent \`${p.accent}\`, blend \`${p.blend}\``,
      );
      if (p.notes?.length) {
        out.push('- Notes:');
        for (const n of p.notes) out.push(`  - ${n}`);
      }
      out.push('', '```text', buildPrompt(p), '```', '');
    }
  }
  writeFileSync(join(repo, 'assets-src', 'PROMPTS.md'), out.join('\n'));
  console.log('wrote assets-src/PROMPTS.md');
}

const o = parseArgs(process.argv.slice(2));
if (o.promptsMd) {
  promptsMd();
  process.exit(0);
}
mkdirSync(rawDir, { recursive: true });

let todo = PIECES.map((p) => ({ ...p, prompt: buildPrompt(p) }));
if (o.only) todo = todo.filter((p) => o.only.includes(p.id));
if (o.group) todo = todo.filter((p) => p.group === o.group);
if (o.list) {
  for (const p of todo) console.log(`# ${p.id}\n${p.prompt}\n`);
  process.exit(0);
}
if (!o.force) todo = todo.filter((p) => !existsSync(join(rawDir, `${p.id}.png`)));
if (todo.length === 0) {
  console.log('nothing to generate (use --force or --only <id> to redo)');
  process.exit(0);
}
if (o.force) for (const p of todo) archive(p.id);

console.log(`generating ${todo.length} piece(s), ${o.jobs} at a time`);
const queue = [...todo];
let failed = 0;
async function worker(index) {
  // Stagger the first wave so simultaneous runs do not collide.
  await new Promise((r) => setTimeout(r, index * 4000));
  while (queue.length) {
    const piece = queue.shift();
    const ok = await generate(piece, o);
    if (!ok) failed++;
  }
}
await Promise.all(Array.from({ length: Math.min(o.jobs, todo.length) }, (_, i) => worker(i)));
console.log(failed ? `${failed} failed` : 'all done');
process.exit(failed ? 1 : 0);
