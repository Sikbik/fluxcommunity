import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clamp } from '@/lib/math';
import { getLayer } from '../internal/layers';
import { Kbd } from '../Kbd/Kbd';
import styles from './Tooltip.module.css';

export interface TooltipProps {
  /** The text shown. Keep it short; do not put the only copy of important information here. */
  content: ReactNode;
  /** A single element that forwards its props to a DOM node (every primitive does). */
  children: ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Hover delay in ms. Keyboard focus shows it immediately. Default 260. */
  delay?: number;
  /** A hotkey combo shown as keycaps after the text, e.g. "mod+k". */
  shortcut?: string;
  disabled?: boolean;
}

const GAP = 10;
const MARGIN = 8;

/**
 * A hover and focus tooltip, portalled above everything. Touch does not open it (there
 * is no hover), so never hide essential information in one. Escape dismisses it.
 *
 *   <Tooltip content="Copy link" shortcut="c"><Button variant="icon" icon="copy" label="Copy link" /></Tooltip>
 */
export function Tooltip({
  content,
  children,
  placement = 'top',
  delay = 260,
  shortcut,
  disabled = false,
}: TooltipProps) {
  const id = useId();
  const wrapper = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; placement: string } | null>(null);

  const anchor = useCallback(() => wrapper.current?.firstElementChild as HTMLElement | null, []);

  const show = useCallback(
    (immediate: boolean) => {
      window.clearTimeout(timer.current);
      if (disabled) return;
      if (immediate || delay === 0) {
        setMounted(true);
        setOpen(true);
      } else {
        timer.current = window.setTimeout(() => {
          setMounted(true);
          setOpen(true);
        }, delay);
      }
    },
    [delay, disabled],
  );

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(false);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Unmount shortly after closing so the fade can play.
  useEffect(() => {
    if (open || !mounted) return;
    const t = window.setTimeout(() => setMounted(false), 160);
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  // Position after mount, once the tooltip has a size.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `content` changes the tooltip's size, so it is measured again
  useLayoutEffect(() => {
    if (!mounted) return;
    const a = anchor();
    const t = tip.current;
    if (!a || !t) return;
    const r = a.getBoundingClientRect();
    const w = t.offsetWidth;
    const h = t.offsetHeight;
    let side = placement;
    if (side === 'top' && r.top - h - GAP < MARGIN) side = 'bottom';
    else if (side === 'bottom' && r.bottom + h + GAP > window.innerHeight - MARGIN) side = 'top';
    else if (side === 'left' && r.left - w - GAP < MARGIN) side = 'right';
    else if (side === 'right' && r.right + w + GAP > window.innerWidth - MARGIN) side = 'left';
    let x = r.left + r.width / 2 - w / 2;
    let y = r.top - h - GAP;
    if (side === 'bottom') y = r.bottom + GAP;
    if (side === 'left') {
      x = r.left - w - GAP;
      y = r.top + r.height / 2 - h / 2;
    }
    if (side === 'right') {
      x = r.right + GAP;
      y = r.top + r.height / 2 - h / 2;
    }
    setPos({
      x: clamp(x, MARGIN, window.innerWidth - w - MARGIN),
      y: clamp(y, MARGIN, window.innerHeight - h - MARGIN),
      placement: side,
    });
  }, [mounted, placement, anchor, content]);

  // Describe the anchor while open; dismiss on Escape and scroll.
  useEffect(() => {
    const a = anchor();
    if (!open || !a) return;
    a.setAttribute('aria-describedby', id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, { passive: true, capture: true });
    return () => {
      a.removeAttribute('aria-describedby');
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', hide, { capture: true });
    };
  }, [open, id, anchor, hide]);

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a `display: contents` observer of its interactive child */}
      <span
        ref={wrapper}
        style={{ display: 'contents' }}
        onPointerOver={(e) => {
          if (e.pointerType === 'touch') return;
          show(false);
        }}
        onPointerOut={(e) => {
          const next = e.relatedTarget as Node | null;
          if (!next || !wrapper.current?.contains(next)) hide();
        }}
        onFocus={(e) => {
          const t = e.target as HTMLElement;
          if (t.matches(':focus-visible')) show(true);
        }}
        onBlur={hide}
        onPointerDown={hide}
      >
        {children}
      </span>
      {mounted
        ? createPortal(
            <div
              ref={tip}
              id={id}
              role="tooltip"
              className={styles.tip}
              data-open={open && pos ? 'true' : 'false'}
              data-placement={pos?.placement}
              style={{ '--tx': `${pos?.x ?? 0}px`, '--ty': `${pos?.y ?? 0}px` } as React.CSSProperties}
            >
              <span className={styles.row}>
                {content}
                {shortcut ? <Kbd combo={shortcut} size="sm" /> : null}
              </span>
            </div>,
            getLayer('tooltip'),
          )
        : null}
    </>
  );
}
