import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Config } from '../config.ts';
import { viaTrustedProxy } from './client-ip.ts';

/**
 * Content Security Policy from docs/ARCHITECTURE.md section 9.
 *
 * `worker-src` is deliberately absent: with no `worker-src` the browser falls back to `child-src`, then
 * `script-src 'self'`, so same-origin module workers (what Vite emits for `new Worker(new URL(...))`) work
 * and `blob:` workers are blocked. The web app has none today (verified: no `new Worker`, `blob:` URL
 * workers or wasm in web/src). If one is ever added, set CSP_WORKER_BLOB=1 rather than loosening
 * `script-src`. WebAssembly would need `'wasm-unsafe-eval'` in script-src; it is also not used.
 */
export function buildCsp(opts: { workerBlob: boolean }): string {
  const directives = [
    "default-src 'self'",
    "connect-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ];
  if (opts.workerBlob) directives.push("worker-src 'self' blob:");
  return directives.join('; ');
}

export const PERMISSIONS_POLICY =
  'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(self), gyroscope=(self)';

export interface SecurityHeaders {
  apply(req: IncomingMessage, res: ServerResponse): void;
  readonly csp: string;
}

export function createSecurityHeaders(config: Pick<Config, 'cspWorkerBlob' | 'trustProxy'>): SecurityHeaders {
  const csp = buildCsp({ workerBlob: config.cspWorkerBlob });
  return {
    csp,
    apply(req, res) {
      res.setHeader('Content-Security-Policy', csp);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      // HSTS only when the proxy we trust says the visitor used TLS; never on plain HTTP.
      if (
        viaTrustedProxy(req, config.trustProxy) &&
        String(req.headers['x-forwarded-proto'] ?? '')
          .split(',')[0]
          ?.trim() === 'https'
      ) {
        res.setHeader('Strict-Transport-Security', 'max-age=15552000');
      }
    },
  };
}
