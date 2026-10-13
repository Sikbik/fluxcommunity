import { type CSSProperties, type KeyboardEvent, useRef } from 'react';
import { ACCENT_LIST } from '@/content/accents';
import { usePrefs } from '@/lib/prefs';
import { sfx } from '@/lib/sound';
import { Tooltip } from '@/ui';
import styles from './AccentSwitcher.module.css';

/**
 * Four hex swatches: Flux blue, Cumulus cyan, Nimbus violet, Stratus amber. A radio
 * group (arrows move and select). The accent re-colours the UI and the lattice glow;
 * the Flux symbol never changes.
 */
export function AccentSwitcher({ tooltips = true }: { tooltips?: boolean }) {
  const accent = usePrefs((s) => s.accent);
  const set = usePrefs((s) => s.set);
  const group = useRef<HTMLDivElement>(null);

  const choose = (id: (typeof ACCENT_LIST)[number]['id']) => {
    if (id === accent) return;
    set({ accent: id });
    sfx.confirm();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = ACCENT_LIST.findIndex((a) => a.id === accent);
    let next = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % ACCENT_LIST.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (i - 1 + ACCENT_LIST.length) % ACCENT_LIST.length;
    else return;
    e.preventDefault();
    const target = ACCENT_LIST[next];
    if (!target) return;
    choose(target.id);
    requestAnimationFrame(() =>
      group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus(),
    );
  };

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label="Accent colour"
      className={styles.group}
      onKeyDown={onKeyDown}
    >
      {ACCENT_LIST.map((a) => {
        const checked = a.id === accent;
        const button = (
          // biome-ignore lint/a11y/useSemanticElements: custom radio button
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={a.name}
            tabIndex={checked ? 0 : -1}
            className={styles.swatch}
            style={{ '--sw': a.swatch } as CSSProperties}
            onClick={() => choose(a.id)}
          >
            <span className={styles.ring} aria-hidden="true" />
            <span className={styles.hex} aria-hidden="true" />
          </button>
        );
        return tooltips ? (
          <Tooltip key={a.id} content={`${a.name}`} placement="bottom">
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </div>
  );
}
