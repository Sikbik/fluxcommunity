// The `?stage=debug` overlay: a small monospace panel in the corner. DOM only, updated four times a
// second, removed with the engine. It never takes pointer events.

import { useStageBus } from './bus';
import type { EngineStats } from './engine/engine';

export interface DebugSource {
  stats: EngineStats;
}

export function attachDebugOverlay(parent: HTMLElement, src: DebugSource): () => void {
  const el = document.createElement('pre');
  el.setAttribute('data-stage-debug', '');
  el.style.cssText = [
    'position:absolute',
    'left:8px',
    'bottom:8px',
    'margin:0',
    'padding:8px 10px',
    'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
    'color:#bcd4ff',
    'background:rgba(0,8,24,.72)',
    'border:1px solid rgba(79,134,255,.45)',
    'white-space:pre',
    'pointer-events:none',
    'z-index:5',
    'letter-spacing:.02em',
  ].join(';');
  parent.appendChild(el);
  const update = () => {
    const s = src.stats;
    const bus = useStageBus.getState();
    const focus = bus.focus.map((f) => `${f.id}:${f.strength.toFixed(2)}`).join(' ') || '-';
    el.textContent = [
      `stage  fps ${s.fps.toFixed(1)}  frame ${s.frameMs.toFixed(1)} ms  gpu ${s.gpuMs === null ? 'n/a' : `${s.gpuMs.toFixed(2)} ms`}`,
      `tier   ${s.tier}  dpr ${s.dpr.toFixed(2)}  ${s.width}x${s.height}`,
      `scene  cells ${s.cells}  dust ${s.dust}  calls ${s.drawCalls}  tris ${s.triangles}`,
      `pulses ${s.pulses}  focus ${s.focus} [${focus}]`,
      `page   section ${bus.section} ${bus.sectionProgress.toFixed(2)}  scroll ${bus.pageProgress.toFixed(2)}`,
      `state  accent ${bus.accent}  ambient ${bus.ambient}  intro ${bus.intro}  reduced ${bus.reducedMotion}`,
      `gpu    ${s.gpu}`,
    ].join('\n');
  };
  update();
  const timer = window.setInterval(update, 250);
  return () => {
    window.clearInterval(timer);
    el.remove();
  };
}
