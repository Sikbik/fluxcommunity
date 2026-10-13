import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Glyph } from '../Glyph/Glyph';
import type { GlyphName } from '../Glyph/glyphs';
import { getLayer } from '../internal/layers';
import styles from './Toast.module.css';
import { type ToastItem, type ToastKind, useToastStore } from './toastStore';

const ICON: Record<ToastKind, GlyphName> = {
  info: 'info',
  success: 'status-ok',
  warn: 'status-warn',
  error: 'status-crit',
};

const STATUS: Record<ToastKind, string | undefined> = {
  info: undefined,
  success: 'var(--status-ok)',
  warn: 'var(--status-warn)',
  error: 'var(--status-crit)',
};

function ToastView({ item }: { item: ToastItem }) {
  const leave = useToastStore((s) => s.leave);
  const remove = useToastStore((s) => s.remove);
  const timer = useRef(0);
  const remaining = useRef(item.duration);
  const startedAt = useRef(0);
  const held = useRef(false);

  const arm = () => {
    window.clearTimeout(timer.current);
    if (item.duration <= 0 || held.current) return;
    startedAt.current = performance.now();
    timer.current = window.setTimeout(() => leave(item.id), remaining.current);
  };
  const hold = () => {
    held.current = true;
    window.clearTimeout(timer.current);
    remaining.current = Math.max(600, remaining.current - (performance.now() - startedAt.current));
  };
  const release = () => {
    held.current = false;
    arm();
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: armed once per toast; hold and release re-arm explicitly
  useEffect(() => {
    remaining.current = item.duration;
    arm();
    return () => window.clearTimeout(timer.current);
  }, [item.id, item.duration]);

  // Remove from the store once the exit animation has played.
  useEffect(() => {
    if (!item.leaving) return;
    const t = window.setTimeout(() => remove(item.id), 220);
    return () => window.clearTimeout(t);
  }, [item.leaving, item.id, remove]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the handlers only hold the dismissal timer while hovered or focused
    <div
      className={`chamfer ${styles.toast}`}
      data-kind={item.kind}
      data-leaving={item.leaving ? 'true' : undefined}
      style={{ '--status': STATUS[item.kind] } as React.CSSProperties}
      onPointerEnter={hold}
      onPointerLeave={release}
      onFocus={hold}
      onBlur={release}
    >
      <Glyph name={item.icon ?? ICON[item.kind]} size={18} className={styles.icon} />
      <span className={styles.message}>{item.message}</span>
      {item.action ? (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            item.action?.onClick();
            leave(item.id);
          }}
        >
          {item.action.label}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Renders the toasts. Mounted once by the shell; section code only calls `toast()`.
 * Polite live region: confirmations are announced without interrupting.
 */
export function ToastHost() {
  const items = useToastStore((s) => s.items);
  const layer = typeof document === 'undefined' ? null : getLayer('toast');
  if (!layer) return null;
  return createPortal(
    <section className={styles.host} aria-label="Notifications">
      <div aria-live="polite" aria-atomic="false" style={{ display: 'contents' }}>
        {items.map((item) => (
          <ToastView key={item.id} item={item} />
        ))}
      </div>
    </section>,
    layer,
  );
}
