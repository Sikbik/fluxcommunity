/**
 * Which element opened the detail, so focus can go back to it when the detail closes. The drawer's
 * focus trap already restores focus to what was focused when it opened; this covers the cases it
 * cannot: Safari (a clicked link does not take focus), a deep link (nothing was focused), and a
 * cell that has since been filtered out.
 */
let opener: HTMLElement | null = null;

export function rememberOpener(el: HTMLElement | null): void {
  opener = el;
}

/** The first cell link in the grid, for a fallback focus target. */
export function firstCell(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-builds-grid] [data-roving]');
}

/** Moves focus back where it came from, unless it is already somewhere sensible. */
export function restoreOpener(): void {
  const active = document.activeElement;
  // Focus is "lost" when it sits on the page itself or on a container that is only focusable by script
  // (the shell parks it on <main> after a navigation): a control is a better place for it.
  const lost =
    !active ||
    active === document.body ||
    active === document.documentElement ||
    (active instanceof HTMLElement &&
      active.tabIndex < 0 &&
      !active.isContentEditable &&
      !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(active.tagName));
  const el = opener;
  opener = null;
  if (!lost) return;
  const target = el?.isConnected ? el : firstCell();
  target?.focus({ preventScroll: true });
}

/**
 * Pairs "a detail opened" with "its exit finished". The drawer also reports an exit once at mount,
 * when it was never open; that one must not move focus (it used to park focus on the first cell the
 * moment the page loaded, so the first Tab skipped everything above the grid). `take()` is true once
 * per open.
 */
export function createExitGate(): { opened: () => void; take: () => boolean } {
  let pending = false;
  return {
    opened: () => {
      pending = true;
    },
    take: () => {
      if (!pending) return false;
      pending = false;
      return true;
    },
  };
}
