import { type KeyboardEvent, useCallback, useMemo, useRef, useState } from 'react';
import { Reveal, useReducedMotion } from '@/ui';
import { ADD_KEY, AddCell } from './AddCell';
import { AppCell } from './AppCell';
import styles from './CellsView.module.css';
import { type Direction, nextIndex } from './gridNav';
import type { AppEntry } from './model';
import { rememberOpener } from './opener';
import { useColumns } from './useColumns';
import { useFlip } from './useFlip';

export interface CellsViewProps {
  entries: readonly AppEntry[];
  /** The id of the list, for the search field's aria-controls. */
  id: string;
  /** Builders with more than one build: only their credit is a pivot. */
  pivotBuilders: ReadonlySet<string>;
  onPivot: (builder: string) => void;
  onAdd: () => void;
}

type Item = { kind: 'app'; key: string; entry: AppEntry } | { kind: 'add'; key: string };

const KEYS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Home: 'home',
  End: 'end',
};

/**
 * The cells grid: a real list of links, keyboard-travelled with the arrow keys (one tab stop for
 * the whole grid, then Tab reaches that cell's Launch and credit), reordered with FLIP when the
 * filters change, and revealed a row at a time.
 */
export function CellsView({ entries, id, pivotBuilders, onPivot, onAdd }: CellsViewProps) {
  const reduced = useReducedMotion();
  const list = useRef<HTMLUListElement>(null);
  const ghosts = useRef<HTMLDivElement>(null);
  const columns = useColumns(list);
  const [active, setActive] = useState<string | null>(null);

  const items = useMemo<Item[]>(
    () => [
      ...entries.map((entry): Item => ({ kind: 'app', key: entry.app.id, entry })),
      { kind: 'add', key: ADD_KEY },
    ],
    [entries],
  );

  // The last cell takes the rest of its row, so the grid never ends on a lone orphan.
  const addSpan = columns - (entries.length % columns);

  const signature = items.map((i) => i.key).join('|');
  useFlip(list, signature, { enabled: !reduced, ghosts });

  // Roving focus: one cell is in the tab order. If it was filtered away, the first one is.
  const tabbableKey = items.some((i) => i.key === active) ? active : (items[0]?.key ?? null);

  const onFocusCell = useCallback((key: string) => setActive(key), []);
  const onOpen = useCallback((_id: string, from: HTMLElement) => rememberOpener(from), []);
  const onAddOpen = useCallback(
    (from: HTMLElement) => {
      rememberOpener(from);
      onAdd();
    },
    [onAdd],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const dir = KEYS[e.key];
    if (!dir || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const target = e.target as HTMLElement;
    if (!target.hasAttribute('data-roving')) return;
    const nodes = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-roving]'));
    const at = nodes.indexOf(target);
    if (at < 0) return;
    const boxes = nodes.map((n) => {
      // Rows are found by the cell, not the link: the link is the title inside it.
      const r = (n.closest('[data-flip]') ?? n).getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    const to = nextIndex(boxes, at, dir);
    if (to === at || to < 0) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    nodes[to]?.focus();
  };

  return (
    <div className={styles.wrap} data-builds-grid="">
      <ul
        ref={list}
        id={id}
        className={styles.grid}
        // biome-ignore lint/a11y/noRedundantRoles: an explicit list role keeps list semantics in Safari when list-style is none
        role="list"
        aria-label="Community builds"
        onKeyDown={onKeyDown}
      >
        {items.map((item, i) => {
          const column = i % columns;
          return (
            <Reveal
              as="li"
              key={item.key}
              index={column}
              className={styles.item}
              style={item.kind === 'add' && addSpan > 1 ? { gridColumn: `span ${addSpan}` } : undefined}
              data-flip={item.key}
            >
              {item.kind === 'app' ? (
                <AppCell
                  entry={item.entry}
                  tabbable={item.key === tabbableKey}
                  onFocusCell={onFocusCell}
                  pivotable={item.entry.app.builder !== null && pivotBuilders.has(item.entry.app.builder)}
                  onPivot={onPivot}
                  onOpen={onOpen}
                />
              ) : (
                <AddCell
                  wide={addSpan > 1}
                  tabbable={item.key === tabbableKey}
                  onFocusCell={onFocusCell}
                  onOpen={onAddOpen}
                />
              )}
            </Reveal>
          );
        })}
      </ul>
      <div ref={ghosts} className={styles.ghosts} aria-hidden="true" />
    </div>
  );
}
