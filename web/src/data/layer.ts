/**
 * Refcounted lifecycle for the engine.
 *
 * `acquire()` may be called any number of times (React StrictMode mounts effects twice, several
 * shells may start the layer). The engine runs while at least one acquirer holds it. Teardown is
 * deferred to the next macrotask so a StrictMode unmount/remount pair reuses the running engine
 * instead of aborting and restarting every request.
 */
import type { Engine } from './engine';

export interface LayerController {
  /** Hold the engine open. The returned release function is idempotent. */
  acquire(): () => void;
  /** Stop immediately regardless of holders (hot module reload). */
  dispose(): void;
  /** Number of current holders. */
  holders(): number;
  active(): boolean;
}

export function createLayerController(makeEngine: () => Engine): LayerController {
  let engine: Engine | null = null;
  let refs = 0;
  let teardown: ReturnType<typeof setTimeout> | null = null;

  const stopNow = () => {
    if (teardown) clearTimeout(teardown);
    teardown = null;
    engine?.stop();
    engine = null;
  };

  return {
    acquire() {
      refs += 1;
      if (teardown) {
        clearTimeout(teardown);
        teardown = null;
      }
      if (!engine) {
        engine = makeEngine();
        engine.start();
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        refs -= 1;
        if (refs <= 0) {
          refs = 0;
          if (teardown) clearTimeout(teardown);
          teardown = setTimeout(() => {
            teardown = null;
            if (refs === 0) stopNow();
          }, 0);
        }
      };
    },
    dispose() {
      refs = 0;
      stopNow();
    },
    holders: () => refs,
    active: () => engine !== null,
  };
}

/** `?demo=1` is honoured in development builds only, so production can never fake a live network. */
export function demoRequested(search: string, isDev: boolean): boolean {
  if (!isDev) return false;
  try {
    return new URLSearchParams(search).get('demo') === '1';
  } catch {
    return false;
  }
}
