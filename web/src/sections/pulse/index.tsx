/**
 * 01 / Network pulse: "the network, right now". A bento of live instruments, each one driven only by
 * the data hooks and each carrying its own freshness. The tier filter is the one piece of shared state:
 * the nodes tile and the map's chips both set it, so pressing Stratus anywhere shows Stratus everywhere.
 */
import type { Tier } from '@shared/api';
import { useCallback, useState } from 'react';
import { cn } from '@/lib/cn';
import { Reveal, Section } from '@/ui';
import { CadenceTile } from './CadenceTile';
import { CapacityTile } from './CapacityTile';
import { ConnectionIndicator } from './ConnectionIndicator';
import type { TierFilter } from './clusters';
import { MapTile } from './MapTile';
import { NodesTile } from './NodesTile';
import styles from './pulse.module.css';
import { ReductionTile } from './ReductionTile';

export default function Pulse() {
  const [filter, setFilter] = useState<TierFilter>('all');
  const toggleTier = useCallback((tier: Tier) => setFilter((f) => (f === tier ? 'all' : tier)), []);

  return (
    <Section
      id="pulse"
      title={
        <>
          The network, <b>right now</b>.
        </>
      }
      lead="Live from the chain, block by block."
      actions={<ConnectionIndicator />}
    >
      <div className={styles.bento}>
        <Reveal className={cn(styles.cell, styles.map)}>
          <MapTile filter={filter} onFilter={setFilter} />
        </Reveal>
        <Reveal className={cn(styles.cell, styles.nodes)} index={1}>
          <NodesTile filter={filter} onToggleTier={toggleTier} />
        </Reveal>
        <Reveal className={cn(styles.cell, styles.cadence)} index={2}>
          <CadenceTile />
        </Reveal>
        <Reveal className={cn(styles.cell, styles.reduction)} index={3}>
          <ReductionTile />
        </Reveal>
        <Reveal className={cn(styles.cell, styles.capacity)} index={4}>
          <CapacityTile />
        </Reveal>
      </div>
    </Section>
  );
}
