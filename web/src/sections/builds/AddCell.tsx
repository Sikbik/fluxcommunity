import { memo } from 'react';
import { hexPath } from '@/lib/hex';
import { Glyph, Panel } from '@/ui';
import styles from './AddCell.module.css';

export const ADD_KEY = '__add';

export interface AddCellProps {
  /** It has the rest of its row to itself (the grid ends on it): lay it out as a strip. */
  wide: boolean;
  tabbable: boolean;
  onFocusCell: (id: string) => void;
  onOpen: (from: HTMLElement) => void;
}

const OUTER = hexPath(50, 50, 46);
const INNER = hexPath(50, 50, 33);

/** The last cell of the grid: it opens the submit helper. A button, not a link. */
export const AddCell = memo(function AddCell({ wide, tabbable, onFocusCell, onOpen }: AddCellProps) {
  return (
    <Panel
      as="button"
      type="button"
      variant="ghost"
      size="md"
      padding="md"
      interactive
      tilt={3.2}
      stageFocus={0.45}
      hot="bl"
      pattern="tr"
      className={styles.add}
      contentClassName={styles.content}
      tabIndex={tabbable ? 0 : -1}
      data-wide={wide ? 'true' : undefined}
      data-roving={ADD_KEY}
      onFocus={() => onFocusCell(ADD_KEY)}
      onClick={(e: { currentTarget: HTMLElement }) => onOpen(e.currentTarget)}
    >
      <span className={styles.emblem} aria-hidden="true">
        <svg viewBox="0 0 100 100" width="100%" height="100%" focusable="false" aria-hidden="true">
          <path className={styles.outer} d={OUTER} />
          <path className={styles.inner} d={INNER} />
        </svg>
        <span className={styles.plus}>
          <Glyph name="plus" size={26} strokeWidth={1.6} />
        </span>
      </span>
      <span className={styles.copy}>
        <span className={styles.title}>Add your app</span>
        <span className={styles.sub}>Built something on Flux? Write the message for the Flux team.</span>
      </span>
    </Panel>
  );
});
