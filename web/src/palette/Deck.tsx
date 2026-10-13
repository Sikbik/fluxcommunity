import {
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import { useOverlays } from '@/lib/overlays';
import { usePrefs } from '@/lib/prefs';
import {
  Button,
  Chip,
  Glyph,
  getLayer,
  Kbd,
  Panel,
  type PresenceState,
  toast,
  useFocusTrap,
  usePresence,
  useReducedMotion,
} from '@/ui';
import styles from './Deck.module.css';
import { type Range, segments } from './fuzzy';
import { ACTION_IDS, type ActionState, buildItems, type DeckItem } from './items';
import { Preview } from './Preview';
import { type DeckGroup, type DeckRow, rank } from './rank';
import { loadRecents, pushRecent, saveRecents } from './recents';
import { describeActions, runItem } from './run';
import { browserRunEnv } from './runEnv';
import { TerminalView } from './TerminalView';
import { type Answer, carryOver } from './terminal';

const EXIT_MS = 340;

/** The palette layer: above Dialog and Drawer (--z-modal), below toasts. Created on first use. */
function paletteLayer(): HTMLElement {
  getLayer('overlay'); // makes sure #overlay-root exists
  const root = document.getElementById('overlay-root') as HTMLElement;
  let layer = root.querySelector<HTMLElement>(':scope > [data-layer="palette"]');
  if (!layer) {
    layer = document.createElement('div');
    layer.dataset.layer = 'palette';
    layer.style.position = 'relative';
    layer.style.zIndex = 'var(--z-palette)';
    root.appendChild(layer);
  }
  return layer;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function Highlight({ text, ranges }: { text: string; ranges: readonly Range[] }) {
  if (ranges.length === 0) return <>{text}</>;
  return (
    <>
      {segments(text, ranges).map((s, i) =>
        s.hit ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments of one string are static and ordered
          <span key={i} className={styles.hit}>
            {s.text}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments of one string are static and ordered
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function Tile({ tile }: { tile: DeckItem['tile'] }) {
  if ('swatch' in tile) {
    return (
      <span
        className={styles.tile}
        data-swatch=""
        style={{ '--swatch': tile.swatch } as React.CSSProperties}
        aria-hidden="true"
      />
    );
  }
  if ('text' in tile) {
    return (
      <span className={styles.tile} aria-hidden="true">
        {tile.text}
      </span>
    );
  }
  return (
    <span className={styles.tile} aria-hidden="true">
      <Glyph name={tile.glyph} size={18} />
    </span>
  );
}

function badgeTone(badge: string): 'warn' | 'accent' {
  return badge.startsWith('Retiring') ? 'warn' : 'accent';
}

interface RowViewProps {
  row: DeckRow;
  id: string;
  active: boolean;
  /** The pointer moved over this row (with its client position, to tell real moves from scroll). */
  onPointer: (id: string, x: number, y: number) => void;
  onRun: (row: DeckRow) => void;
}

const RowView = memo(function RowView({ row, id, active, onPointer, onRun }: RowViewProps) {
  const { item } = row;
  const stateLabel =
    item.state === 'on' ? 'On' : item.state === 'off' ? 'Off' : item.state === 'current' ? 'Current' : null;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard use is through the combobox input (aria-activedescendant)
    // biome-ignore lint/a11y/useFocusableInteractive: options are never focused; the combobox points at them
    <div
      id={id}
      role="option"
      aria-selected={active}
      data-active={active ? 'true' : 'false'}
      className={cn('chamfer', styles.row)}
      onMouseDown={(e) => e.preventDefault()}
      onPointerMove={(e) => onPointer(item.id, e.clientX, e.clientY)}
      onClick={() => onRun(row)}
    >
      <Tile tile={item.tile} />
      <span className={styles.text}>
        <span className={styles.title}>
          <Highlight text={item.title} ranges={row.titleRanges} />
        </span>
        <span className={styles.sub}>
          <Highlight text={item.subtitle} ranges={row.subRanges} />
        </span>
      </span>
      <span className={styles.trail}>
        {item.meta ? <span className={styles.meta}>{item.meta}</span> : null}
        {item.badge ? (
          <span className={styles.tag} data-tone={badgeTone(item.badge)}>
            {item.badge}
          </span>
        ) : null}
        {stateLabel ? (
          <span className={styles.tag} data-tone={item.state === 'off' ? undefined : 'accent'}>
            {stateLabel}
          </span>
        ) : null}
        {item.chord ? (
          <span className={cn(styles.hintKeys, styles.chord)} aria-hidden="true">
            {item.chord.map((k) => (
              <Kbd size="sm" key={k}>
                {k}
              </Kbd>
            ))}
          </span>
        ) : null}
        {item.external ? (
          <>
            <Glyph name="arrow-up-right" size={15} className={styles.external} />
            <span className="sr-only">Opens in a new tab</span>
          </>
        ) : (
          <Glyph name="arrow-right" size={15} className={styles.enter} />
        )}
      </span>
    </div>
  );
});

// ---------------------------------------------------------------------------
// The deck
// ---------------------------------------------------------------------------

function useActionState(): ActionState {
  const accent = usePrefs((s) => s.accent);
  const sound = usePrefs((s) => s.sound);
  const autoAmbient = usePrefs((s) => s.autoAmbient);
  const motionOverride = usePrefs((s) => s.reducedMotionOverride);
  const reducedMotion = useReducedMotion();
  return useMemo(
    () => ({ accent, sound, autoAmbient, reducedMotion, motionOverride }),
    [accent, sound, autoAmbient, reducedMotion, motionOverride],
  );
}

function closeDeck(): void {
  useOverlays.getState().closePalette();
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** The deck's content, mounted only while it is open (so each opening starts fresh). */
function DeckSurface({ open, state }: { open: boolean; state: PresenceState }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<Answer | null>(null);
  const queryRef = useRef('');
  const lastInput = useRef<'key' | 'pointer'>('key');
  const uid = useId();
  const listId = `${uid}-list`;
  const previewId = `${uid}-preview`;
  const statusId = `${uid}-status`;
  const optionId = useCallback((index: number) => `${uid}-opt-${index}`, [uid]);

  const actionState = useActionState();
  const items = useMemo(() => buildItems(actionState), [actionState]);
  const validIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);

  const [recents, setRecents] = useState<string[]>(() => loadRecents((id) => validIds.has(id)));
  const [query, setQuery] = useState('');
  const [terminal, setTerminal] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [status, setStatus] = useState('');
  queryRef.current = query;

  // ---- ranking --------------------------------------------------------------------------

  const ranked = useMemo(
    () => (terminal ? { groups: [], rows: [], total: 0, tokens: [] } : rank(items, query, { recents })),
    [items, query, recents, terminal],
  );

  // Nothing matched: offer the one useful thing to do about it.
  const view = useMemo<{ groups: DeckGroup[]; rows: DeckRow[]; empty: boolean }>(() => {
    if (terminal) return { groups: [], rows: [], empty: false };
    if (ranked.rows.length > 0 || query.trim() === '') {
      return { groups: ranked.groups, rows: ranked.rows, empty: false };
    }
    const submit = items.find((i) => i.ref === ACTION_IDS.submit);
    if (!submit) return { groups: [], rows: [], empty: true };
    const row: DeckRow = {
      item: submit,
      score: 0,
      titleRanges: [],
      subRanges: [],
      index: 0,
      group: 'action',
    };
    return { groups: [{ id: 'action', label: 'Not here yet?', rows: [row] }], rows: [row], empty: true };
  }, [ranked, query, items, terminal]);

  const activeIndex = useMemo(() => {
    if (view.rows.length === 0) return -1;
    const at = activeId ? view.rows.findIndex((r) => r.item.id === activeId) : -1;
    return at < 0 ? 0 : at;
  }, [view.rows, activeId]);
  const activeRow = activeIndex >= 0 ? (view.rows[activeIndex] ?? null) : null;

  // ---- running -------------------------------------------------------------------------------

  const activate = useCallback((row: DeckRow, how: 'primary' | 'secondary') => {
    const item = row.item;
    const keys = describeActions(item);
    const mode = how === 'secondary' && keys.secondary ? 'secondary' : 'primary';

    if (item.keepOpen) {
      const result = runItem(item, mode, browserRunEnv);
      if (result.terminal) {
        setTerminal(true);
        setQuery(carryOver(queryRef.current));
        setActiveId(null);
        inputRef.current?.focus();
      }
      if (result.announce) setStatus(result.announce);
      return;
    }
    if (!item.transient) {
      setRecents((prev) => {
        const next = pushRecent(prev, item.id);
        saveRecents(next);
        return next;
      });
    }
    // Close first so focus returns to where the visitor was; then act on the next frame, so a
    // section scroll or a drawer sees the right element focused.
    closeDeck();
    requestAnimationFrame(() => runItem(item, mode, browserRunEnv));
  }, []);

  // Hover selects, but only a real move: content scrolling under a still pointer must not steal
  // the selection from the keys.
  const lastPointer = useRef({ x: Number.NaN, y: Number.NaN });
  const onPointer = useCallback((id: string, x: number, y: number) => {
    const p = lastPointer.current;
    if (p.x === x && p.y === y) return;
    lastPointer.current = { x, y };
    lastInput.current = 'pointer';
    setActiveId((cur) => (cur === id ? cur : id));
  }, []);

  const onRunRow = useCallback((row: DeckRow) => activate(row, 'primary'), [activate]);

  // ---- keyboard ----------------------------------------------------------------------------------

  const move = (delta: number) => {
    const n = view.rows.length;
    if (n === 0) return;
    const wrap = Math.abs(delta) === 1;
    const next = wrap ? (activeIndex + delta + n) % n : Math.min(n - 1, Math.max(0, activeIndex + delta));
    lastInput.current = 'key';
    setActiveId(view.rows[next]?.item.id ?? null);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'PageDown':
        e.preventDefault();
        move(6);
        break;
      case 'PageUp':
        e.preventDefault();
        move(-6);
        break;
      case 'Enter': {
        e.preventDefault();
        if (terminal) {
          const answer = answerRef.current;
          if (answer) {
            void copyText(answer.plain).then((ok) => {
              if (ok) toast.success('Answer copied');
              else toast.error('Could not copy the answer');
            });
          }
          break;
        }
        if (activeRow) activate(activeRow, e.shiftKey ? 'secondary' : 'primary');
        break;
      }
      case 'Tab':
        if (!e.shiftKey) {
          e.preventDefault();
          setPreviewOpen((v) => !v);
        }
        break;
      case 'Backspace':
        if (terminal && query === '') {
          e.preventDefault();
          setTerminal(false);
        }
        break;
    }
  };

  const onChange = (value: string) => {
    setActiveId(null);
    lastInput.current = 'key';
    if (!terminal && value.startsWith('>')) {
      setTerminal(true);
      setQuery(value.slice(1).trimStart());
      return;
    }
    setQuery(value);
  };

  // ---- effects --------------------------------------------------------------------------------------

  useFocusTrap(surface, { active: open, onEscape: closeDeck });

  // Keep the active row in view when the keys moved it.
  const activeItemId = activeRow?.item.id ?? null;
  useEffect(() => {
    if (lastInput.current !== 'key' || activeIndex < 0 || activeItemId === null) return;
    if (activeIndex === 0) {
      listRef.current?.scrollTo({ top: 0 });
      return;
    }
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, activeItemId, optionId]);

  // The on-screen keyboard shrinks the visual viewport: size the list to what is visible.
  useEffect(() => {
    const vv = window.visualViewport;
    const root = rootRef.current;
    if (!vv || !root) return;
    const apply = () => root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    apply();
    vv.addEventListener('resize', apply);
    return () => vv.removeEventListener('resize', apply);
  }, []);

  // One polite announcement of how many results, a moment after typing stops.
  useEffect(() => {
    if (terminal || query.trim() === '') return;
    const t = window.setTimeout(() => {
      setStatus(view.empty ? 'No results' : plural(ranked.total, 'result'));
    }, 350);
    return () => window.clearTimeout(t);
  }, [query, terminal, ranked.total, view.empty]);

  // In the terminal, announce the answer once per command, not once per second.
  const answerKey = useRef('');
  const onAnswer = useCallback((answer: Answer) => {
    answerRef.current = answer;
    if (answerKey.current === answer.command + answer.title) return;
    answerKey.current = answer.command + answer.title;
    setStatus(answer.summary);
  }, []);

  // With the preview open, the description follows the selection.
  useEffect(() => {
    if (!previewOpen || !activeRow || terminal) return;
    const t = window.setTimeout(
      () => setStatus(`${activeRow.item.title}. ${activeRow.item.description}`),
      300,
    );
    return () => window.clearTimeout(t);
  }, [previewOpen, activeRow, terminal]);

  // ---- render --------------------------------------------------------------------------------------------

  const keys = activeRow ? describeActions(activeRow.item) : null;
  // A combobox while there is a list; a plain text field in the terminal, where there is none.
  const fieldAria = terminal
    ? { 'aria-describedby': statusId }
    : {
        role: 'combobox' as const,
        'aria-expanded': true,
        'aria-haspopup': 'listbox' as const,
        'aria-controls': listId,
        'aria-activedescendant': activeIndex >= 0 ? optionId(activeIndex) : undefined,
        'aria-autocomplete': 'list' as const,
      };
  // On a phone the full hint would be clipped by the close button.
  const [compact] = useState(() => window.matchMedia?.('(max-width: 720px)').matches ?? false);
  const placeholder = terminal
    ? compact
      ? 'block, nodes, price, apps'
      : 'block, nodes, price, reduction, apps, app, host, help'
    : compact
      ? 'Search the site'
      : 'Search the site, or type > to ask the network';

  return (
    <div ref={rootRef} className={styles.root} data-state={state}>
      <div className={styles.scrim} onPointerDown={closeDeck} aria-hidden="true" />
      <div
        ref={surface}
        className={styles.stack}
        role="dialog"
        aria-modal="true"
        aria-label="Command deck"
        tabIndex={-1}
      >
        <Panel
          variant="glass"
          size="lg"
          padding="none"
          hot="tr"
          pattern="bl"
          className={styles.deck}
          contentClassName={styles.inner}
        >
          <div className={styles.head}>
            {terminal ? (
              <span className={styles.promptChar} aria-hidden="true">
                &gt;
              </span>
            ) : (
              <Glyph name="search" size={20} className={styles.promptGlyph} />
            )}
            <input
              ref={inputRef}
              className={styles.input}
              data-autofocus=""
              type="text"
              aria-label={terminal ? 'Ask the network' : 'Search the site'}
              {...fieldAria}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint={terminal ? 'done' : 'go'}
              placeholder={placeholder}
              value={query}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <div className={styles.headTools}>
              {terminal ? (
                <Chip size="sm" tone="accent" icon="terminal" className={styles.mode}>
                  Terminal
                </Chip>
              ) : null}
              <Button
                variant="icon"
                size="sm"
                icon="close"
                label="Close the command deck"
                magnetic={false}
                onClick={closeDeck}
              />
            </div>
          </div>

          {terminal ? (
            <TerminalView text={query} onAnswer={onAnswer} />
          ) : (
            <div ref={listRef} className={styles.list}>
              {view.empty ? (
                <div className={styles.empty}>
                  <p className={styles.emptyTitle}>No match</p>
                  <p className={styles.emptyText}>Try a name, a builder or a category, or add your own.</p>
                </div>
              ) : null}
              <div role="listbox" id={listId} aria-label="Results">
                {view.groups.map((group) => {
                  const labelId = `${uid}-g-${group.id}`;
                  return (
                    // biome-ignore lint/a11y/useSemanticElements: ARIA group inside a listbox
                    <div role="group" aria-labelledby={labelId} key={group.id}>
                      <div id={labelId} className={styles.groupHead} role="presentation">
                        <span>{group.label}</span>
                        <span className={styles.groupCount}>{group.rows.length}</span>
                      </div>
                      {group.rows.map((row) => (
                        <RowView
                          key={row.item.id}
                          row={row}
                          id={optionId(row.index)}
                          active={row.index === activeIndex}
                          onPointer={onPointer}
                          onRun={onRunRow}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className={styles.foot}>
            {terminal ? (
              <>
                <span className={styles.hint}>
                  <Kbd size="sm">↵</Kbd> Copy answer
                </span>
                <span className={styles.hint}>
                  <Kbd size="sm">⌫</Kbd> Back
                </span>
              </>
            ) : (
              <>
                <span className={styles.hint}>
                  <span className={styles.hintKeys}>
                    <Kbd size="sm">↑</Kbd>
                    <Kbd size="sm">↓</Kbd>
                  </span>{' '}
                  Move
                </span>
                {keys ? (
                  <span className={styles.hint}>
                    <Kbd size="sm">↵</Kbd> {keys.primary}
                  </span>
                ) : null}
                {keys?.secondary ? (
                  <span className={styles.hint}>
                    <span className={styles.hintKeys}>
                      <Kbd size="sm">⇧</Kbd>
                      <Kbd size="sm">↵</Kbd>
                    </span>{' '}
                    {keys.secondary}
                  </span>
                ) : null}
                <span className={styles.hint}>
                  <Kbd size="sm">Tab</Kbd> Preview
                </span>
                {keys?.secondary ? null : (
                  <span className={styles.hint}>
                    <Kbd size="sm">&gt;</Kbd> Ask
                  </span>
                )}
              </>
            )}
            <span className={cn(styles.hint, styles.escHint)}>
              <Kbd size="sm">Esc</Kbd> Close
            </span>
            {!terminal && query.trim() !== '' && !view.empty ? (
              <span className={styles.count}>{plural(ranked.total, 'result')}</span>
            ) : null}
          </div>
        </Panel>

        <Preview
          item={terminal ? null : (activeRow?.item ?? null)}
          open={previewOpen && !terminal}
          id={previewId}
        />
        <div id={statusId} className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {status}
        </div>
      </div>
    </div>
  );
}

export function Deck() {
  const open = useOverlays((s) => s.palette);
  const { mounted, state } = usePresence(open, EXIT_MS);
  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(<DeckSurface open={open} state={state} />, paletteLayer());
}
