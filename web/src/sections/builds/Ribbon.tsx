import { COPY } from '@/content/copy';
import { cn } from '@/lib/cn';
import { Glyph, HexBullet } from '@/ui';
import type { AppEntry } from './model';
import styles from './Ribbon.module.css';

/**
 * The small flag over an app's picture: "New", "Retiring Nov 1", "Retired", or "You are here" for
 * this site. Renders nothing for an ordinary app.
 */
export function Ribbon({ entry, className }: { entry: AppEntry; className?: string }) {
  const { lifecycle } = entry;
  if (entry.app.self) {
    return (
      <span className={cn('chamfer', styles.ribbon, className)} data-state="self">
        <HexBullet size={9} pulse />
        {COPY.youAreHere}
      </span>
    );
  }
  if (!lifecycle.label) return null;
  const glyph = lifecycle.state === 'new' ? 'spark' : lifecycle.state === 'retiring' ? 'clock' : 'status-off';
  return (
    <span className={cn('chamfer', styles.ribbon, className)} data-state={lifecycle.state}>
      <Glyph name={glyph} size={12} />
      {lifecycle.label}
    </span>
  );
}
