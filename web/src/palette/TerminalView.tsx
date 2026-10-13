import { useEffect, useMemo } from 'react';
import {
  useAllHealth,
  useBlocks,
  useChainClock,
  useNetwork,
  useReductionCountdown,
  useSectionAge,
  useSectionFreshness,
} from '@/data';
import { useTick } from '@/system/useTick';
import { Chip, FreshnessChip, Glyph } from '@/ui';
import styles from './Deck.module.css';
import { type Answer, buildAnswer, type FreshTag, parseTerminal, type TerminalData } from './terminal';

const TIER_GLYPH = {
  cumulus: 'tier-cumulus',
  nimbus: 'tier-nimbus',
  stratus: 'tier-stratus',
} as const;

/** The live data, gathered into the plain snapshot `buildAnswer` takes. */
function useTerminalData(): TerminalData {
  const network = useNetwork();
  const blocks = useBlocks();
  const health = useAllHealth();
  const clock = useChainClock();
  const reduction = useReductionCountdown();
  const nowMs = useTick(1000);

  const chain = useSectionFreshness('chain');
  const nodes = useSectionFreshness('nodes');
  const apps = useSectionFreshness('apps');
  const market = useSectionFreshness('market');
  const chainAge = useSectionAge('chain');
  const nodesAge = useSectionAge('nodes');
  const appsAge = useSectionAge('apps');
  const marketAge = useSectionAge('market');

  return {
    network: network.data,
    sections: {
      chain: { freshness: chain.freshness, ageMs: chainAge, asOf: chain.asOf },
      nodes: { freshness: nodes.freshness, ageMs: nodesAge, asOf: nodes.asOf },
      apps: { freshness: apps.freshness, ageMs: appsAge, asOf: apps.asOf },
      market: { freshness: market.freshness, ageMs: marketAge, asOf: market.asOf },
    },
    blocks: blocks.data,
    health: {
      data: health.data,
      freshness: health.freshness,
      ageMs: health.ageMs,
      asOf: health.meta?.asOf ?? null,
    },
    clock,
    reduction,
    nowMs,
  };
}

function Tag({ tag }: { tag: FreshTag }) {
  return <FreshnessChip freshness={tag.freshness} ageMs={tag.ageMs} />;
}

export interface TerminalViewProps {
  /** What follows the `>`. */
  text: string;
  /** Called with the current answer so Enter can copy it. */
  onAnswer: (answer: Answer) => void;
}

/**
 * The terminal answer: mono rows from the live data, each number's freshness beside it. It is
 * only mounted while the deck is in terminal mode, so the data hooks (which tick every second)
 * cost nothing the rest of the time.
 */
export function TerminalView({ text, onAnswer }: TerminalViewProps) {
  const data = useTerminalData();
  const parsed = useMemo(() => parseTerminal(text), [text]);
  const answer = buildAnswer(parsed, data);

  useEffect(() => {
    onAnswer(answer);
  });

  const warn = answer.fresh !== null && answer.fresh.freshness !== 'live';

  return (
    <section className={styles.term} aria-label="Terminal answer">
      <div className={styles.termTop}>
        <span className={styles.termTitle}>{answer.title}</span>
        {answer.fresh ? <Tag tag={answer.fresh} /> : answer.catalog ? <Chip size="sm">Catalog</Chip> : null}
      </div>
      {answer.rows.length > 0 ? (
        <dl className={styles.termRows}>
          {answer.rows.map((row) => (
            <div className={styles.termRow} key={row.label}>
              <dt className={styles.termLabel}>
                {row.tone === 'cumulus' || row.tone === 'nimbus' || row.tone === 'stratus' ? (
                  <Glyph name={TIER_GLYPH[row.tone]} size={14} />
                ) : null}
                <span>{row.label}</span>
              </dt>
              <dd
                className={styles.termValue}
                data-tone={row.tone}
                data-missing={row.missing ? 'true' : undefined}
              >
                <span>{row.value}</span>
                {row.note ? <span className={styles.termNote}>{row.note}</span> : null}
                {row.fresh ? <Tag tag={row.fresh} /> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {answer.note ? (
        <p className={styles.termFoot} data-tone={warn ? 'warn' : undefined}>
          {answer.note}
        </p>
      ) : null}
    </section>
  );
}
