import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useId,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { Button } from '../Button/Button';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useIsPhone } from '../hooks/useMedia';
import { usePresence } from '../hooks/usePresence';
import { getLayer } from '../internal/layers';
import { Panel } from '../Panel/Panel';
import styles from './Drawer.module.css';

export interface DrawerProps {
  open: boolean;
  /** Called for Escape, the scrim and the close button. Update your state (or the hash) here. */
  onClose: () => void;
  /** The accessible name and the visible heading. */
  title: ReactNode;
  description?: ReactNode;
  /** `auto` (default): right drawer from 720 px up, bottom sheet below. */
  side?: 'auto' | 'right' | 'bottom';
  /** Desktop width: md 560 px, lg 720 px. */
  width?: 'md' | 'lg';
  /** Actions placed beside the close button (copy link, open in a new tab). */
  actions?: ReactNode;
  /** Sticky footer (the primary action). */
  footer?: ReactNode;
  /** Clicking the scrim closes. Default true. */
  dismissOnScrim?: boolean;
  /**
   * Called after the exit animation, when the drawer unmounts. Only after it has really been open:
   * never at mount while `open` is still false.
   */
  onExited?: () => void;
  className?: string;
  children: ReactNode;
}

const EXIT_MS = 340;

/**
 * A modal side panel (a bottom sheet on phones). Focus is trapped, the page behind is
 * `inert` and scroll-locked, Escape closes, and focus returns to what opened it.
 * It is controlled: render it with `open` driven by your state or by the hash route.
 *
 *   const { appId, closeApp } = useHashRoute();
 *   <Drawer open={!!appId} onClose={closeApp} title={app.name}>...</Drawer>
 *
 * Put `data-autofocus` on the element that should take focus first.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  side = 'auto',
  width = 'md',
  actions,
  footer,
  dismissOnScrim = true,
  onExited,
  className,
  children,
}: DrawerProps) {
  const phone = useIsPhone();
  const resolved = side === 'auto' ? (phone ? 'bottom' : 'right') : side;
  const { mounted, state } = usePresence(open, EXIT_MS, { onExited });
  const surface = useRef<HTMLElement | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useFocusTrap(surface, { active: state === 'enter' || state === 'open', onEscape: onClose });

  // Bottom-sheet drag to dismiss.
  const drag = useRef({ y: 0, active: false, t: 0 });
  const onGrabDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { y: e.clientY, active: true, t: performance.now() };
    e.currentTarget.setPointerCapture(e.pointerId);
    root.current?.setAttribute('data-dragging', 'true');
  };
  const onGrabMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    surface.current?.style.setProperty('--drag', `${dy}px`);
  };
  const onGrabUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    const dy = Math.max(0, e.clientY - drag.current.y);
    const v = dy / Math.max(1, performance.now() - drag.current.t);
    root.current?.removeAttribute('data-dragging');
    surface.current?.style.removeProperty('--drag');
    if (dy > 110 || (dy > 30 && v > 0.6)) onClose();
  };

  if (!mounted) return null;
  const layer = getLayer('modal');
  return createPortal(
    <div ref={root} className={styles.root} data-state={state} data-side={resolved} data-width={width}>
      <div className={styles.scrim} onPointerDown={dismissOnScrim ? onClose : undefined} aria-hidden="true" />
      <Panel
        as="section"
        ref={surface}
        variant="slab"
        size="lg"
        padding="none"
        hot="tl"
        pattern="br"
        className={cn(styles.surface, className)}
        contentClassName={styles.inner}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <div
          className={styles.grabber}
          onPointerDown={onGrabDown}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabUp}
          onPointerCancel={onGrabUp}
          aria-hidden="true"
        />
        <header className={styles.head}>
          <div className={styles.titles}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {description ? (
              <p id={descId} className={styles.desc}>
                {description}
              </p>
            ) : null}
          </div>
          <div className={styles.actions}>
            {actions}
            <Button variant="icon" size="sm" icon="close" label="Close" magnetic={false} onClick={onClose} />
          </div>
        </header>
        <div className={styles.body} style={{ '--drag': undefined } as CSSProperties}>
          {children}
        </div>
        {footer ? <footer className={styles.foot}>{footer}</footer> : null}
      </Panel>
    </div>,
    layer,
  );
}
