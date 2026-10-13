/**
 * One global pointer tracker and one animation loop for every effect that needs the
 * pointer beyond its own element (magnetic buttons, the cursor ring).
 *
 * Effects register a tick. The loop runs only while the pointer has moved recently or a
 * tick says it is still settling, so an idle page costs nothing.
 */

export interface PointerState {
  x: number;
  y: number;
  /** A fine pointer has been seen inside the window. */
  inside: boolean;
  /** Primary button is down. */
  down: boolean;
}

/** Return true to be called again next frame. `dt` is seconds, clamped. */
export type PointerTick = (dt: number, pointer: PointerState) => boolean;

export const pointer: PointerState = { x: -9999, y: -9999, inside: false, down: false };

const ticks = new Set<PointerTick>();
let raf = 0;
let last = 0;
let listening = false;

function frame(now: number): void {
  raf = 0;
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  let again = false;
  for (const tick of [...ticks]) {
    if (tick(dt, pointer)) again = true;
  }
  if (again) raf = requestAnimationFrame(frame);
}

export function wake(): void {
  if (raf || ticks.size === 0) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

function onMove(e: PointerEvent): void {
  if (e.pointerType === 'touch') return;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.inside = true;
  wake();
}

function onDown(e: PointerEvent): void {
  if (e.pointerType === 'touch') return;
  pointer.down = true;
  wake();
}

function onUp(): void {
  pointer.down = false;
  wake();
}

function onLeave(): void {
  pointer.inside = false;
  wake();
}

function onScrollOrResize(): void {
  wake();
}

function listen(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onUp, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  window.addEventListener('scroll', onScrollOrResize, { passive: true });
  window.addEventListener('resize', onScrollOrResize);
}

function unlisten(): void {
  if (!listening) return;
  listening = false;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerdown', onDown);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onUp);
  document.documentElement.removeEventListener('pointerleave', onLeave);
  window.removeEventListener('scroll', onScrollOrResize);
  window.removeEventListener('resize', onScrollOrResize);
}

/** Registers a per-frame tick. Returns the unregister function. */
export function registerPointerTick(tick: PointerTick): () => void {
  ticks.add(tick);
  listen();
  wake();
  return () => {
    ticks.delete(tick);
    if (ticks.size === 0) {
      unlisten();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}
