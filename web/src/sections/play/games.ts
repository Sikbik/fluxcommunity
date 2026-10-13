/**
 * The names on the wall. Text only: no third-party logos, no artwork. The list is from the
 * brief (DESIGN 5.6); "and more" is the editorial close and is set apart in the accent voice.
 */
export interface WallItem {
  id: string;
  label: string;
  /** The editorial close ("and more"): set in the accent voice, not a game. */
  more?: boolean;
}

const names = [
  'Minecraft',
  'Valheim',
  'Rust',
  'Palworld',
  'Project Zomboid',
  'FiveM',
  'ARK: Survival Ascended',
  'Terraria',
  'Factorio',
  "Don't Starve Together",
] as const;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const GAMES: readonly WallItem[] = names.map((label) => ({ id: slug(label), label }));

export const AND_MORE: WallItem = { id: 'and-more', label: 'and more', more: true };

/**
 * Splits the list across two rows of similar visual length. Rows are filled in order until
 * the first has about half of the total characters, so the two rows scroll as a matched pair
 * and neither is a long row against a stub. "and more" always closes the second row.
 */
export function splitRows(
  items: readonly WallItem[],
  closing: WallItem = AND_MORE,
): [WallItem[], WallItem[]] {
  const total = items.reduce((n, it) => n + it.label.length, 0) + closing.label.length;
  const first: WallItem[] = [];
  let used = 0;
  for (const it of items) {
    if (used + it.label.length / 2 > total / 2 && first.length > 0) break;
    first.push(it);
    used += it.label.length;
  }
  return [first, [...items.slice(first.length), closing]];
}
