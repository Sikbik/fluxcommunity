import { type CSSProperties, type RefObject, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';
import { hexPath } from '@/lib/hex';
import { useInView } from '../hooks/useInView';
import { pulseSlots } from '../internal/pulseSlots';
import styles from './HexBullet.module.css';

export interface HexBulletProps {
  /** Width in px. Default 9. */
  size?: number;
  /** Solid (default) or an outline. */
  filled?: boolean;
  /**
   * Pulse a ring outward (a live thing). Default false. Only a few rings animate at once on a
   * page, and only while on screen; a ring that cannot is drawn still.
   */
  pulse?: boolean;
  className?: string;
  style?: CSSProperties;
}

const D = hexPath(12, 12, 10.5);

/** One shared listener for "the tab is hidden": rings do not animate in a background tab. */
const hiddenListeners = new Set<() => void>();
function subscribeHidden(onChange: () => void): () => void {
  if (hiddenListeners.size === 0 && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', notifyHidden);
  }
  hiddenListeners.add(onChange);
  return () => {
    hiddenListeners.delete(onChange);
    if (hiddenListeners.size === 0 && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', notifyHidden);
    }
  };
}
function notifyHidden(): void {
  for (const l of [...hiddenListeners]) l();
}
const isHidden = (): boolean => typeof document !== 'undefined' && document.hidden;
const neverHidden = (): boolean => false;

/**
 * `off`: not pulsing (off screen, or the tab is hidden), `live`: pulsing, `still`: wants to pulse
 * but the page already has its share of live rings, so the ring is drawn without moving.
 */
type RingState = 'off' | 'live' | 'still';

function useRingState(ref: RefObject<HTMLElement | null>, wanted: boolean): RingState {
  const visible = useInView(ref, { rootMargin: '40px' });
  const hidden = useSyncExternalStore(subscribeHidden, isHidden, neverHidden);
  const [live, setLive] = useState(false);
  const active = wanted && visible && !hidden;

  useEffect(() => {
    if (!active) {
      setLive(false);
      return;
    }
    const token = {};
    const attempt = () => {
      if (pulseSlots.claim(token)) setLive(true);
    };
    attempt();
    const stop = pulseSlots.wait(attempt);
    return () => {
      stop();
      pulseSlots.release(token);
      setLive(false);
    };
  }, [active]);

  if (!active) return 'off';
  return live ? 'live' : 'still';
}

/**
 * A hexagon bullet: the site's replacement for the round dot. Takes `currentColor`.
 *
 *   <HexBullet size={8} />
 */
export function HexBullet({ size = 9, filled = true, pulse = false, className, style }: HexBulletProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const ring = useRingState(ref, pulse);
  return (
    <span
      ref={ref}
      className={cn(styles.bullet, className)}
      style={{ inlineSize: size, blockSize: size, ...style }}
      data-pulse={pulse ? 'true' : undefined}
      aria-hidden="true"
    >
      {pulse ? <span className={styles.ring} data-ring={ring} /> : null}
      <svg viewBox="0 0 24 24" width="100%" height="100%" focusable="false" aria-hidden="true">
        <path
          d={D}
          fill={filled ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={filled ? 0 : 2.4}
          strokeLinejoin="miter"
        />
      </svg>
    </span>
  );
}
