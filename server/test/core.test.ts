import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BreakerOpenError, CircuitBreaker } from '../src/core/breaker.ts';
import { jitter, ManualClock } from '../src/core/clock.ts';
import { nextDelay } from '../src/core/loop.ts';
import { KeyedSingleFlight, SingleFlight } from '../src/core/singleflight.ts';
import { SwrCell } from '../src/core/swr.ts';

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('SingleFlight', () => {
  it('shares one in-flight promise between concurrent callers', async () => {
    const sf = new SingleFlight<number>();
    let calls = 0;
    const d = deferred<number>();
    const fn = () => {
      calls += 1;
      return d.promise;
    };
    const a = sf.run(fn);
    const b = sf.run(fn);
    assert.equal(sf.active, true);
    d.resolve(7);
    assert.deepEqual(await Promise.all([a, b]), [7, 7]);
    assert.equal(calls, 1);
    assert.equal(sf.active, false);
    await sf.run(async () => {
      calls += 1;
      return 1;
    });
    assert.equal(calls, 2);
  });

  it('releases the slot after a rejection', async () => {
    const sf = new SingleFlight<number>();
    await assert.rejects(
      sf.run(async () => Promise.reject(new Error('boom'))),
      /boom/,
    );
    assert.equal(await sf.run(async () => 3), 3);
  });

  it('is keyed independently', async () => {
    const kf = new KeyedSingleFlight<string>();
    let calls = 0;
    const mk = (v: string) => async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 5));
      return v;
    };
    const out = await Promise.all([kf.run('a', mk('a')), kf.run('a', mk('x')), kf.run('b', mk('b'))]);
    assert.deepEqual(out, ['a', 'a', 'b']);
    assert.equal(calls, 2);
    assert.equal(kf.size, 0);
  });
});

describe('SwrCell (ttl + stale-while-revalidate)', () => {
  it('serves fresh, then stale while one background refresh runs', async () => {
    const clock = new ManualClock(1_000_000);
    let n = 0;
    const d: ReturnType<typeof deferred<number>>[] = [];
    const cell = new SwrCell<number>({
      name: 't',
      ttlMs: 1_000,
      clock,
      load: () => {
        n += 1;
        const x = deferred<number>();
        d.push(x);
        return x.promise;
      },
    });
    assert.equal(cell.read().value, null); // empty: kicks the first load
    assert.equal(n, 1);
    (d[0] as ReturnType<typeof deferred<number>>).resolve(10);
    await cell.refresh();
    assert.deepEqual({ v: cell.peek().value, fresh: cell.peek().fresh, n }, { v: 10, fresh: true, n: 1 });

    clock.advance(1_500); // past ttl: stale value is still served
    const r1 = cell.read();
    const r2 = cell.read();
    assert.equal(r1.value, 10);
    assert.equal(r1.fresh, false);
    assert.equal(r2.value, 10);
    assert.equal(n, 2, 'many stale reads trigger exactly one revalidation');
    (d[1] as ReturnType<typeof deferred<number>>).resolve(11);
    await cell.refresh();
    assert.equal(cell.peek().value, 11);
    assert.equal(cell.peek().fresh, true);
  });

  it('keeps the previous value when a refresh fails and records the error', async () => {
    const clock = new ManualClock(0);
    let fail = false;
    const cell = new SwrCell<string>({
      name: 't',
      ttlMs: 100,
      clock,
      load: async () => {
        if (fail) throw new Error('upstream down');
        return 'ok';
      },
    });
    assert.equal(await cell.refresh(), true);
    fail = true;
    clock.advance(500);
    assert.equal(await cell.refresh(), false);
    assert.equal(cell.peek().value, 'ok');
    assert.equal(cell.peek().fresh, false);
    assert.match(cell.lastError ?? '', /upstream down/);
    assert.equal(cell.failures, 1);
  });

  it('drops the value past maxAgeMs', async () => {
    const clock = new ManualClock(0);
    const cell = new SwrCell<number>({ name: 't', ttlMs: 10, maxAgeMs: 100, clock, load: async () => 1 });
    await cell.refresh();
    clock.advance(99);
    assert.equal(cell.peek().value, 1);
    clock.advance(2);
    assert.equal(cell.peek().value, null);
  });

  it('does not hammer a failing upstream from reads', async () => {
    const clock = new ManualClock(0);
    let n = 0;
    const cell = new SwrCell<number>({
      name: 't',
      ttlMs: 1_000,
      clock,
      load: async () => {
        n += 1;
        throw new Error('x');
      },
    });
    cell.read();
    await cell.refresh();
    const before = n;
    cell.read();
    cell.read();
    assert.equal(n, before, 'reads inside the retry gap do not start new loads');
    clock.advance(6_000);
    cell.read();
    assert.equal(n, before + 1);
  });
});

describe('CircuitBreaker', () => {
  const mk = (clock: ManualClock) =>
    new CircuitBreaker({
      name: 'x',
      failureThreshold: 3,
      baseCooldownMs: 1_000,
      maxCooldownMs: 8_000,
      clock,
      rand: () => 0.5, // no jitter
    });

  it('opens after consecutive failures, fails fast, then half-opens with a single trial', async () => {
    const clock = new ManualClock(0);
    const b = mk(clock);
    const boom = async () => {
      throw new Error('boom');
    };
    for (let i = 0; i < 3; i++) await assert.rejects(b.exec(boom), /boom/);
    assert.equal(b.state, 'open');
    let called = false;
    await assert.rejects(
      b.exec(async () => {
        called = true;
      }),
      BreakerOpenError,
    );
    assert.equal(called, false);

    clock.advance(1_001);
    assert.equal(b.allow(), true, 'first trial admitted');
    assert.equal(b.state, 'half-open');
    assert.equal(b.allow(), false, 'only one trial at a time');
    b.success();
    assert.equal(b.state, 'closed');
  });

  it('doubles the cool-down on repeated trips up to the cap', () => {
    const clock = new ManualClock(0);
    const b = mk(clock);
    const trip = () => {
      for (let i = 0; i < 3; i++) b.failure();
    };
    trip();
    assert.equal(b.retryAfterMs, 1_000);
    clock.advance(1_000);
    assert.equal(b.allow(), true);
    b.failure(); // failed trial: re-open with the doubled cool-down
    assert.equal(b.retryAfterMs, 2_000);
    clock.advance(2_000);
    b.allow();
    b.failure();
    assert.equal(b.retryAfterMs, 4_000);
    clock.advance(4_000);
    b.allow();
    b.failure();
    assert.equal(b.retryAfterMs, 8_000);
    clock.advance(8_000);
    b.allow();
    b.failure();
    assert.equal(b.retryAfterMs, 8_000, 'capped');
  });

  it('a success resets the failure streak', async () => {
    const clock = new ManualClock(0);
    const b = mk(clock);
    b.failure();
    b.failure();
    b.success();
    b.failure();
    b.failure();
    assert.equal(b.state, 'closed');
  });
});

describe('scheduling helpers', () => {
  it('jitter stays within the ratio', () => {
    for (const r of [0, 0.25, 0.5, 0.999]) {
      const v = jitter(1000, 0.2, () => r);
      assert.ok(v >= 800 && v <= 1200, String(v));
    }
  });

  it('nextDelay backs off exponentially with a cap', () => {
    const rand = () => 0.5;
    assert.equal(nextDelay(1000, 0, 60_000, 0.1, rand), 1000);
    assert.equal(nextDelay(1000, 1, 60_000, 0.1, rand), 2000);
    assert.equal(nextDelay(1000, 3, 60_000, 0.1, rand), 8000);
    assert.equal(nextDelay(1000, 12, 60_000, 0.1, rand), 60_000);
  });
});
