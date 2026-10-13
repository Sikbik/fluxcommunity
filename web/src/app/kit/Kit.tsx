import { useEffect } from 'react';
import { usePrefs } from '@/lib/prefs';
import { useStageBus } from '@/stage/bus';
import { Container, FluxMark, Switch } from '@/ui';
import { AccentSwitcher } from '../AccentSwitcher';
import { DataKit } from './Data';
import { Foundations } from './Foundations';
import styles from './kit.module.css';
import { OverlayKit } from './Overlays';
import { Surfaces } from './Surfaces';

const JUMPS = [
  ['colour', 'Colour'],
  ['type', 'Type'],
  ['motion', 'Motion'],
  ['layout', 'Layout'],
  ['panels', 'Panel'],
  ['buttons', 'Buttons'],
  ['lattice', 'Lattice'],
  ['marks', 'Marks'],
  ['status', 'Status'],
  ['data', 'Data'],
  ['motion-kit', 'Reveal'],
  ['controls', 'Controls'],
  ['overlays', 'Overlays'],
  ['glyphs', 'Glyphs'],
] as const;

/**
 * The design-system gallery at `?kit=1`: every primitive in every state on one page, the
 * tokens, the type scale and the motion samples. This is how reviewers inspect the system.
 */
export default function Kit() {
  const motion = usePrefs((s) => s.reducedMotionOverride);
  const set = usePrefs((s) => s.set);
  const reduced = useStageBus((s) => s.reducedMotion);

  useEffect(() => {
    document.title = 'Kit | Flux Community';
  }, []);

  return (
    <div className={styles.kit}>
      <header className={styles.bar}>
        <Container size="wide" className={styles.barInner}>
          <span className={styles.brand}>
            <FluxMark variant="round" tone="blue" size={26} />
            Kit <small>design system</small>
          </span>
          <nav aria-label="Kit sections">
            {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from unstyled lists without it */}
            <ul className={styles.jump} role="list">
              {JUMPS.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`}>{label}</a>
                </li>
              ))}
            </ul>
          </nav>
          <div className={styles.toggles}>
            <AccentSwitcher />
            <Switch
              checked={reduced}
              onCheckedChange={(on) =>
                set({ reducedMotionOverride: on ? true : motion === true ? false : null })
              }
            >
              Reduce motion
            </Switch>
          </div>
        </Container>
      </header>
      <main id="main" tabIndex={-1}>
        <Container size="wide">
          <Foundations />
          <Surfaces />
          <DataKit />
          <OverlayKit />
        </Container>
      </main>
    </div>
  );
}
