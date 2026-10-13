// DOM input for the stage: window pointer tracking, the symbol anchor(s), and optional gyro parallax.
// Framework free and three free. The engine reads this object each frame and gets callbacks for the
// symbol gestures (hover, drag, click). Nothing here prompts the visitor for anything.
//
// The anchor is whichever `[data-stage-anchor="symbol"]` element is most visible. Gestures are hit
// tested against its rectangle rather than relying on the element's own pointer events, so the hero is
// free to lay out its layers however it likes; pointer events that land on a real control (a link, a
// button, a field) are never taken.

import { pickAnchor, pointInRect, type RectLike } from './interaction';
import { clamp, damp } from './math';

export interface InputHandlers {
  onSymbolHover(hover: boolean): void;
  onSymbolDown(x: number, y: number): void;
  onSymbolDrag(dx: number, dy: number, dt: number): void;
  onSymbolUp(wasClick: boolean, x: number, y: number): void;
}

export interface AnchorRect extends RectLike {
  el: HTMLElement;
  /** Area of the rect inside the viewport, 0 when off screen. */
  visible: number;
}

const INTERACTIVE =
  'a[href], button, input, select, textarea, summary, label, [role="button"], [role="link"], [role="tab"], [contenteditable=""], [contenteditable="true"], [data-stage-ignore]';

export class StageInput {
  /** Pointer position in client pixels and normalised device coordinates (y up). */
  x = 0;
  y = 0;
  nx = 0;
  ny = 0;
  /** The pointer is inside the window (a finger counts only while it is down). */
  present = false;
  down = false;
  coarse = false;
  lastMoveAt = 0;
  /** Gyro tilt, -1..1, already smoothed. 0 when there is no sensor data. */
  tiltX = 0;
  tiltY = 0;
  /** The anchor the symbol follows, or null. Refreshed by `measure`. */
  current: AnchorRect | null = null;
  hover = false;
  dragging = false;

  private anchors: HTMLElement[] = [];
  private rects: AnchorRect[] = [];
  private lastQuery = 0;
  private dirty = true;
  private mo: MutationObserver | null = null;
  private lastX = 0;
  private lastY = 0;
  private lastT = 0;
  private downAt = 0;
  private moved = 0;
  private rawTiltX = 0;
  private rawTiltY = 0;
  private hasGyro = false;
  private styled = new Map<HTMLElement, string>();
  private attached = false;

  constructor(
    private readonly h: InputHandlers,
    private readonly win: Window = window,
    private readonly doc: Document = document,
  ) {}

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    const w = this.win;
    w.addEventListener('pointermove', this.onMove, { passive: true });
    w.addEventListener('pointerdown', this.onDown, { passive: true, capture: true });
    w.addEventListener('pointerup', this.onUp, { passive: true, capture: true });
    w.addEventListener('pointercancel', this.onCancel, { passive: true, capture: true });
    w.addEventListener('blur', this.onLeave);
    this.doc.documentElement.addEventListener('mouseleave', this.onLeave);
    w.addEventListener('scroll', this.markDirty, { passive: true });
    w.addEventListener('resize', this.markDirty, { passive: true });
    if (this.win.matchMedia?.('(pointer: coarse)').matches) {
      w.addEventListener('deviceorientation', this.onOrientation, { passive: true });
    }
    if (typeof MutationObserver !== 'undefined') {
      this.mo = new MutationObserver(this.markDirty);
      this.mo.observe(this.doc.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-stage-anchor'],
      });
    }
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    const w = this.win;
    w.removeEventListener('pointermove', this.onMove);
    w.removeEventListener('pointerdown', this.onDown, { capture: true });
    w.removeEventListener('pointerup', this.onUp, { capture: true });
    w.removeEventListener('pointercancel', this.onCancel, { capture: true });
    w.removeEventListener('blur', this.onLeave);
    this.doc.documentElement.removeEventListener('mouseleave', this.onLeave);
    w.removeEventListener('scroll', this.markDirty);
    w.removeEventListener('resize', this.markDirty);
    w.removeEventListener('deviceorientation', this.onOrientation);
    this.mo?.disconnect();
    this.mo = null;
    for (const [el, cursor] of this.styled) el.style.cursor = cursor;
    this.styled.clear();
  }

  /** Re-reads the anchor rectangles. Cheap: one `getBoundingClientRect` per anchor. */
  measure(vw: number, vh: number, now: number): void {
    if (this.dirty || now - this.lastQuery > 1500) {
      this.anchors = Array.from(this.doc.querySelectorAll<HTMLElement>('[data-stage-anchor="symbol"]'));
      this.lastQuery = now;
      this.dirty = false;
      for (const el of this.anchors) this.prepare(el);
    }
    this.rects.length = 0;
    for (const el of this.anchors) {
      const r = el.getBoundingClientRect();
      const w = Math.min(r.right, vw) - Math.max(r.left, 0);
      const hgt = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      this.rects.push({
        el,
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        visible: w > 0 && hgt > 0 ? w * hgt : 0,
      });
    }
    const i = pickAnchor(this.rects, vw, vh);
    this.current = i >= 0 ? (this.rects[i] ?? null) : null;
    if (!this.current && this.hover) this.setHover(false);
  }

  /** Smooths the gyro and eases it back to zero when no data arrives. */
  step(dt: number): void {
    const k = this.hasGyro ? 8 : 3;
    this.tiltX = damp(this.tiltX, this.rawTiltX, k, dt);
    this.tiltY = damp(this.tiltY, this.rawTiltY, k, dt);
  }

  private markDirty = (): void => {
    this.dirty = true;
  };

  /** Sets the affordances the anchor needs to be draggable on touch without breaking page scroll. */
  private prepare(el: HTMLElement): void {
    if (this.styled.has(el)) return;
    this.styled.set(el, el.style.cursor);
    if (!el.style.cursor) el.style.cursor = 'grab';
    if (!el.style.touchAction) el.style.touchAction = 'pan-y';
  }

  private setHover(v: boolean): void {
    if (v === this.hover) return;
    this.hover = v;
    this.h.onSymbolHover(v);
  }

  private isSymbolTarget(e: PointerEvent): boolean {
    const cur = this.current;
    if (!cur || cur.visible <= 0) return false;
    if (!pointInRect(e.clientX, e.clientY, cur)) return false;
    const t = e.target;
    if (!(t instanceof Element)) return true;
    if (t === cur.el || cur.el.contains(t)) return true;
    return !t.closest(INTERACTIVE);
  }

  private setPointer(e: PointerEvent): void {
    this.coarse = e.pointerType === 'touch';
    this.x = e.clientX;
    this.y = e.clientY;
    const vw = this.win.innerWidth || 1;
    const vh = this.win.innerHeight || 1;
    this.nx = clamp((e.clientX / vw) * 2 - 1, -1, 1);
    this.ny = clamp(1 - (e.clientY / vh) * 2, -1, 1);
    this.lastMoveAt = e.timeStamp || performance.now();
  }

  private onMove = (e: PointerEvent): void => {
    this.setPointer(e);
    this.present = e.pointerType !== 'touch' || this.down;
    const cur = this.current;
    const inside = !!cur && cur.visible > 0 && pointInRect(e.clientX, e.clientY, cur);
    this.setHover(inside && !this.coarse);
    if (this.dragging) {
      const t = e.timeStamp || performance.now();
      const dt = Math.max(0.001, (t - this.lastT) / 1000);
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.lastT = t;
      this.h.onSymbolDrag(dx, dy, dt);
    }
  };

  private onDown = (e: PointerEvent): void => {
    this.setPointer(e);
    this.down = true;
    this.present = true;
    if (this.isSymbolTarget(e)) {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.lastT = e.timeStamp || performance.now();
      this.downAt = this.lastT;
      this.moved = 0;
      const el = this.current?.el;
      if (el && !this.coarse) el.style.cursor = 'grabbing';
      this.h.onSymbolDown(e.clientX, e.clientY);
    }
  };

  private finish(e: PointerEvent, cancelled: boolean): void {
    this.down = false;
    if (e.pointerType === 'touch') this.present = false;
    if (!this.dragging) return;
    this.dragging = false;
    const el = this.current?.el;
    if (el && this.styled.has(el)) el.style.cursor = this.styled.get(el) || 'grab';
    const dur = (e.timeStamp || performance.now()) - this.downAt;
    const wasClick = !cancelled && this.moved < 7 && dur < 500;
    this.h.onSymbolUp(wasClick, e.clientX, e.clientY);
  }

  private onUp = (e: PointerEvent): void => this.finish(e, false);
  private onCancel = (e: PointerEvent): void => this.finish(e, true);

  private onLeave = (): void => {
    this.present = false;
    this.setHover(false);
    if (this.dragging) {
      this.dragging = false;
      this.h.onSymbolUp(false, this.x, this.y);
    }
  };

  private onOrientation = (e: DeviceOrientationEvent): void => {
    if (e.gamma === null || e.beta === null) return;
    this.hasGyro = true;
    this.rawTiltX = clamp(e.gamma / 28, -1, 1);
    this.rawTiltY = clamp((e.beta - 50) / 28, -1, 1);
  };
}
