#!/usr/bin/env node
// Generate one image through the local Codex CLI (its built-in image generation tool) and copy the
// result to a path you choose.
//
//   node scripts/imagegen.mjs --out web/public/art/src/cloud.png \
//        [--ref path/to/reference.png ...] [--effort low|medium|high] [--retries 2] \
//        "prompt text"      (or pipe the prompt on stdin with -)
//
// Notes
// - Codex stores the original under ~/.codex/generated_images/<thread>/; this script copies it to --out
//   and prints the final path as the last line of stdout.
// - A typical generation takes 45 to 120 seconds. Run several in parallel (shell `&` or Promise.all)
//   but keep it to 4 at a time.
// - Reference images (--ref) steer composition and style. Do NOT expect generated images to reproduce
//   the Flux symbol or any text faithfully; composite the real brand marks and real text in code.
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

function parseArgs(argv) {
  const opts = { refs: [], effort: 'low', retries: 1, timeoutMs: 8 * 60_000, prompt: '' };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--ref') opts.refs.push(argv[++i]);
    else if (a === '--effort') opts.effort = argv[++i];
    else if (a === '--retries') opts.retries = Number(argv[++i]);
    else if (a === '--timeout') opts.timeoutMs = Number(argv[++i]) * 1000;
    else rest.push(a);
  }
  opts.prompt = rest.join(' ').trim();
  return opts;
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8').trim();
}

function runCodex(prompt, refs, effort, cwd, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const args = [
      'exec',
      '--skip-git-repo-check',
      '-s',
      'read-only',
      '--json',
      '-C',
      cwd,
      '-c',
      `model_reasoning_effort="${effort}"`,
    ];
    for (const r of refs) args.push('-i', resolve(r));
    args.push('-');
    const child = spawn('codex', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`codex timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      out += d;
    });
    child.stderr.on('data', (d) => {
      err += d;
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`codex exited ${code}: ${err.slice(-400)}`));
      resolvePromise(out);
    });
    child.stdin.end(prompt);
  });
}

function findImagePath(jsonl) {
  // Prefer an explicit generated_images path anywhere in the stream (last one wins).
  const re = /(\/[^\s"'\\]*\/generated_images\/[^\s"'\\]+\.(?:png|jpe?g|webp))/g;
  let last = null;
  for (const m of jsonl.matchAll(re)) last = m[1];
  return last;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.prompt === '-' || (!opts.prompt && !process.stdin.isTTY)) opts.prompt = await readStdin();
  if (!opts.out || !opts.prompt) {
    console.error('usage: imagegen.mjs --out <file.png> [--ref <img>]... [--effort low] "<prompt>"');
    process.exit(2);
  }
  const wrapped = [
    'Use your built-in image generation tool to create exactly ONE image, then reply with only its absolute file path.',
    'Do not write code, do not edit files, do not add commentary.',
    '',
    opts.prompt,
  ].join('\n');

  const work = await mkdtemp(join(tmpdir(), 'imagegen-'));
  let lastErr;
  try {
    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      try {
        const jsonl = await runCodex(wrapped, opts.refs, opts.effort, work, opts.timeoutMs);
        const found = findImagePath(jsonl);
        if (!found) throw new Error('no generated image path in codex output');
        await stat(found);
        const dest = resolve(opts.out);
        await mkdir(dirname(dest), { recursive: true });
        await copyFile(found, dest);
        const size = (await readFile(dest)).length;
        console.error(`imagegen: ${dest} (${(size / 1024).toFixed(0)} KB)`);
        console.log(dest);
        return;
      } catch (e) {
        lastErr = e;
        console.error(`imagegen: attempt ${attempt + 1} failed: ${e.message}`);
      }
    }
    throw lastErr;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(`imagegen: ${e.message}`);
  process.exit(1);
});
