import { type ReactNode, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { Button } from '../Button/Button';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { usePresence } from '../hooks/usePresence';
import { getLayer } from '../internal/layers';
import { Panel } from '../Panel/Panel';
import styles from './Dialog.module.css';

export interface DialogProps {
  open: boolean;
  /** Called for Escape, the scrim and the close button. */
  onClose: () => void;
  /** The accessible name and the visible heading. */
  title: ReactNode;
  description?: ReactNode;
  /** sm 420 px, md 560 px (default), lg 760 px. */
  size?: 'sm' | 'md' | 'lg';
  /** Buttons, right-aligned. */
  footer?: ReactNode;
  /** Clicking the scrim closes. Default true. */
  dismissOnScrim?: boolean;
  /** Hide the close button (the footer must then offer a way out). */
  hideClose?: boolean;
  /** Called after the exit animation, when the dialog unmounts; never at mount while `open` is false. */
  onExited?: () => void;
  className?: string;
  children?: ReactNode;
}

const EXIT_MS = 340;

/**
 * A centred modal dialog on a glass slab. Same behaviour as Drawer: focus trap, inert and
 * scroll-locked page, Escape closes, focus returns. Use `data-autofocus` to choose the
 * first focus target.
 *
 *   <Dialog open={open} onClose={close} title="Add your app" footer={<Button>Copy message</Button>}>...</Dialog>
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  dismissOnScrim = true,
  hideClose = false,
  onExited,
  className,
  children,
}: DialogProps) {
  const { mounted, state } = usePresence(open, EXIT_MS, { onExited });
  const surface = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  useFocusTrap(surface, { active: state === 'enter' || state === 'open', onEscape: onClose });

  if (!mounted) return null;
  return createPortal(
    <div className={styles.root} data-state={state} data-size={size}>
      <div className={styles.scrim} onPointerDown={dismissOnScrim ? onClose : undefined} aria-hidden="true" />
      <Panel
        as="section"
        ref={surface}
        variant="slab"
        size="lg"
        padding="none"
        hot="tr"
        pattern="tl"
        className={cn(styles.surface, className)}
        contentClassName={styles.inner}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
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
          {hideClose ? null : (
            <Button variant="icon" size="sm" icon="close" label="Close" magnetic={false} onClick={onClose} />
          )}
        </header>
        {children != null ? <div className={styles.body}>{children}</div> : null}
        {footer ? <footer className={styles.foot}>{footer}</footer> : null}
      </Panel>
    </div>,
    getLayer('modal'),
  );
}
