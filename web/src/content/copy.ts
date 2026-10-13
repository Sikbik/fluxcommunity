/**
 * The copy deck (DESIGN 12) as constants, so the same words are used everywhere.
 * Plain, concrete, sentence case. No em dashes, no emoji.
 */
export const COPY = {
  loading: 'Syncing with the chain',
  offline: 'Showing the last known numbers',
  unchecked: 'Not checked yet',
  emptySearch: 'No match. Try a category, or add your own.',
  externalHint: 'Opens in a new tab',
  youAreHere: 'You are here',
  builtBy: (handle: string) => `Built by ${handle}`,
  retiring: (date: string, successor: string) => `Retiring ${date}. ${successor} takes over.`,
  successor: (predecessor: string, date: string) => `New. Takes over from ${predecessor} on ${date}.`,
  blockPaid: 'One node of each tier is paid in every block.',
  communityServices: 'Community services. Fees and returns vary by provider. Do your own research.',
  /** The submission message template (compose with the visitor's values). */
  submission: (v: { name: string; url: string; what: string; handle: string }) =>
    `Hi @bigstache, please add my Flux app to the community portal.\nName: ${v.name}\nURL: ${v.url}\nWhat it does: ${v.what}\nBuilt by: ${v.handle}`,
} as const;
