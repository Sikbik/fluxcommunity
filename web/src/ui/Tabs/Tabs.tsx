import { type CSSProperties, type KeyboardEvent, type ReactNode, useRef } from 'react';
import { cn } from '@/lib/cn';
import { Glyph } from '../Glyph/Glyph';
import type { GlyphName } from '../Glyph/glyphs';
import { useSlider } from '../internal/useSlider';
import styles from './Tabs.module.css';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  icon?: GlyphName;
  count?: number;
}

export interface TabsProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  items: readonly TabItem<T>[];
  /** Prefix for the generated ids that wire tabs to panels (see `tabIds`). */
  idBase: string;
  /** REQUIRED: names the tab list. */
  'aria-label': string;
  className?: string;
}

/** The ids Tabs gives the tab and its panel, so a TabPanel can point back at them. */
export function tabIds(idBase: string, value: string): { tab: string; panel: string } {
  return { tab: `${idBase}-tab-${value}`, panel: `${idBase}-panel-${value}` };
}

/**
 * A tab list: arrows move and activate, Home and End jump, one tab stop, and a line
 * slides under the selected tab. Render the content with <TabPanel>.
 *
 *   <Tabs idBase="learn" aria-label="Steps" value={step} onValueChange={setStep} items={...} />
 *   <TabPanel idBase="learn" value="describe" active={step === 'describe'}>...</TabPanel>
 */
export function Tabs<T extends string>({
  value,
  onValueChange,
  items,
  idBase,
  className,
  'aria-label': ariaLabel,
}: TabsProps<T>) {
  const list = useRef<HTMLDivElement>(null);
  const slider = useSlider(list, value, '[aria-selected="true"]');

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = items.findIndex((o) => o.value === value);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % items.length;
    if (e.key === 'ArrowLeft') next = (i - 1 + items.length) % items.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = items.length - 1;
    const target = items[next];
    if (!target) return;
    onValueChange(target.value);
    requestAnimationFrame(() => {
      list.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
    });
  };

  return (
    <div
      ref={list}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(styles.list, className)}
      onKeyDown={onKeyDown}
      style={{ '--tx': `${slider.x}px`, '--tw': `${slider.w}px` } as CSSProperties}
    >
      {items.map((it) => {
        const selected = it.value === value;
        const ids = tabIds(idBase, it.value);
        return (
          <button
            key={it.value}
            id={ids.tab}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={ids.panel}
            tabIndex={selected ? 0 : -1}
            className={styles.tab}
            onClick={() => onValueChange(it.value)}
          >
            {it.icon ? <Glyph name={it.icon} size={16} /> : null}
            {it.label}
            {it.count !== undefined ? <span className={styles.count}>{it.count}</span> : null}
          </button>
        );
      })}
      <span className={styles.line} data-ready={slider.ready ? 'true' : undefined} aria-hidden="true" />
    </div>
  );
}

export interface TabPanelProps {
  idBase: string;
  value: string;
  /** Whether this panel is the selected one. Inactive panels are not rendered. */
  active: boolean;
  className?: string;
  children?: ReactNode;
}

/** The panel for one tab. Only the active panel is rendered. */
export function TabPanel({ idBase, value, active, className, children }: TabPanelProps) {
  if (!active) return null;
  const ids = tabIds(idBase, value);
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: WAI-ARIA tabs pattern, the panel is the tab stop when it holds no focusable content
    <div id={ids.panel} role="tabpanel" aria-labelledby={ids.tab} tabIndex={0} className={className}>
      {children}
    </div>
  );
}
