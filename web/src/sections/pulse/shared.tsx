/**
 * Small pieces every tile shares: the tile header, the freshness chips (each number is labelled with
 * its own section's freshness, never the whole snapshot's), a calm "not available" note and the
 * roll-in hook that makes a number count up the first time its tile scrolls into view.
 */
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import {
  type SectionKey,
  useBlocks,
  useConnection,
  useGeo,
  useSectionAge,
  useSectionFreshness,
} from '@/data';
import { FreshnessChip, HexBullet, useInView, useReducedMotion } from '@/ui';
import styles from './shared.module.css';

export function TileHeader({
  label,
  detail,
  chip,
}: {
  label: string;
  /** A short mono caption under the label. */
  detail?: ReactNode;
  chip?: ReactNode;
}) {
  return (
    <header className={styles.head}>
      <div className={styles.titles}>
        <h3 className={styles.label}>
          <HexBullet size={9} className={styles.bullet} />
          <span>{label}</span>
        </h3>
        {detail ? <p className={styles.detail}>{detail}</p> : null}
      </div>
      {chip ? <div className={styles.chip}>{chip}</div> : null}
    </header>
  );
}

/** A freshness chip for one section of the network snapshot, with its own age. */
export function SectionChip({ section }: { section: SectionKey }) {
  const { freshness } = useSectionFreshness(section);
  const ageMs = useSectionAge(section);
  const connection = useConnection();
  return <FreshnessChip freshness={freshness} ageMs={ageMs} polling={connection === 'polling'} />;
}

export function GeoChip() {
  const geo = useGeo();
  const connection = useConnection();
  return <FreshnessChip value={geo} polling={connection === 'polling'} />;
}

export function BlocksChip() {
  const blocks = useBlocks();
  const connection = useConnection();
  return <FreshnessChip value={blocks} polling={connection === 'polling'} />;
}

/** A quiet, complete sentence in place of a number that is null. Never a zero. */
export function Unavailable({ children }: { children: ReactNode }) {
  return (
    <p className={styles.unavailable}>
      <span className={styles.unavailableMark} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/**
 * True once the element has been seen (or immediately under reduced motion). Pair with `useRollIn` so
 * a number counts up the first time its tile is on screen and then follows the data.
 */
export function useEntered<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const reduced = useReducedMotion();
  const seen = useInView(ref, { once: true, threshold: 0.2 });
  return [ref, reduced || seen];
}

/**
 * The value to feed an `Odometer` so it rolls in from zero the first time the tile is seen and then
 * simply follows the data. Returns 0 while waiting; the caller renders a skeleton for `null` itself.
 */
export function useRollIn(value: number | null, entered: boolean): number {
  const reduced = useReducedMotion();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (armed || !entered || value === null) return;
    const id = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(id);
  }, [armed, entered, value]);
  if (value === null) return 0;
  return reduced || armed ? value : 0;
}

/** Digits of the integer part, so an odometer rolling in from zero has the final width from the start. */
export function integerDigits(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 1;
  return String(Math.max(0, Math.round(Math.abs(value)))).length;
}
