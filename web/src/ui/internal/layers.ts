/**
 * Portal layers. Modal UI, toasts and tooltips render into their own containers
 * OUTSIDE `#root`, so `inert` on the page never takes them with it and z order is
 * decided in one place (tokens.css, section 11).
 *
 * Bottom to top: `overlay` (the host for feature overlays and the ambient HUD), `modal` (Dialog,
 * Drawer), `palette` (the command deck: above any open modal, so it can be summoned from one),
 * `toast`, `tooltip`.
 */
export type LayerName = 'overlay' | 'modal' | 'palette' | 'toast' | 'tooltip';

const Z: Record<LayerName, string> = {
  overlay: 'var(--z-overlay)',
  modal: 'var(--z-modal)',
  palette: 'var(--z-palette)',
  toast: 'var(--z-toast)',
  tooltip: 'var(--z-tooltip)',
};

let host: HTMLElement | null = null;

function ensureHost(): HTMLElement {
  if (host?.isConnected) return host;
  let el = document.getElementById('overlay-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'overlay-root';
    document.body.appendChild(el);
  }
  host = el;
  return el;
}

/** The container for a layer, created on first use. */
export function getLayer(name: LayerName): HTMLElement {
  const root = ensureHost();
  let layer = root.querySelector<HTMLElement>(`:scope > [data-layer="${name}"]`);
  if (!layer) {
    layer = document.createElement('div');
    layer.dataset.layer = name;
    layer.style.position = 'relative';
    layer.style.zIndex = Z[name];
    root.appendChild(layer);
  }
  return layer;
}
