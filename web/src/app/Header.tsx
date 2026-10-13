import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { useOverlays } from '@/lib/overlays';
import { usePrefs } from '@/lib/prefs';
import { sfx } from '@/lib/sound';
import { SECTIONS } from '@/sections/registry';
import { useStageBus } from '@/stage/bus';
import { Button, FluxMark, Glyph, Kbd, Tooltip } from '@/ui';
import { useSlider } from '@/ui/internal/useSlider';
import { AccentSwitcher } from './AccentSwitcher';
import styles from './Header.module.css';
import { MobileNav } from './MobileNav';

/**
 * The page header (banner landmark). Lockup, pill nav with a scroll-spy indicator, the
 * command deck button, the accent switcher and the sound toggle. It condenses after the
 * hero; under 1320 px the nav moves to a sheet behind the hex menu button.
 */
export function Header() {
  const active = useStageBus((s) => s.section);
  const sound = usePrefs((s) => s.sound);
  const setPrefs = usePrefs((s) => s.set);
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const header = useRef<HTMLElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const slider = useSlider(list, active, '[aria-current="true"]');

  // Scrolled and progress are written straight to the DOM: no React render per frame.
  useEffect(() => {
    const el = header.current;
    if (!el) return;
    const apply = () => {
      const s = useStageBus.getState();
      el.style.setProperty('--page-progress', s.pageProgress.toFixed(4));
    };
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    const unsub = useStageBus.subscribe((s, prev) => {
      if (s.pageProgress !== prev.pageProgress) apply();
    });
    return () => {
      window.removeEventListener('scroll', onScroll);
      unsub();
    };
  }, []);

  const condensed = scrolled && active !== 'hero';

  return (
    <>
      <header
        ref={header}
        className={styles.header}
        data-scrolled={scrolled ? 'true' : 'false'}
        data-condensed={condensed ? 'true' : 'false'}
      >
        <div className={styles.bar}>
          <a className={styles.lockup} href="#hero" aria-label="Flux Community, back to the top">
            <FluxMark variant="round" tone="blue" size={34} className={styles.mark} />
            <span className={styles.word}>
              Flux <span>Community</span>
            </span>
          </a>

          <nav className={styles.nav} aria-label="Sections">
            {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from unstyled lists without it */}
            <ul ref={list} className={styles.list} role="list">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    className={styles.link}
                    href={`#${s.id}`}
                    aria-current={active === s.id ? 'true' : undefined}
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
            <span
              className={styles.indicator}
              data-ready={slider.ready ? 'true' : undefined}
              style={{ '--tx': `${slider.x}px`, '--tw': `${slider.w}px` } as CSSProperties}
              aria-hidden="true"
            />
          </nav>

          <div className={styles.tools}>
            <button
              type="button"
              className={`chamfer ${styles.deck}`}
              aria-label="Open the command deck"
              aria-keyshortcuts="Control+K Meta+K"
              onClick={() => useOverlays.getState().openPalette()}
            >
              <Glyph name="search" size={16} className={styles.deckIcon} />
              <span className={styles.deckLabel}>Command deck</span>
              <span className={styles.deckKeys}>
                <Kbd combo="mod+k" size="sm" />
              </span>
            </button>
            <span className={styles.optional}>
              <AccentSwitcher />
            </span>
            <span className={styles.optional}>
              <Tooltip content={sound ? 'Sound on' : 'Sound off'} placement="bottom">
                <Button
                  variant="icon"
                  size="sm"
                  icon={sound ? 'sound-on' : 'sound-off'}
                  label={sound ? 'Sound effects on. Turn off' : 'Sound effects off. Turn on'}
                  aria-pressed={sound}
                  magnetic={false}
                  onClick={() => {
                    setPrefs({ sound: !sound });
                    if (!sound) sfx.preview();
                  }}
                />
              </Tooltip>
            </span>
            <span className={styles.menu}>
              <Button
                variant="icon"
                shape="hex"
                size="sm"
                icon="menu"
                label="Open the menu"
                aria-haspopup="dialog"
                aria-expanded={menu}
                onClick={() => setMenu(true)}
              />
            </span>
          </div>
        </div>
        <span className={styles.progress} aria-hidden="true" />
      </header>
      <MobileNav open={menu} onClose={() => setMenu(false)} />
    </>
  );
}
