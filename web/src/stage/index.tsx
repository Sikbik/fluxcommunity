// The Stage: a persistent, fixed, full-viewport background that the whole page lives in. It mounts one
// canvas (WebGL2 through three), or the CSS/SVG fallback when WebGL is unavailable, blocked or lost for
// good. It reads the stage bus every frame and writes only the `stage` slice.
//
// Integration: mount `<Stage />` once in the shell (lazy). Anywhere in the hero, render an element with
// `data-stage-anchor="symbol"` where the symbol should float (see bus.ts). Everything else is the bus.
//
// The engine (three.js and the shaders) is a separate lazy chunk so a visitor without WebGL never pays for it.

import { useEffect, useRef, useState } from 'react';
import { useStageBus } from './bus';
import { readDeviceHints, readFlags } from './env';
import { Fallback } from './fallback';
import { pickStartTier } from './governor';

export interface StageProps {
  className?: string;
}

type FallbackReason = 'no-webgl' | 'context-lost' | 'disabled';

export default function Stage({ className }: StageProps) {
  const host = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState<FallbackReason | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const bus = useStageBus.getState();
    const flags = readFlags();
    const plan = pickStartTier(readDeviceHints());
    let cancelled = false;
    let dispose: (() => void) | null = null;

    const showFallback = (reason: FallbackReason) => {
      if (cancelled) return;
      useStageBus.getState().setStage({ ready: true, quality: 0, fps: 0, reason });
      setFallback(reason);
    };

    if (flags.forcedTier === 0) {
      showFallback('disabled');
      return () => {
        cancelled = true;
      };
    }

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    canvas.setAttribute('aria-hidden', 'true');
    el.appendChild(canvas);

    (async () => {
      let mod: typeof import('./engine/engine');
      try {
        mod = await import('./engine/engine');
      } catch {
        showFallback('no-webgl');
        return;
      }
      if (cancelled) return;
      let engine: InstanceType<typeof mod.StageEngine>;
      try {
        engine = new mod.StageEngine(
          { canvas, plan, forcedTier: flags.forcedTier, dprOverride: flags.dpr },
          {
            onContext: (lost) => {
              if (cancelled) return;
              if (lost) setFallback('context-lost');
              else setFallback(null);
            },
            onGiveUp: () => showFallback('disabled'),
          },
        );
      } catch {
        showFallback('no-webgl');
        return;
      }
      if (cancelled) {
        engine.dispose();
        return;
      }
      let stopDebug: (() => void) | null = null;
      if (flags.debug) {
        const dbg = await import('./debug');
        if (!cancelled) {
          engine.enableGpuTiming();
          stopDebug = dbg.attachDebugOverlay(el, engine);
        }
      }
      dispose = () => {
        stopDebug?.();
        engine.dispose();
      };
      await engine.start();
      if (cancelled) dispose();
      const win = window as unknown as { __stageEngine?: unknown };
      if (flags.debug) win.__stageEngine = engine;
    })();

    return () => {
      cancelled = true;
      dispose?.();
      canvas.remove();
      const s = useStageBus.getState();
      if (s.stage.ready) s.setStage({ ready: false });
      void bus;
    };
  }, []);

  return (
    <div
      ref={host}
      aria-hidden="true"
      className={className}
      data-stage=""
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        pointerEvents: 'none',
        background: '#000',
        overflow: 'hidden',
      }}
    >
      {/* The stage sits at z-index -1, which paints under the body's own background. While it is mounted the
          body must be see-through (html keeps the void), or the page would hide it. */}
      <style data-stage-style="">{'body{background-color:transparent !important}'}</style>
      {fallback ? <Fallback reason={fallback} /> : null}
    </div>
  );
}
