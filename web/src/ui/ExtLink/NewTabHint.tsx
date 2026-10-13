import { NEW_TAB_HINT } from '../internal/links';

export interface NewTabHintProps {
  /**
   * An id, for a link whose accessible name is built from several elements:
   * `aria-labelledby="<name id> <hint id>"`. Without one the text is simply part of the link's
   * content.
   */
  id?: string;
}

/**
 * The visually hidden "(Opens in a new tab)" that goes inside a link which opens one, so assistive
 * tech says so. `ExtLink` and `LinkButton` render it themselves; use it next to `outboundLink`
 * when the link is a `Panel as="a"` or any other custom anchor.
 *
 * Do not use `aria-label` for this: it replaces the visible text instead of adding to it.
 */
export function NewTabHint({ id }: NewTabHintProps) {
  return (
    <span className="sr-only" id={id}>
      {` ${NEW_TAB_HINT}`}
    </span>
  );
}
