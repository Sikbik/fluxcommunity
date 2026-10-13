/**
 * Captured pages whose own background is light. Shown as they are they would blow out a dark
 * screen, so the deck's preview card and the ambient caption art dim them. It is a fact about
 * the screenshots (the manifest has no such flag), kept in one place for both overlays; the
 * hosting section keeps the same list for its bays.
 */
export const LIGHT_PREVIEWS: ReadonlySet<string> = new Set(['goldietech']);

export function isLightPreview(id: string): boolean {
  return LIGHT_PREVIEWS.has(id);
}
