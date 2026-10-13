import { lazy, Suspense } from 'react';
import { getFlags } from '@/lib/flags';
import { useOverlays } from '@/lib/overlays';
import { SECTIONS } from '@/sections/registry';
import { ToastHost } from '@/ui';
import styles from './App.module.css';
import { Backdrop, Grain } from './Backdrop';
import { Header } from './Header';
import headerStyles from './Header.module.css';
import { OverlayHost } from './OverlayHost';
import { SectionSlot } from './SectionSlot';
import {
  useAccentSync,
  useAmbientSync,
  useAutoAmbient,
  useBeat,
  useGlassMode,
  useGlobalHotkeys,
  useHashDelegation,
  useInitialHashScroll,
  useIntroAttribute,
  useIntroHandshake,
  useKonami,
  useScrollSync,
  useVisibilityPause,
} from './shell';

// The WebGL stage is its own chunk and mounts exactly once.
const Stage = lazy(() => import('@/stage'));
// The design-system gallery is only fetched for ?kit=1.
const Kit = lazy(() => import('./kit/Kit'));

function Shell() {
  useVisibilityPause();
  useAccentSync();
  useGlassMode();
  useAmbientSync();
  useAutoAmbient();
  useScrollSync();
  useBeat();
  useIntroHandshake();
  useIntroAttribute();
  useGlobalHotkeys();
  useKonami();
  useHashDelegation();
  useInitialHashScroll();

  // Ambient mode shows the lattice and nothing else: the page chrome fades out and is inert.
  const ambient = useOverlays((s) => s.ambient);
  return (
    <>
      <div className={styles.chrome} inert={ambient}>
        <a className={headerStyles.skip} href="#main">
          Skip to the content
        </a>
        <Header />
      </div>
      <div className={styles.page} inert={ambient}>
        <main id="main" className={styles.main} tabIndex={-1}>
          {SECTIONS.map((def, order) => (
            <SectionSlot key={def.id} def={def} order={order} />
          ))}
        </main>
      </div>
    </>
  );
}

/**
 * The application shell: providers, the stage, the backdrop, the header and the page,
 * the overlay host, toasts, the cursor and the grain. Everything with a global effect
 * (bus wiring, hotkeys, intro) is a hook in `shell.ts`.
 */
export default function App() {
  const kit = getFlags().kit;
  return (
    <>
      {kit ? null : (
        <Suspense fallback={null}>
          <Stage />
        </Suspense>
      )}
      <Backdrop />
      {kit ? (
        <Suspense fallback={null}>
          <Kit />
        </Suspense>
      ) : (
        <Shell />
      )}
      <OverlayHost />
      <ToastHost />
      <Grain />
    </>
  );
}
