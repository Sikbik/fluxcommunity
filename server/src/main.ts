import { ConfigError, loadConfig } from './config.ts';
import { createLogger } from './core/log.ts';
import { startServer } from './server.ts';
import { createFixturesRuntime, createLiveRuntime } from './services/runtime.ts';

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
  throw err;
}

const log = createLogger(config.logLevel);
const runtime = config.fixtures ? createFixturesRuntime(config, log) : createLiveRuntime(config, log);

let running: Awaited<ReturnType<typeof startServer>>;
try {
  running = await startServer(config, runtime, log);
} catch (err) {
  log.error('failed to start', { err: err instanceof Error ? err.message : String(err) });
  process.exit(1);
}

log.info('listening', {
  host: config.host,
  port: running.port,
  mode: runtime.mode,
  webDist: config.webDist,
  node: process.version,
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('shutting down', { signal });
  const hard = setTimeout(() => process.exit(0), 10_000);
  hard.unref();
  await running.stop();
  log.info('stopped');
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  log.error('unhandled rejection', { err: reason instanceof Error ? reason.message : String(reason) });
});
process.on('uncaughtException', (err) => {
  log.error('uncaught exception', { err: err.message });
  process.exit(1);
});
