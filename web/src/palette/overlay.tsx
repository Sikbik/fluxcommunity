/**
 * The command deck, the shortcuts sheet and the `g` section chords. Discovered by the shell's
 * OverlayHost; it reacts to the `palette` and `shortcuts` flags in `useOverlays` and owns no
 * trigger of its own (the shell owns Ctrl K, `/` and `?`).
 */
import { ChordHint, useChords } from './ChordHint';
import { Deck } from './Deck';
import { ShortcutsSheet } from './ShortcutsSheet';

export default function PaletteOverlay() {
  const armed = useChords();
  return (
    <>
      <Deck />
      <ShortcutsSheet />
      <ChordHint armed={armed} />
    </>
  );
}
