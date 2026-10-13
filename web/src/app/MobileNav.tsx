import { useOverlays } from '@/lib/overlays';
import { usePrefs } from '@/lib/prefs';
import { goToSection } from '@/lib/route';
import { sfx } from '@/lib/sound';
import { SECTIONS } from '@/sections/registry';
import { useStageBus } from '@/stage/bus';
import { Button, Drawer, Glyph, Kbd, Switch } from '@/ui';
import { AccentSwitcher } from './AccentSwitcher';
import styles from './MobileNav.module.css';

/**
 * The phone and tablet navigation: a bottom sheet with every section, the accent
 * switcher, the sound switch and the command deck. Opened from the hex menu button.
 */
export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const active = useStageBus((s) => s.section);
  const sound = usePrefs((s) => s.sound);
  const setPrefs = usePrefs((s) => s.set);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Menu"
      side="bottom"
      description="Jump to a section of the page."
    >
      <nav aria-label="Sections">
        {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from unstyled lists without it */}
        <ul className={styles.list} role="list">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={`chamfer ${styles.item}`}
                aria-current={active === s.id ? 'true' : undefined}
                onClick={() => {
                  onClose();
                  // Let the sheet start closing before the page scrolls under it.
                  window.setTimeout(() => goToSection(s.id), 60);
                }}
              >
                <span className={styles.index}>{s.index}</span>
                <span>{s.label}</span>
                <Glyph name="arrow-right" size={18} className={styles.arrow} />
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className={styles.group}>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Accent</span>
          <AccentSwitcher tooltips={false} />
        </div>
        <Switch
          checked={sound}
          onCheckedChange={(on) => {
            setPrefs({ sound: on });
            if (on) sfx.preview();
          }}
        >
          Sound effects
        </Switch>
        <Button
          variant="secondary"
          icon="command"
          fullWidth
          onClick={() => {
            onClose();
            window.setTimeout(() => useOverlays.getState().openPalette(), 120);
          }}
        >
          Open the command deck
        </Button>
        <p className="t-small">
          On a keyboard, press <Kbd combo="mod+k" size="sm" /> from anywhere.
        </p>
      </div>
    </Drawer>
  );
}
