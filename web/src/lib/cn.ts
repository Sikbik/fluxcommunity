/** Joins class names, skipping falsy values. Tiny stand-in for clsx. */
export type ClassValue = string | false | null | undefined | 0;

export function cn(...parts: ClassValue[]): string {
  let out = '';
  for (const part of parts) {
    if (part) out = out ? `${out} ${part}` : part;
  }
  return out;
}
