/**
 * OverlayHost: mounts overlay modules by convention, so section agents never edit App.tsx.
 *
 * Any file named `overlay.tsx` under `web/src/` whose DEFAULT export is a React component
 * is discovered with Vite's glob import, loaded lazily once the page is idle, and mounted
 * in its own Suspense and error boundary. A crashing overlay never takes the page down.
 *
 * Planned overlays: `palette/overlay.tsx`, `ambient/overlay.tsx`, `sections/builds/overlay.tsx`.
 * They sit above the page and above the header on a dedicated z layer (--z-overlay) and
 * may portal themselves (Drawer, Dialog and Toast already do). They read the `overlays`
 * store flags (`palette`, `shortcuts`, `submit`, `ambient`) and `useHashRoute()`.
 *
 * Zero matches is fine.
 */
import {
  type ComponentType,
  type LazyExoticComponent,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useOverlays } from '@/lib/overlays';
import { getLayer } from '@/ui';
import { ErrorBoundary } from './ErrorBoundary';

type OverlayModule = { default: ComponentType };

const modules = import.meta.glob<OverlayModule>('/src/**/overlay.tsx');

/** The overlay module paths found at build time, for diagnostics and tests. */
export const OVERLAY_PATHS: readonly string[] = Object.keys(modules).sort();

function whenIdle(cb: () => void, timeout: number): () => void {
  const ric = (
    window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }
  ).requestIdleCallback;
  const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
  if (ric) {
    const id = ric(cb, { timeout });
    return () => cic?.(id);
  }
  const id = window.setTimeout(cb, Math.min(timeout, 1500));
  return () => window.clearTimeout(id);
}

export function OverlayHost() {
  const [ready, setReady] = useState(false);
  const anyOpen = useOverlays((s) => s.palette || s.shortcuts || s.submit || s.ambient);

  // Mount once the page is idle, or immediately if an overlay was asked for.
  useEffect(() => {
    if (ready || OVERLAY_PATHS.length === 0) return;
    if (anyOpen) {
      setReady(true);
      return;
    }
    return whenIdle(() => setReady(true), 2500);
  }, [ready, anyOpen]);

  const entries = useMemo<Array<{ path: string; Component: LazyExoticComponent<ComponentType> }>>(
    () =>
      OVERLAY_PATHS.map((path) => ({ path, Component: lazy(modules[path] as () => Promise<OverlayModule>) })),
    [],
  );

  if (!ready || entries.length === 0 || typeof document === 'undefined') return null;
  return createPortal(
    <div
      data-overlay-host=""
      style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-overlay)', pointerEvents: 'none' }}
    >
      {entries.map(({ path, Component }) => (
        <ErrorBoundary key={path} fallback={null}>
          <Suspense fallback={null}>
            <div data-overlay={path} style={{ display: 'contents' }}>
              <Component />
            </div>
          </Suspense>
        </ErrorBoundary>
      ))}
    </div>,
    getLayer('overlay'),
  );
}
