import type { BlockEvent, BlockSummary, BlocksSnapshot } from '../../../shared/api.ts';
import { type Clock, jitter, sleep, systemClock } from '../core/clock.ts';
import { errText, type Logger, silentLogger } from '../core/log.ts';
import type { DaemonBlock } from '../flux/daemon.ts';

/** What the watcher needs from the daemon API; DaemonApi satisfies it and tests fake it. */
export interface BlockSource {
  blockCount(): Promise<number>;
  blockHash(height: number): Promise<string | null>;
  block(hashOrHeight: string | number): Promise<DaemonBlock | null>;
}

export interface BlockWatcherOptions {
  source: BlockSource;
  log?: Logger;
  clock?: Clock;
  /** Poll gap while a block is expected (default 1 s). */
  fastMs?: number;
  /** Poll gap right after a block, when the next one cannot be near (default 3 s). */
  slowMs?: number;
  /** How long after a block the cold (slow) cadence lasts. Blocks are ~30 s apart, so 22 s. */
  coldWindowMs?: number;
  maxBlocks?: number;
  /** Gap between backfill requests (rate limit). */
  backfillGapMs?: number;
  rand?: () => number;
}

interface Entry {
  height: number;
  hash: string;
  prevHash: string | null;
  /** Unix seconds from the header. */
  time: number;
  txCount: number | null;
}

type BlockListener = (e: BlockEvent) => void;

/**
 * Watches the chain tip and keeps a ring buffer of recent blocks.
 *
 * Detection: poll `getblockhash/<tip+1>` with a cache-busting query. fluxd answers "out of range" until the
 * block exists and errors are never cached upstream, so the first poll after the block lands succeeds, a
 * second or two after the header time, instead of the 20-50 s a `getblockcount` poll would lag. To keep
 * that polite the cadence is `slowMs` for the first ~22 s after a block and `fastMs` afterwards, about
 * 0.5 requests per second on average. The tip is bootstrapped from `getblockcount`; if that lagged, the
 * catch-up loop fetches the missing blocks back to back.
 */
export class BlockWatcher {
  readonly #src: BlockSource;
  readonly #log: Logger;
  readonly #clock: Clock;
  readonly #fastMs: number;
  readonly #slowMs: number;
  readonly #coldMs: number;
  readonly #max: number;
  readonly #gapMs: number;
  readonly #rand: () => number;
  readonly #listeners = new Set<BlockListener>();
  #buf: Entry[] = [];
  #stopped = true;
  #abort = new AbortController();
  #lastPollOkAt: number | null = null;
  #lastArrivalAt = 0;
  #generation = 0;
  #done: Promise<void> = Promise.resolve();
  #version = 0;

  constructor(opts: BlockWatcherOptions) {
    this.#src = opts.source;
    this.#log = (opts.log ?? silentLogger).child({ svc: 'blocks' });
    this.#clock = opts.clock ?? systemClock;
    this.#fastMs = opts.fastMs ?? 1_000;
    this.#slowMs = opts.slowMs ?? 3_000;
    this.#coldMs = opts.coldWindowMs ?? 22_000;
    this.#max = opts.maxBlocks ?? 120;
    this.#gapMs = opts.backfillGapMs ?? 250;
    this.#rand = opts.rand ?? Math.random;
  }

  onBlock(fn: BlockListener): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  /** Increments whenever the buffer changes; lets callers cache derived output. */
  get version(): number {
    return this.#version;
  }

  /** ms epoch of the last poll that got an answer from upstream (even "no new block yet"). */
  get lastPollOkAt(): number | null {
    return this.#lastPollOkAt;
  }

  tip(): { height: number; hash: string; timeMs: number; txCount: number | null } | null {
    const t = this.#buf[this.#buf.length - 1];
    return t ? { height: t.height, hash: t.hash, timeMs: t.time * 1000, txCount: t.txCount } : null;
  }

  snapshot(): BlocksSnapshot {
    const out: BlockSummary[] = [];
    for (let i = 0; i < this.#buf.length; i++) {
      const e = this.#buf[i] as Entry;
      const prev = i > 0 ? (this.#buf[i - 1] as Entry) : null;
      const contiguous = prev !== null && prev.height === e.height - 1;
      out.push({
        height: e.height,
        time: new Date(e.time * 1000).toISOString(),
        intervalSec: contiguous ? Math.max(0, e.time - (prev as Entry).time) : null,
        txCount: e.txCount,
      });
    }
    return { blocks: out };
  }

  /** Mean seconds between consecutive buffered blocks, null with fewer than 5 intervals. */
  measuredBlockSec(): number | null {
    let sum = 0;
    let n = 0;
    for (let i = 1; i < this.#buf.length; i++) {
      const a = this.#buf[i - 1] as Entry;
      const b = this.#buf[i] as Entry;
      if (b.height === a.height + 1) {
        sum += Math.max(0, b.time - a.time);
        n += 1;
      }
    }
    return n >= 5 ? Math.round((sum / n) * 100) / 100 : null;
  }

  start(): void {
    if (!this.#stopped) return;
    this.#stopped = false;
    this.#abort = new AbortController();
    this.#done = this.#run().catch((err) => this.#log.error('watcher crashed', { err: errText(err) }));
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    this.#abort.abort();
    await this.#done;
  }

  // ---- internals ---------------------------------------------------------

  #insert(b: DaemonBlock): Entry {
    const e: Entry = {
      height: b.height,
      hash: b.hash,
      prevHash: b.previousHash,
      time: b.time,
      txCount: b.txCount,
    };
    const buf = this.#buf;
    // Keep sorted by height, replace an entry at the same height (competing blocks), cap the size.
    let i = buf.length;
    while (i > 0 && (buf[i - 1] as Entry).height > e.height) i--;
    if (i > 0 && (buf[i - 1] as Entry).height === e.height) buf[i - 1] = e;
    else buf.splice(i, 0, e);
    while (buf.length > this.#max) buf.shift();
    this.#version += 1;
    return e;
  }

  async #wait(ms: number): Promise<void> {
    await sleep(ms, this.#abort.signal);
  }

  async #bootstrap(): Promise<void> {
    let failures = 0;
    while (!this.#stopped) {
      try {
        const height = await this.#src.blockCount();
        const b = await this.#src.block(height);
        if (!b) throw new Error('tip block not found');
        this.#lastPollOkAt = this.#clock.now();
        this.#insert(b);
        this.#lastArrivalAt = Math.min(this.#clock.now(), b.time * 1000);
        this.#log.info('tip', { height: b.height });
        return;
      } catch (err) {
        failures += 1;
        this.#log.warn('bootstrap failed', { err: errText(err), failures });
        await this.#wait(jitter(Math.min(30_000, 2_000 * 2 ** Math.min(failures, 4)), 0.2, this.#rand));
      }
    }
  }

  /** Fetch older blocks one at a time with a fixed gap, newest first, until the buffer is full. */
  async #backfill(generation: number): Promise<void> {
    let failures = 0;
    for (;;) {
      if (this.#stopped || generation !== this.#generation) return;
      const oldest = this.#buf[0];
      if (!oldest || this.#buf.length >= this.#max || oldest.height <= 1) return;
      try {
        const b = await this.#src.block(oldest.height - 1);
        if (!b || b.height !== oldest.height - 1) return;
        if (generation !== this.#generation) return;
        this.#insert(b);
        failures = 0;
      } catch (err) {
        failures += 1;
        this.#log.warn('backfill failed', { err: errText(err), failures });
        if (failures >= 5) return;
        await this.#wait(2_000 * failures);
      }
      await this.#wait(this.#gapMs);
    }
  }

  async #run(): Promise<void> {
    await this.#bootstrap();
    if (this.#stopped) return;
    void this.#backfill(this.#generation);
    let failures = 0;
    while (!this.#stopped) {
      const tip = this.#buf[this.#buf.length - 1];
      if (!tip) {
        await this.#bootstrap();
        this.#generation += 1;
        void this.#backfill(this.#generation);
        continue;
      }
      const next = tip.height + 1;
      try {
        const hash = await this.#src.blockHash(next);
        this.#lastPollOkAt = this.#clock.now();
        failures = 0;
        if (hash === null) {
          const sinceBlock = this.#clock.now() - this.#lastArrivalAt;
          await this.#wait(jitter(sinceBlock < this.#coldMs ? this.#slowMs : this.#fastMs, 0.1, this.#rand));
          continue;
        }
        const b = await this.#src.block(hash);
        if (!b || b.height !== next) throw new Error(`block ${next} not available`);
        if (b.previousHash !== null && b.previousHash !== tip.hash) {
          // The chain moved under us: drop the buffered tip and refetch the canonical block.
          this.#log.warn('reorg', { at: tip.height, hash: tip.hash.slice(0, 12) });
          this.#buf.pop();
          this.#version += 1;
          await this.#wait(40);
          continue;
        }
        this.#insert(b);
        this.#lastArrivalAt = this.#clock.now();
        const ev: BlockEvent = {
          height: b.height,
          time: new Date(b.time * 1000).toISOString(),
          txCount: b.txCount,
        };
        for (const fn of this.#listeners) {
          try {
            fn(ev);
          } catch (err) {
            this.#log.warn('block listener failed', { err: errText(err) });
          }
        }
        // Immediately try the following height: after a stall or a lagged bootstrap we catch up fast.
        await this.#wait(40);
      } catch (err) {
        failures += 1;
        this.#log.warn('poll failed', { err: errText(err), failures });
        await this.#wait(jitter(Math.min(60_000, 1_000 * 2 ** Math.min(failures, 6)), 0.2, this.#rand));
      }
    }
  }
}
