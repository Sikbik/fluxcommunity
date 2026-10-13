/**
 * Capacity and apps: cores, RAM and SSD as big numbers, then the apps running. Each half carries its
 * own freshness (capacity is a five minute figure, app counts are slower still). The bars are real
 * ratios only: the share of the network that reports a passing benchmark (what capacity is summed
 * from), and running apps over registered apps. Without those inputs the bar is not drawn.
 */
import { useConnection, useNetworkSelect } from '@/data';
import { formatDecimal, formatInt } from '@/lib/format';
import { CountUp, Meter, Panel, Skeleton } from '@/ui';
import { formatStorage, perNode } from './capacity';
import styles from './capacity.module.css';
import { SectionChip, TileHeader, Unavailable } from './shared';

export function CapacityTile() {
  const capacity = useNetworkSelect((n) => n.capacity);
  const apps = useNetworkSelect((n) => n.apps);
  const nodeTotal = useNetworkSelect((n) => n.nodes.total);
  const loaded = nodeTotal !== null;
  const offline = useConnection() === 'offline';

  const ram = capacity ? formatStorage(capacity.ramTb) : null;
  const ssd = capacity ? formatStorage(capacity.ssdTb) : null;
  const coverage =
    capacity?.reporting !== undefined && nodeTotal !== null && nodeTotal > 0
      ? Math.min(1, capacity.reporting / nodeTotal)
      : null;
  const average = perNode(capacity);
  const appShare =
    apps && apps.running !== null && apps.registered !== null && apps.registered > 0
      ? Math.min(1, apps.running / apps.registered)
      : null;

  return (
    <Panel
      padding="lg"
      hot="tr"
      pattern="bl"
      stageFocus
      container
      as="article"
      className={styles.tile}
      contentClassName={styles.content}
    >
      <section className={styles.block} aria-label="Capacity">
        <TileHeader
          label="Capacity"
          detail="Summed from benchmarked nodes"
          chip={<SectionChip section="capacity" />}
        />
        {capacity && ram && ssd ? (
          <>
            <div className={styles.trio}>
              <div className={styles.metric}>
                <span className={styles.value}>
                  <CountUp value={capacity.cores} />
                </span>
                <span className={styles.metricLabel}>CPU cores</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.value}>
                  <CountUp value={ram.value} decimals={ram.decimals} />
                  <span className={styles.unit}>{ram.unit}</span>
                </span>
                <span className={styles.metricLabel}>RAM</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.value}>
                  <CountUp value={ssd.value} decimals={ssd.decimals} />
                  <span className={styles.unit}>{ssd.unit}</span>
                </span>
                <span className={styles.metricLabel}>SSD</span>
              </div>
            </div>
            {coverage !== null && capacity.reporting !== undefined ? (
              <div className={styles.bar}>
                <Meter
                  value={coverage}
                  label="Share of nodes with a benchmark counted in the capacity totals"
                  valueText={`${formatInt(capacity.reporting)} of ${formatInt(nodeTotal ?? 0)} nodes`}
                />
                <p className={styles.barNote}>
                  <b>{formatInt(capacity.reporting)}</b> of {formatInt(nodeTotal ?? 0)} nodes report a passing
                  benchmark
                </p>
              </div>
            ) : null}
            {average ? (
              <p className={styles.perNode}>
                <span className={styles.perNodeLabel}>Average per node</span>
                <span>{formatDecimal(average.cores, 1)} cores</span>
                <span>{formatInt(average.ramGb)} GB RAM</span>
                <span>{formatInt(average.ssdGb)} GB SSD</span>
              </p>
            ) : null}
          </>
        ) : loaded ? (
          <Unavailable>
            {offline
              ? 'Not available offline. Capacity figures return with the connection.'
              : 'Not available. Capacity figures are not being reported right now.'}
          </Unavailable>
        ) : (
          <div className={styles.skeleton} aria-hidden="true">
            <Skeleton height={44} />
            <Skeleton height={8} />
          </div>
        )}
      </section>

      <section className={styles.block} aria-label="Apps">
        <TileHeader
          label="Apps running"
          detail="Deployed on the network"
          chip={<SectionChip section="apps" />}
        />
        {apps && apps.running !== null ? (
          <>
            <div className={styles.appsLine}>
              <span className={styles.value}>
                <CountUp value={apps.running} />
              </span>
              {apps.registered !== null ? (
                <span className={styles.context}>of {formatInt(apps.registered)} registered</span>
              ) : null}
            </div>
            {appShare !== null ? (
              <div className={styles.bar}>
                <Meter
                  value={appShare}
                  label="Registered apps with a running instance"
                  valueText={`${formatDecimal(appShare * 100, 1)} percent`}
                />
              </div>
            ) : null}
          </>
        ) : loaded ? (
          <Unavailable>
            {offline
              ? 'Not available offline. App counts return with the connection.'
              : 'Not available. App counts are not being reported right now.'}
          </Unavailable>
        ) : (
          <div className={styles.skeleton} aria-hidden="true">
            <Skeleton height={44} />
            <Skeleton height={8} />
          </div>
        )}
      </section>
    </Panel>
  );
}
