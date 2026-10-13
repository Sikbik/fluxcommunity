import { useTick } from '@/system/useTick';
import styles from './Ambient.module.css';

const hourMinute = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dateLong = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

/** The big clock and the date, in the visitor's own locale and time zone. Ticks once a second. */
export function Clock() {
  const now = useTick(1000);
  const date = new Date(now);
  const parts = hourMinute.formatToParts(date);
  const hm = parts
    .filter((p) => p.type === 'hour' || p.type === 'minute' || p.type === 'literal')
    .map((p) => (p.type === 'literal' ? p.value.trim() || '' : p.value))
    .join('');
  const period = parts.find((p) => p.type === 'dayPeriod')?.value ?? '';
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const day = dateLong.format(date);

  return (
    <>
      <p className={styles.time}>
        <span className="sr-only">{`${hourMinute.format(date)}, ${day}`}</span>
        <span className={styles.digits} aria-hidden="true">
          {hm}
        </span>
        <span className={styles.small} aria-hidden="true">
          <span className={styles.period}>{period}</span>
          <span className={styles.secs}>{seconds}</span>
        </span>
      </p>
      <p className={styles.date} aria-hidden="true">
        {day}
      </p>
    </>
  );
}
