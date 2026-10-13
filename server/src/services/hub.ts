import type { IncomingMessage, ServerResponse } from 'node:http';
import type { StreamEvent } from '../../../shared/api.ts';
import { errText, type Logger, silentLogger } from '../core/log.ts';

export interface HubOptions {
  maxClients: number;
  maxPerIp: number;
  /** Bytes queued for one client before it is dropped as a slow consumer. */
  maxBufferBytes: number;
  heartbeatMs: number;
  log?: Logger;
}

interface Client {
  res: ServerResponse;
  ip: string;
  id: number;
}

export type AddResult = { ok: true } | { ok: false; reason: 'capacity' | 'per-ip' };

/**
 * Server-Sent Events fan-out. Each event is serialised once and written to every client. A single shared
 * heartbeat timer sends `: ping` comments so idle connections survive proxies. Clients that cannot keep up
 * (more than `maxBufferBytes` queued in their socket) are dropped; EventSource reconnects on its own and
 * `hello` makes that idempotent.
 */
export class SseHub {
  readonly #o: HubOptions;
  readonly #log: Logger;
  readonly #clients = new Set<Client>();
  readonly #perIp = new Map<string, number>();
  #timer: NodeJS.Timeout | null = null;
  #seq = 0;
  dropped = 0;

  constructor(opts: HubOptions) {
    this.#o = opts;
    this.#log = (opts.log ?? silentLogger).child({ svc: 'sse' });
  }

  get size(): number {
    return this.#clients.size;
  }

  start(): void {
    if (this.#timer) return;
    // A comment keeps proxies and sockets alive; the named event makes liveness observable to EventSource.
    this.#timer = setInterval(
      () => this.#write(`: ping\n\n${frame({ type: 'ping', data: {} })}`),
      this.#o.heartbeatMs,
    );
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    for (const c of [...this.#clients]) this.#remove(c, true);
  }

  /** Attach a response as a stream. `hello` is sent first. */
  add(req: IncomingMessage, res: ServerResponse, ip: string, hello: StreamEvent): AddResult {
    if (this.#clients.size >= this.#o.maxClients) return { ok: false, reason: 'capacity' };
    if ((this.#perIp.get(ip) ?? 0) >= this.#o.maxPerIp) return { ok: false, reason: 'per-ip' };

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.socket?.setNoDelay(true);
    res.socket?.setKeepAlive(true, 30_000);
    // Reconnect hint, then the hello snapshot.
    res.write(`retry: 5000\n\n${frame(hello)}`);

    const client: Client = { res, ip, id: ++this.#seq };
    this.#clients.add(client);
    this.#perIp.set(ip, (this.#perIp.get(ip) ?? 0) + 1);
    const gone = () => this.#remove(client, false);
    res.on('close', gone);
    res.on('error', gone);
    req.on('aborted', gone);
    return { ok: true };
  }

  broadcast(event: StreamEvent): void {
    if (this.#clients.size === 0) return;
    this.#write(frame(event));
  }

  #write(chunk: string): void {
    for (const c of this.#clients) {
      try {
        if (c.res.destroyed || c.res.writableEnded) {
          this.#remove(c, false);
          continue;
        }
        if (c.res.writableLength > this.#o.maxBufferBytes) {
          this.dropped += 1;
          this.#log.warn('dropping slow consumer', { id: c.id, queued: c.res.writableLength });
          this.#remove(c, true);
          continue;
        }
        c.res.write(chunk);
      } catch (err) {
        this.#log.debug('write failed', { id: c.id, err: errText(err) });
        this.#remove(c, true);
      }
    }
  }

  #remove(c: Client, destroy: boolean): void {
    if (!this.#clients.delete(c)) return;
    const n = (this.#perIp.get(c.ip) ?? 1) - 1;
    if (n <= 0) this.#perIp.delete(c.ip);
    else this.#perIp.set(c.ip, n);
    if (destroy) {
      try {
        c.res.end();
        c.res.destroy();
      } catch {
        // already gone
      }
    }
  }
}

/** SSE wire frame for one event: `event: <type>` then a single-line JSON `data:`. */
export function frame(e: StreamEvent): string {
  return `event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`;
}
