import { type RefObject, useLayoutEffect, useRef } from 'react';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Memo {
  rects: Map<string, Rect>;
  nodes: Map<string, HTMLElement>;
  width: number;
  running: Map<string, Animation>;
}

export interface FlipOptions {
  /** False under reduced motion: positions are tracked, nothing animates. */
  enabled: boolean;
  /** An overlay (position: absolute over the list) that holds the fading leavers. */
  ghosts?: RefObject<HTMLElement | null>;
  duration?: number;
}

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

function translateOf(el: HTMLElement): { x: number; y: number } {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return { x: 0, y: 0 };
  const m = new DOMMatrixReadOnly(t);
  return { x: m.m41, y: m.m42 };
}

/**
 * FLIP reordering for a keyed grid. Direct children carry `data-flip="<key>"`. Whenever `signature`
 * (the ordered keys, joined) changes, every child that stayed slides from where it was to where it
 * is now; a child that left fades out where it stood (as a ghost); a child that arrived is left to
 * its own entrance (Reveal).
 *
 * Interruptible: a new change mid-slide starts from where each child visually is, not from where it
 * was going. Cheap: transforms only, no animation when the container changed width (a resize or a
 * column-count change is a relayout, not a reorder).
 */
export function useFlip(
  list: RefObject<HTMLElement | null>,
  signature: string,
  { enabled, ghosts, duration = 460 }: FlipOptions,
): void {
  const memo = useRef<Memo>({ rects: new Map(), nodes: new Map(), width: 0, running: new Map() });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `signature` is the change signal
  useLayoutEffect(() => {
    const root = list.current;
    if (!root) return;
    const m = memo.current;
    const origin = root.getBoundingClientRect();

    // Where each child visually was, including any slide still in flight.
    const first = new Map<string, Rect>();
    for (const [key, rect] of m.rects) {
      const node = m.nodes.get(key);
      const t = node?.isConnected ? translateOf(node) : { x: 0, y: 0 };
      first.set(key, { ...rect, x: rect.x + t.x, y: rect.y + t.y });
    }

    // Measure layout positions: stop running slides first so their transform is not in the numbers.
    for (const a of m.running.values()) a.cancel();
    m.running.clear();

    const els = Array.from(root.querySelectorAll<HTMLElement>(':scope > [data-flip]'));
    const last = new Map<string, Rect>();
    const nodes = new Map<string, HTMLElement>();
    for (const el of els) {
      const key = el.dataset.flip;
      if (!key) continue;
      const r = el.getBoundingClientRect();
      last.set(key, { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
      nodes.set(key, el);
    }

    const stable = Math.abs(origin.width - m.width) < 1;
    if (enabled && stable && first.size > 0) {
      for (const [key, to] of last) {
        const from = first.get(key);
        const el = nodes.get(key);
        if (!from || !el) continue;
        const dx = from.x - to.x;
        const dy = from.y - to.y;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        const anim = el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
          { duration, easing: EASE },
        );
        m.running.set(key, anim);
        const done = () => {
          if (m.running.get(key) === anim) m.running.delete(key);
        };
        anim.addEventListener('finish', done);
        anim.addEventListener('cancel', done);
      }

      // Leavers: React has already detached their nodes; fade them out where they stood.
      const layer = ghosts?.current;
      if (layer) {
        for (const [key, from] of first) {
          if (last.has(key)) continue;
          const node = m.nodes.get(key);
          if (!node || node.isConnected) continue;
          delete node.dataset.flip;
          node.setAttribute('inert', '');
          node.setAttribute('aria-hidden', 'true');
          Object.assign(node.style, {
            position: 'absolute',
            insetInlineStart: `${from.x}px`,
            insetBlockStart: `${from.y}px`,
            inlineSize: `${from.w}px`,
            blockSize: `${from.h}px`,
            margin: '0',
            pointerEvents: 'none',
            opacity: '1',
            filter: 'none',
            translate: 'none',
          });
          layer.appendChild(node);
          const out = node.animate(
            [
              { opacity: 1, transform: 'scale(1)' },
              { opacity: 0, transform: 'scale(0.94)' },
            ],
            { duration: 220, easing: 'ease-out', fill: 'forwards' },
          );
          out.addEventListener('finish', () => node.remove());
          out.addEventListener('cancel', () => node.remove());
        }
      }
    }

    m.rects = last;
    m.nodes = nodes;
    m.width = origin.width;
  }, [signature, enabled, duration]);

  // Leave nothing running behind on unmount.
  useLayoutEffect(() => {
    const m = memo.current;
    return () => {
      for (const a of m.running.values()) a.cancel();
      m.running.clear();
    };
  }, []);
}
