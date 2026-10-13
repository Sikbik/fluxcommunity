import { useEffect, useRef } from 'react';
import { isTypingTarget, matchCombo, type ParsedCombo, parseCombo } from '@/lib/hotkeys';
import { isMacLike } from '@/lib/platform';

/** Return false to decline the key (nothing is prevented and lower priorities may run). */
// biome-ignore lint/suspicious/noConfusingVoidType: handlers are usually arrow functions returning nothing
export type HotkeyHandler = (event: KeyboardEvent) => void | boolean;

export interface HotkeyOptions {
  /** Default true. */
  enabled?: boolean;
  /** Higher runs first; the first handler that does not return false wins. Default 0. */
  priority?: number;
  /** Also fire while the visitor is typing in a field. Default false (combos with a modifier and Escape always may). */
  allowInInputs?: boolean;
  /** Fire on key repeat. Default false. */
  allowRepeat?: boolean;
}

interface Registration {
  bindings: Array<{ combo: ParsedCombo; handler: HotkeyHandler }>;
  options: Required<HotkeyOptions>;
  order: number;
}

const registrations = new Set<Registration>();
let order = 0;
let attached = false;

function onKeyDown(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.isComposing) return;
  const mac = isMacLike();
  const typing = isTypingTarget(e.target);
  const sorted = [...registrations].sort(
    (a, b) => b.options.priority - a.options.priority || a.order - b.order,
  );
  for (const reg of sorted) {
    if (!reg.options.enabled) continue;
    if (e.repeat && !reg.options.allowRepeat) continue;
    for (const { combo, handler } of reg.bindings) {
      if (!matchCombo(e, combo, mac)) continue;
      const hasModifier = combo.mod || combo.ctrl || combo.meta || combo.alt;
      if (typing && !reg.options.allowInInputs && !hasModifier && combo.key !== 'escape') continue;
      const result = handler(e);
      if (result === false) continue;
      e.preventDefault();
      return;
    }
  }
}

function attach(): void {
  if (attached || typeof window === 'undefined') return;
  attached = true;
  window.addEventListener('keydown', onKeyDown);
}

function detach(): void {
  if (!attached || registrations.size > 0) return;
  attached = false;
  window.removeEventListener('keydown', onKeyDown);
}

/**
 * Registers keyboard shortcuts for the lifetime of the component.
 *
 *   useHotkeys({ '/': () => inputRef.current?.focus(), 'mod+k': openPalette }, { priority: 10 });
 *
 * One global listener serves every registration. Plain keys are ignored while typing in a
 * field unless `allowInInputs`. Handlers may return false to decline.
 */
export function useHotkeys(bindings: Record<string, HotkeyHandler>, options: HotkeyOptions = {}): void {
  const latest = useRef(bindings);
  latest.current = bindings;
  const { enabled = true, priority = 0, allowInInputs = false, allowRepeat = false } = options;
  const keys = Object.keys(bindings).join('\u0000');

  useEffect(() => {
    const reg: Registration = {
      bindings: keys
        .split('\u0000')
        .filter(Boolean)
        .map((combo) => ({
          combo: parseCombo(combo),
          handler: (e) => latest.current[combo]?.(e),
        })),
      options: { enabled, priority, allowInInputs, allowRepeat },
      order: order++,
    };
    registrations.add(reg);
    attach();
    return () => {
      registrations.delete(reg);
      detach();
    };
  }, [keys, enabled, priority, allowInInputs, allowRepeat]);
}
