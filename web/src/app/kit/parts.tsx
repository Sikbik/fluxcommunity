import type { CSSProperties, ReactNode } from 'react';
import styles from './kit.module.css';

export function Group({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.group} aria-labelledby={`${id}-t`}>
      <div className={styles.groupHead}>
        <h2 id={`${id}-t`} className={styles.groupTitle}>
          {title}
        </h2>
        {lead ? <p className={styles.groupLead}>{lead}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Grid({ min, children }: { min?: number; children: ReactNode }) {
  return (
    <div className={styles.grid} style={min ? ({ '--min': `${min}px` } as CSSProperties) : undefined}>
      {children}
    </div>
  );
}

export function Spec({ label, note, children }: { label: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.spec}>
      <span className={styles.specLabel}>{label}</span>
      {children}
      {note ? <span className={styles.specNote}>{note}</span> : null}
    </div>
  );
}

export function Row({ children, align }: { children: ReactNode; align?: 'end' | 'baseline' }) {
  return (
    <div
      className={styles.row}
      style={align ? { alignItems: align === 'end' ? 'flex-end' : 'baseline' } : undefined}
    >
      {children}
    </div>
  );
}

export function Col({ children }: { children: ReactNode }) {
  return <div className={styles.col}>{children}</div>;
}
