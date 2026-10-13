/**
 * Hooks the sound engine up to the page, with one delegated listener set rather than edits to
 * primitives: pointer-over and click on links, buttons and anything marked `data-sound`, the
 * real-block pulses on the stage bus, the ambient mode swell, and confirm or warn blips for
 * toasts. Everything is attached only while sound is ON, so the default page carries none of it.
 *
 * Opt a control out with `data-sound="off"` (on it or an ancestor), or pick its press sound with
 * `data-sound="confirm"` or `"warn"`.
 */
import { useOverlays } from '@/lib/overlays';
import { usePrefs } from '@/lib/prefs';
import { useStageBus } from '@/stage/bus';
import { useToastStore } from '@/ui/Toast/exports';
import { type SoundEngine, sfx } from './sound';
import { soundForAttribute } from './soundlogic';

/** What makes a sound: the pressable things, plus anything that opts in. */
export const SOUND_TARGETS =
  'a[href], button, [role="button"], [role="option"], [role="tab"], [role="radio"], [role="switch"], summary, [data-sound]';

/** The control an event came from, or null when it is not one that makes a sound. */
export function findSoundTarget(from: EventTarget | null): Element | null {
  const el = from as Element | null;
  if (!el || typeof el.closest !== 'function') return null;
  const hit = el.closest(SOUND_TARGETS);
  if (!hit) return null;
  if (hit.closest('[data-sound="off"]')) return null;
  if (hit.matches(':disabled, [aria-disabled="true"]')) return null;
  return hit;
}

type Effects = Pick<SoundEngine, 'tick' | 'click' | 'confirm' | 'warn'>;

/**
 * The delegated pointer and click listeners. Returns the detach function. Only trusted clicks (a
 * person pressing) sound; `trustedOnly: false` exists for tests, where events are synthetic.
 */
export function attachDelegates(
  doc: Document,
  engine: Effects,
  { trustedOnly = true }: { trustedOnly?: boolean } = {},
): () => void {
  const onOver = (e: PointerEvent) => {
    // Hover is a mouse and pen idea; a touch has no "over".
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    const hit = findSoundTarget(e.target);
    if (!hit) return;
    // Moving between children of one control is not entering it.
    const from = e.relatedTarget as Node | null;
    if (from && hit.contains(from)) return;
    engine.tick();
  };
  const onClick = (e: MouseEvent) => {
    // A script clicking a hidden anchor (launching a link) is not the visitor pressing something.
    if (trustedOnly && !e.isTrusted) return;
    const hit = findSoundTarget(e.target);
    if (!hit) return;
    const id = soundForAttribute(hit.getAttribute('data-sound'), 'click');
    if (id === 'tick') engine.tick();
    else if (id === 'confirm') engine.confirm();
    else if (id === 'warn') engine.warn();
    else if (id === 'click') engine.click();
  };
  const opts = { capture: true, passive: true } as const;
  doc.addEventListener('pointerover', onOver as EventListener, opts);
  doc.addEventListener('click', onClick as EventListener, opts);
  return () => {
    doc.removeEventListener('pointerover', onOver as EventListener, opts);
    doc.removeEventListener('click', onClick as EventListener, opts);
  };
}

function attachAll(engine: SoundEngine): () => void {
  const offDom = attachDelegates(document, engine);

  // A real block (never a simulated one) rings the chime.
  let seen = useStageBus.getState().pulses.at(-1)?.id ?? 0;
  const offBus = useStageBus.subscribe((state) => {
    for (const p of state.pulses) {
      if (p.id <= seen) continue;
      seen = p.id;
      if (p.kind === 'block') engine.chime();
    }
  });

  // Ambient mode: the page falls away, then comes back.
  const offAmbient = useOverlays.subscribe((s, prev) => {
    if (s.ambient === prev.ambient) return;
    if (s.ambient) engine.swellIn();
    else engine.swellOut();
  });

  // Toasts say good or bad news; the sound agrees.
  const offToast = useToastStore.subscribe((s, prev) => {
    for (const item of s.items) {
      if (item.leaving || prev.items.includes(item)) continue;
      if (item.kind === 'success') engine.confirm();
      else if (item.kind === 'warn' || item.kind === 'error') engine.warn();
    }
  });

  return () => {
    offDom();
    offBus();
    offAmbient();
    offToast();
  };
}

/**
 * Starts the wiring. It follows `prefs.sound`: attached while on, detached while off. Returns a
 * stop function for effect cleanup.
 */
export function startSound(engine: SoundEngine = sfx): () => void {
  let detach: (() => void) | null = null;
  const apply = (on: boolean) => {
    if (on && !detach) detach = attachAll(engine);
    else if (!on && detach) {
      detach();
      detach = null;
    }
  };
  apply(usePrefs.getState().sound);
  const unsubscribe = usePrefs.subscribe((s, prev) => {
    if (s.sound !== prev.sound) apply(s.sound);
  });
  return () => {
    unsubscribe();
    detach?.();
    detach = null;
  };
}
