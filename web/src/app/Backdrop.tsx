import { useStageBus } from '@/stage/bus';
import { Lattice2D } from '@/ui';
import styles from './Backdrop.module.css';

/**
 * The page's own lattice. It is the whole background until the WebGL stage is rendering,
 * and the fallback when WebGL is missing, blocked, lost or disabled. Once the stage
 * reports `ready` with a quality above 0 it fades away (a stage holding a still frame for
 * reduced motion still counts: it is drawing), so the 2D and 3D lattices are never seen
 * together.
 */
export function Backdrop() {
  const webgl = useStageBus(
    (s) =>
      s.stage.ready &&
      s.stage.quality > 0 &&
      (s.stage.reason === 'ok' || s.stage.reason === 'reduced-motion'),
  );
  return (
    <div className={styles.backdrop} data-hidden={webgl ? 'true' : 'false'} aria-hidden="true">
      <Lattice2D fixed variant="field" intensity={0.62} interactive glow="top" />
    </div>
  );
}

/** Fine film grain over everything: kills banding in the glows. Off in lite glass. */
export function Grain() {
  return <div className={styles.grain} aria-hidden="true" />;
}
