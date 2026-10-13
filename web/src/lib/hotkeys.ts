/**
 * Keyboard combo parsing and matching. Pure; the React hook lives in ui/hooks/useHotkeys.
 *
 * Combos are lower-case, `+` separated: "mod+k", "shift+/", "?", "a", "escape", "ctrl+alt+d".
 * `mod` is Command on Apple platforms and Control elsewhere.
 */

export interface ParsedCombo {
  key: string;
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  /** null: the combo does not care about Shift (the usual case for punctuation like "?"). */
  shift: boolean | null;
}

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const ALIASES: Record<string, string> = {
  esc: 'escape',
  space: ' ',
  spacebar: ' ',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  return: 'enter',
  plus: '+',
  del: 'delete',
};

export function parseCombo(combo: string): ParsedCombo {
  const out: ParsedCombo = { key: '', mod: false, ctrl: false, meta: false, alt: false, shift: null };
  // "+" itself is a key: handle a trailing "++" or a lone "+".
  const raw = combo.trim().toLowerCase();
  const parts = raw === '+' ? ['+'] : raw.replace(/\+\+$/, '+plus').split('+');
  for (const part of parts) {
    switch (part) {
      case 'mod':
        out.mod = true;
        break;
      case 'ctrl':
      case 'control':
        out.ctrl = true;
        break;
      case 'meta':
      case 'cmd':
      case 'command':
        out.meta = true;
        break;
      case 'alt':
      case 'option':
        out.alt = true;
        break;
      case 'shift':
        out.shift = true;
        break;
      default:
        out.key = ALIASES[part] ?? part;
    }
  }
  return out;
}

export function matchCombo(e: KeyLike, combo: ParsedCombo, mac: boolean): boolean {
  if (!combo.key) return false;
  if (e.key.toLowerCase() !== combo.key) return false;
  const wantCtrl = combo.ctrl || (combo.mod && !mac);
  const wantMeta = combo.meta || (combo.mod && mac);
  if (e.ctrlKey !== wantCtrl) return false;
  if (e.metaKey !== wantMeta) return false;
  if (e.altKey !== combo.alt) return false;
  if (combo.shift === true && !e.shiftKey) return false;
  return true;
}

/** True when the event target is somewhere the visitor is typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).tagName !== 'string') return false;
  const el = target as HTMLElement;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color', 'image'].includes(
      type,
    );
  }
  return el.isContentEditable === true;
}

/** Human labels for a combo, for kbd chips: "mod+k" -> ["Ctrl", "K"] or ["⌘", "K"]. */
export function comboLabels(combo: string, mac: boolean): string[] {
  const c = parseCombo(combo);
  const out: string[] = [];
  if (c.mod) out.push(mac ? '⌘' : 'Ctrl');
  if (c.ctrl) out.push(mac ? '⌃' : 'Ctrl');
  if (c.alt) out.push(mac ? '⌥' : 'Alt');
  if (c.shift === true) out.push(mac ? '⇧' : 'Shift');
  if (c.meta) out.push(mac ? '⌘' : 'Win');
  const key =
    c.key === 'escape'
      ? 'Esc'
      : c.key === 'arrowup'
        ? '↑'
        : c.key === 'arrowdown'
          ? '↓'
          : c.key === 'arrowleft'
            ? '←'
            : c.key === 'arrowright'
              ? '→'
              : c.key === ' '
                ? 'Space'
                : c.key.length === 1
                  ? c.key.toUpperCase()
                  : c.key.charAt(0).toUpperCase() + c.key.slice(1);
  out.push(key);
  return out;
}
