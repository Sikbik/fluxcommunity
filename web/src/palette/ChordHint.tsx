import { useEffect, useMemo, useRef, useState } from 'react';
import { SECTION_META } from '@/content/sections';
import { anyModalOverlayOpen, useOverlays } from '@/lib/overlays';
import { goToSection } from '@/lib/route';
import { Kbd, Panel, useHotkeys, usePresence } from '@/ui';
import { modalCount } from '@/ui/internal/modal';
import { type ChordMachine, createChordMachine } from './chords';
import styles from './Shortcuts.module.css';
import { CHORD_PREFIX, CHORD_TIMEOUT_MS, SECTION_CHORDS, sectionForChord } from './shortcuts';

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

/**
 * `g` then a letter jumps to a section (`g b` is Builds). Registered through `useHotkeys` at
 * priority 10 and ignored while typing, like every plain key. Returns whether a chord is armed,
 * so the hint can show what comes next.
 */
export function useChords(): boolean {
  const [armed, setArmed] = useState(false);
  const machine = useRef<ChordMachine | null>(null);
  if (!machine.current) machine.current = createChordMachine();
  const timer = useRef(0);
  const ambient = useOverlays((s) => s.ambient);
  const modal = useOverlays(anyModalOverlayOpen);

  const bindings = useMemo(() => {
    const m = machine.current as ChordMachine;
    const disarm = () => {
      window.clearTimeout(timer.current);
      m.reset();
      setArmed(false);
    };
    const handler = (key: string) => () => {
      // Another modal (a drawer, the deck) or ambient mode owns the keyboard right now.
      if (modalCount() > 0 || useOverlays.getState().ambient) return false;
      const result = m.press(key, performance.now());
      if (result.type === 'armed') {
        setArmed(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(disarm, CHORD_TIMEOUT_MS);
        return undefined;
      }
      if (result.type === 'jump') {
        disarm();
        goToSection(result.section);
        return undefined;
      }
      return false;
    };
    const map: Record<string, () => boolean | undefined> = { [CHORD_PREFIX]: handler(CHORD_PREFIX) };
    for (const { key } of SECTION_CHORDS) map[key] = handler(key);
    return map;
  }, []);

  useHotkeys(bindings, { priority: 10, enabled: !ambient && !modal });

  // Any other key (or a modifier combo) cancels a half-typed chord.
  useEffect(() => {
    if (!armed) return;
    const onKey = (e: KeyboardEvent) => {
      if (MODIFIER_KEYS.has(e.key)) return;
      if (sectionForChord(e.key) !== null && !e.ctrlKey && !e.metaKey && !e.altKey) return;
      window.clearTimeout(timer.current);
      machine.current?.reset();
      setArmed(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [armed]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Opening something modal while armed drops the chord.
  useEffect(() => {
    if (modal || ambient) {
      machine.current?.reset();
      setArmed(false);
    }
  }, [modal, ambient]);

  return armed;
}

/** The pill that shows what each letter does for a moment after `g`. */
export function ChordHint({ armed }: { armed: boolean }) {
  const { mounted, state } = usePresence(armed, 240);
  if (!mounted) return null;
  return (
    <div className={styles.chord} data-open={state === 'open' ? 'true' : 'false'} role="status">
      <Panel variant="slab" size="sm" padding="none" halo={false} ticks={false} hot="tr" pattern="none">
        <div className={styles.chordInner}>
          <span className={styles.chordLead}>
            <Kbd size="sm">{CHORD_PREFIX}</Kbd>
            then
          </span>
          {SECTION_CHORDS.map(({ key, section }) => (
            <span className={styles.chordItem} key={key}>
              <Kbd size="sm">{key}</Kbd>
              {SECTION_META[section].label}
            </span>
          ))}
        </div>
      </Panel>
    </div>
  );
}
