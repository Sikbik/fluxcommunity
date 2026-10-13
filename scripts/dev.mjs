// Runs the API server and the web dev server together, prefixing their output.
// Ports: API on PORT (default 42069), web on WEB_PORT (default 5173).
import { spawn } from 'node:child_process';

const api = process.env.PORT || '42069';
const web = process.env.WEB_PORT || '5173';

const procs = [
  {
    name: 'api',
    color: '\x1b[36m',
    cmd: 'npm',
    args: ['--prefix', 'server', 'run', 'dev'],
    env: { PORT: api },
  },
  {
    name: 'web',
    color: '\x1b[35m',
    cmd: 'npm',
    args: ['--prefix', 'web', 'run', 'dev'],
    env: { WEB_PORT: web, API_ORIGIN: `http://127.0.0.1:${api}` },
  },
];

const children = procs.map((p) => {
  const child = spawn(p.cmd, p.args, {
    env: { ...process.env, ...p.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tag = `${p.color}[${p.name}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk;
      let i = buf.indexOf('\n');
      while (i !== -1) {
        process.stdout.write(`${tag}${buf.slice(0, i)}\n`);
        buf = buf.slice(i + 1);
        i = buf.indexOf('\n');
      }
    });
  }
  child.on('exit', (code) => {
    process.stdout.write(`${tag}exited with ${code}\n`);
    for (const c of children) c.kill('SIGTERM');
    process.exit(code ?? 0);
  });
  return child;
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const c of children) c.kill('SIGTERM');
  });
}
