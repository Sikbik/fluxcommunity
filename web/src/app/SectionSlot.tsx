import { Suspense, useEffect, useRef, useState } from 'react';
import { prefersSaveData } from '@/lib/platform';
import { useRouteStore } from '@/lib/route';
import { useGlideStore } from '@/lib/scroll';
import type { SectionDef } from '@/sections/registry';
import { Button, Container, HexBullet, Panel, Skeleton } from '@/ui';
import { observe } from '@/ui/internal/observer';
import { ErrorBoundary } from './ErrorBoundary';
import styles from './SectionSlot.module.css';

function Placeholder({ def, busy }: { def: SectionDef; busy: boolean }) {
  return (
    <section
      id={def.id}
      data-section={def.id}
      data-placeholder="true"
      aria-label={def.eyebrow}
      aria-busy={busy || undefined}
      className={styles.placeholder}
    >
      <Container>
        <p className={styles.eyebrow}>
          <HexBullet size={9} />
          <span className={styles.index}>{def.index}</span>
          <span aria-hidden="true">/</span>
          <span>{def.eyebrow}</span>
        </p>
        <div className={styles.lines} aria-hidden="true">
          <Skeleton height={44} width="62%" />
          <Skeleton height={16} width="86%" />
          <Skeleton height={16} width="54%" />
        </div>
      </Container>
    </section>
  );
}

function Failed({ def }: { def: SectionDef }) {
  return (
    <section id={def.id} data-section={def.id} aria-label={def.eyebrow} className={styles.placeholder}>
      <Container size="narrow">
        <Panel variant="slab" padding="lg">
          <div className={styles.failed}>
            <p className={styles.eyebrow}>
              <span className={styles.index}>{def.index}</span>
              <span aria-hidden="true">/</span>
              <span>{def.eyebrow}</span>
            </p>
            <p className="t-lead">This section did not load.</p>
            <Button variant="secondary" icon="refresh" onClick={() => window.location.reload()}>
              Reload the page
            </Button>
          </div>
        </Panel>
      </Container>
    </section>
  );
}

/**
 * One section of the page. The hero renders at once. Every other section shows a
 * placeholder (with the real id, so hash links and scroll-spy work immediately), has its
 * chunk prefetched when the browser is idle, and renders when it is within about a
 * viewport and a half of the screen, or when the hash names it. While a nav glide is
 * flying past, nothing mounts on the way; the sections near where it lands arm when it ends.
 */
export function SectionSlot({ def, order }: { def: SectionDef; order: number }) {
  const eager = def.id === 'hero';
  const routed = useRouteStore((s) => s.section === def.id);
  // Bumps whenever a nav glide ends: an unarmed placeholder looks again at where it is now.
  const settled = useGlideStore((s) => s.settled);
  const [armed, setArmed] = useState(eager);
  const holder = useRef<HTMLDivElement>(null);

  // Prefetch the chunk when idle, one section at a time, unless the visitor saves data.
  useEffect(() => {
    if (eager || !def.load || prefersSaveData()) return;
    let timer = 0;
    const ric = (
      window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    ).requestIdleCallback;
    const start = () => {
      timer = window.setTimeout(() => void def.load?.(), order * 450);
    };
    if (ric) ric(start, { timeout: 3000 });
    else timer = window.setTimeout(start, 1200);
    return () => window.clearTimeout(timer);
  }, [eager, def, order]);

  // Arm (render) when near the viewport.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `settled` re-observes after a nav glide, so a placeholder the glide landed beside is seen
  useEffect(() => {
    if (armed || routed) return;
    const el = holder.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setArmed(true);
      return;
    }
    let stop = () => {};
    stop = observe(
      el,
      (entry) => {
        // Mid-glide the page is only passing over this. A fresh observation follows the landing.
        if (entry.isIntersecting && !useGlideStore.getState().gliding) {
          setArmed(true);
          stop();
        }
      },
      { rootMargin: '150% 0px 150% 0px' },
    );
    return () => stop();
  }, [armed, routed, settled]);

  const render = armed || routed;
  if (!render) {
    return (
      <div ref={holder}>
        <Placeholder def={def} busy={false} />
      </div>
    );
  }
  const { Component } = def;
  return (
    <ErrorBoundary fallback={<Failed def={def} />}>
      <Suspense fallback={<Placeholder def={def} busy />}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  );
}
