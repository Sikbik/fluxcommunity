import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BlockEvent } from '../../shared/api.ts';
import type { DaemonBlock } from '../src/flux/daemon.ts';
import { type BlockSource, BlockWatcher } from '../src/services/blocks.ts';

class FakeChain implements BlockSource {
  blocks = new Map<number, DaemonBlock>();
  tip: number;
  reportedCount: number | null = null;
  failing = false;
  calls = { count: 0, hash: 0, block: 0 };

  constructor(tip: number, count = 60, spacingSec = 30, genesisSec = 1_700_000_000) {
    this.tip = tip;
    for (let i = 0; i < count; i++) {
      const h = tip - count + 1 + i;
      this.blocks.set(h, this.make(h, genesisSec + i * spacingSec));
    }
  }
  make(h: number, time: number): DaemonBlock {
    return {
      hash: h.toString(16).padStart(64, '0'),
      height: h,
      time,
      txCount: h % 7,
      previousHash: h > 0 ? (h - 1).toString(16).padStart(64, '0') : null,
    };
  }
  mine(time: number): DaemonBlock {
    this.tip += 1;
    const b = this.make(this.tip, time);
    this.blocks.set(this.tip, b);
    return b;
  }
  #maybeFail() {
    if (this.failing) throw new Error('upstream down');
  }
  async blockCount() {
    this.calls.count += 1;
    this.#maybeFail();
    return this.reportedCount ?? this.tip;
  }
  async blockHash(height: number) {
    this.calls.hash += 1;
    this.#maybeFail();
    return this.blocks.get(height)?.hash ?? null;
  }
  async block(x: string | number) {
    this.calls.block += 1;
    this.#maybeFail();
    if (typeof x === 'number') return this.blocks.get(x) ?? null;
    for (const b of this.blocks.values()) if (b.hash === x) return b;
    return null;
  }
}

async function waitFor(cond: () => boolean, ms = 2_000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 5));
  }
}

const fast = { fastMs: 5, slowMs: 5, coldWindowMs: 0, backfillGapMs: 1 };

describe('BlockWatcher', () => {
  it('bootstraps the tip, backfills the ring buffer and computes cadence', async () => {
    const chain = new FakeChain(1000, 60);
    const w = new BlockWatcher({ source: chain, maxBlocks: 20, ...fast });
    w.start();
    await waitFor(() => w.snapshot().blocks.length === 20);
    const { blocks } = w.snapshot();
    assert.equal(blocks.length, 20);
    assert.equal(blocks[19]?.height, 1000);
    assert.equal(blocks[0]?.intervalSec, null);
    assert.equal(blocks[1]?.intervalSec, 30);
    assert.deepEqual(
      blocks.map((b) => b.height),
      Array.from({ length: 20 }, (_, i) => 981 + i),
    );
    assert.equal(w.measuredBlockSec(), 30);
    assert.ok(w.lastPollOkAt !== null);
    await w.stop();
  });

  it('emits an event for each new block and keeps the buffer bounded', async () => {
    const chain = new FakeChain(500, 10);
    const w = new BlockWatcher({ source: chain, maxBlocks: 5, ...fast });
    const seen: BlockEvent[] = [];
    w.onBlock((e) => seen.push(e));
    w.start();
    await waitFor(() => w.tip()?.height === 500);
    chain.mine(1_700_001_000);
    chain.mine(1_700_001_030);
    await waitFor(() => seen.length === 2);
    assert.deepEqual(
      seen.map((e) => e.height),
      [501, 502],
    );
    assert.equal(seen[0]?.time, new Date(1_700_001_000_000).toISOString());
    assert.equal(seen[0]?.txCount, 501 % 7);
    assert.equal(w.snapshot().blocks.length, 5);
    assert.equal(w.tip()?.height, 502);
    await w.stop();
  });

  it('catches up at once when the daemon count lags the real tip', async () => {
    const chain = new FakeChain(700, 10);
    chain.reportedCount = 698; // daemon RPC cache is behind
    const w = new BlockWatcher({ source: chain, maxBlocks: 10, ...fast });
    const seen: number[] = [];
    w.onBlock((e) => seen.push(e.height));
    w.start();
    await waitFor(() => w.tip()?.height === 700);
    assert.deepEqual(seen, [699, 700]);
    await w.stop();
  });

  it('survives upstream failures and resumes', async () => {
    const chain = new FakeChain(900, 10);
    const w = new BlockWatcher({ source: chain, maxBlocks: 10, ...fast });
    w.start();
    await waitFor(() => w.tip()?.height === 900);
    chain.failing = true;
    await new Promise((r) => setTimeout(r, 60));
    chain.mine(1_700_002_000);
    chain.failing = false;
    await waitFor(() => w.tip()?.height === 901, 5_000);
    await w.stop();
  });

  it('replaces the buffered tip when the next block does not link to it (reorg)', async () => {
    const chain = new FakeChain(300, 10);
    const w = new BlockWatcher({ source: chain, maxBlocks: 10, ...fast });
    w.start();
    await waitFor(() => w.tip()?.height === 300);
    // A competing block replaces 300, and 301 builds on the new one.
    const forked = { ...chain.make(300, 1_700_003_000), hash: 'e'.repeat(64) };
    chain.blocks.set(300, forked);
    chain.tip = 301;
    chain.blocks.set(301, { ...chain.make(301, 1_700_003_030), previousHash: forked.hash });
    await waitFor(() => w.tip()?.height === 301 && (w.tip()?.hash.startsWith('0') ?? false));
    const heights = w.snapshot().blocks.map((b) => b.height);
    assert.deepEqual(
      heights,
      [...heights].sort((a, b) => a - b),
    );
    assert.equal(new Set(heights).size, heights.length);
    await w.stop();
  });

  it('does not report a cadence before it has enough intervals', async () => {
    const chain = new FakeChain(50, 3);
    const w = new BlockWatcher({ source: chain, maxBlocks: 120, ...fast });
    w.start();
    await waitFor(() => w.snapshot().blocks.length === 3);
    assert.equal(w.measuredBlockSec(), null);
    await w.stop();
  });
});
