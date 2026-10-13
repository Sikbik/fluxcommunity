/** Focus helpers shared by the modal primitives. */

const TABBABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function visible(el: HTMLElement): boolean {
  if (el.hasAttribute('hidden') || el.closest('[inert]')) return false;
  const style = getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  return el.getClientRects().length > 0;
}

/** Tabbable descendants of a container, in DOM order. */
export function tabbables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE)).filter(visible);
}

/** Focuses the preferred initial element: [data-autofocus], else the first tabbable, else the container. */
export function focusInitial(container: HTMLElement): void {
  const preferred = container.querySelector<HTMLElement>('[data-autofocus]');
  const target = preferred ?? tabbables(container)[0] ?? container;
  target.focus({ preventScroll: true });
}

/** Keeps Tab inside the container. Call from a keydown handler. */
export function trapTab(container: HTMLElement, e: KeyboardEvent): void {
  if (e.key !== 'Tab') return;
  const items = tabbables(container);
  if (items.length === 0) {
    e.preventDefault();
    container.focus({ preventScroll: true });
    return;
  }
  const first = items[0] as HTMLElement;
  const last = items[items.length - 1] as HTMLElement;
  const active = document.activeElement as HTMLElement | null;
  if (e.shiftKey && (active === first || !container.contains(active))) {
    e.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!e.shiftKey && (active === last || !container.contains(active))) {
    e.preventDefault();
    first.focus({ preventScroll: true });
  }
}
