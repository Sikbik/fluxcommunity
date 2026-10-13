import { Section } from '@/ui';
import { FeaturePanel } from './FeaturePanel';
import { GameWall } from './GameWall';
import styles from './play.module.css';
import { ValueProps } from './ValueProps';

/**
 * 05 / Play. Game servers on Flux: the tunnel and controller art in a large glass panel,
 * three value props, one call to action, and a kinetic wall of game names that ripples the
 * lattice as it is hovered. The stage already raises its energy for this section.
 */
export default function Play() {
  return (
    <Section
      id="play"
      title={
        <>
          Game servers on the <b>decentralized cloud</b>.
        </>
      }
      lead="Each server runs on its own independent node. Pick a game, pick a region, play."
    >
      <div className={styles.layout}>
        <FeaturePanel />
        <ValueProps />
      </div>
      <GameWall />
    </Section>
  );
}
