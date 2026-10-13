// Developer harness for the stage. Mounts the real Stage over a fake page and gives a control panel that
// drives the bus: section, accent, intro, ambient, reduced motion, pause, pulses, focus regions and the
// quality tier. Query parameters preset the same things so a screenshot script can reach any state:
//
//   ?section=hero|pulse|...   ?accent=flux|cumulus|nimbus|stratus   ?ambient=1   ?intro=pending|off
//   ?reduced=1   ?paused=1   ?panel=0   ?anchor=0   ?scroll=0..1   ?chain=1   ?beat=<seconds>
//   ?q=low|medium|high|none   ?stage=debug   ?dpr=<n>   ?outline=1   ?clean=1 (hide the page copy)
//   ?introT=<seconds> freezes the intro at that time (with ?stage=debug)
//
// `window.__bus` is the bus store, for scripted tests. Not part of the production build.

import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { type Accent, type PulseKind, SECTION_ORDER, type SectionId, useStageBus } from '../bus';
import Stage from '../index';
import './lab.css';

const params = new URLSearchParams(location.search);
const ACCENTS: Accent[] = ['flux', 'cumulus', 'nimbus', 'stratus'];

declare global {
  interface Window {
    __bus: typeof useStageBus;
  }
}
window.__bus = useStageBus;

const SECTION_COPY: Record<SectionId, { title: string; body: string }> = {
  hero: { title: 'Built by the community, ran by the network', body: 'Hero: bright, close and low.' },
  pulse: { title: 'The network, right now.', body: 'Pulse: a touch calmer, live tiles on top.' },
  gateways: {
    title: 'Start anywhere.',
    body: 'Gateways: a bento of doors, the lattice lights under a hovered card.',
  },
  builds: {
    title: 'What the community built.',
    body: 'Builds: dense. The stage dims and stills so text keeps contrast.',
  },
  hosting: { title: 'Run a node without the rack.', body: 'Hosting: calm and dim behind provider cards.' },
  play: { title: 'Game servers on the decentralized cloud.', body: 'Play: a little more energy.' },
  learn: { title: 'How an app runs on Flux.', body: 'Learn: the quietest look, behind the explainer.' },
  community: { title: 'Join in.', body: 'Community: channels, credits and the footer.' },
};

function applyParams() {
  const bus = useStageBus.getState();
  const section = params.get('section') as SectionId | null;
  if (section && SECTION_ORDER.includes(section)) bus.setSection(section, 0.3);
  const accent = params.get('accent') as Accent | null;
  if (accent && ACCENTS.includes(accent)) {
    bus.setAccent(accent);
    document.documentElement.dataset.accent = accent;
  }
  if (params.get('ambient') === '1') bus.setAmbient(true);
  if (params.get('reduced') === '1') bus.setReducedMotion(true);
  if (params.get('paused') === '1') bus.setPaused(true);
  const intro = params.get('intro');
  if (intro === 'pending' || intro === 'skip' || intro === 'off') bus.setIntro(intro);
  const scroll = Number(params.get('scroll'));
  if (params.has('scroll') && Number.isFinite(scroll)) bus.setScroll(scroll, 0);
  if (params.get('chain') === '1') {
    bus.setChain({ height: 3_031_112, lastBlockAt: Date.now() - 9_000, intervalMs: 30_000, live: true });
  }
}
applyParams();

// ?introT=<seconds> freezes the intro at that time (needs ?stage=debug, which exposes the engine).
if (params.has('introT')) {
  const t = Number(params.get('introT'));
  const timer = window.setInterval(() => {
    const eng = (window as unknown as { __stageEngine?: { setDebugIntroTime(t: number | null): void } })
      .__stageEngine;
    if (eng) {
      eng.setDebugIntroTime(t);
      window.clearInterval(timer);
    }
  }, 50);
}

function useBus<T>(sel: (s: ReturnType<typeof useStageBus.getState>) => T): T {
  return useStageBus(sel);
}

function Panel() {
  const section = useBus((s) => s.section);
  const accent = useBus((s) => s.accent);
  const ambient = useBus((s) => s.ambient);
  const reduced = useBus((s) => s.reducedMotion);
  const paused = useBus((s) => s.paused);
  const intro = useBus((s) => s.intro);
  const stage = useBus((s) => s.stage);
  const chainLive = useBus((s) => s.chain.live);
  const pageProgress = useBus((s) => s.pageProgress);
  const focus = useBus((s) => s.focus);
  const [collapsed, setCollapsed] = useState(false);
  const [beatEvery, setBeatEvery] = useState(Number(params.get('beat')) || 0);
  const bus = useStageBus.getState();

  useEffect(() => {
    if (!beatEvery) return;
    const id = window.setInterval(
      () => useStageBus.getState().firePulse('block', null, null, 1),
      beatEvery * 1000,
    );
    return () => window.clearInterval(id);
  }, [beatEvery]);

  const fire = (k: PulseKind) => {
    if (k === 'click') bus.firePulse('click', window.innerWidth * 0.4, window.innerHeight * 0.78, 1);
    else bus.firePulse(k, null, null, 1);
  };
  const setQ = (q: string) => {
    const u = new URL(location.href);
    if (q) u.searchParams.set('q', q);
    else u.searchParams.delete('q');
    location.href = u.toString();
  };
  const addFocus = () => {
    const w = Math.min(420, window.innerWidth * 0.5);
    bus.setFocus({
      id: 'lab',
      x: window.innerWidth * 0.5 - w / 2,
      y: window.innerHeight * 0.55,
      w,
      h: 240,
      strength: 1,
    });
  };

  return (
    <aside className="lab-panel" data-collapsed={collapsed} aria-label="Stage lab controls">
      <header>
        <span>stage lab</span>
        <button type="button" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? 'open' : 'hide'}
        </button>
      </header>
      <fieldset>
        <legend>section</legend>
        <div className="lab-row">
          {SECTION_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={section === id}
              onClick={() => bus.setSection(id, 0.3)}
            >
              {id}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>accent</legend>
        <div className="lab-row">
          {ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={accent === a}
              onClick={() => {
                bus.setAccent(a);
                document.documentElement.dataset.accent = a;
              }}
            >
              {a}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>state</legend>
        <div className="lab-row">
          <button type="button" aria-pressed={ambient} onClick={() => bus.setAmbient(!ambient)}>
            ambient
          </button>
          <button type="button" aria-pressed={reduced} onClick={() => bus.setReducedMotion(!reduced)}>
            reduced
          </button>
          <button type="button" aria-pressed={paused} onClick={() => bus.setPaused(!paused)}>
            paused
          </button>
          <button
            type="button"
            aria-pressed={chainLive}
            onClick={() =>
              bus.setChain(
                chainLive
                  ? { live: false }
                  : { height: 3_031_112, lastBlockAt: Date.now() - 4_000, intervalMs: 30_000, live: true },
              )
            }
          >
            chain
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend>intro ({intro})</legend>
        <div className="lab-row">
          <button type="button" onClick={() => bus.setIntro('pending')}>
            replay
          </button>
          <button type="button" onClick={() => bus.setIntro('skip')}>
            skip
          </button>
          <button type="button" onClick={() => bus.setIntro('off')}>
            off
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend>pulse</legend>
        <div className="lab-row">
          {(['block', 'click', 'success', 'warn'] as PulseKind[]).map((k) => (
            <button key={k} type="button" onClick={() => fire(k)}>
              {k}
            </button>
          ))}
          <button type="button" aria-pressed={beatEvery > 0} onClick={() => setBeatEvery(beatEvery ? 0 : 6)}>
            block/6s
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend>focus ({focus.length})</legend>
        <div className="lab-row">
          <button type="button" onClick={addFocus}>
            add region
          </button>
          <button type="button" onClick={() => bus.clearFocus('lab')}>
            clear
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend>quality (reloads)</legend>
        <div className="lab-row">
          <button type="button" onClick={() => setQ('')}>
            auto
          </button>
          <button type="button" onClick={() => setQ('high')}>
            3
          </button>
          <button type="button" onClick={() => setQ('medium')}>
            2
          </button>
          <button type="button" onClick={() => setQ('low')}>
            1
          </button>
          <button type="button" onClick={() => setQ('none')}>
            0
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend>scroll {pageProgress.toFixed(2)}</legend>
        <input
          type="range"
          min={0}
          max={1}
          step={0.005}
          value={pageProgress}
          onChange={(e) => {
            const y = Number(e.target.value) * (document.documentElement.scrollHeight - window.innerHeight);
            window.scrollTo(0, y);
          }}
        />
      </fieldset>
      <div className="lab-readout">
        {`ready ${stage.ready}  tier ${stage.quality}\nfps ${stage.fps}  reason ${stage.reason}`}
      </div>
    </aside>
  );
}

function SectionBlock({ id, anchor }: { id: SectionId; anchor: boolean }) {
  const copy = SECTION_COPY[id];
  const focusId = (n: number) => `${id}-${n}`;
  const bus = useStageBus.getState();
  const cards = id === 'hero' ? 0 : 6;
  return (
    <section id={id} data-section={id} className={`lab-section${id === 'hero' ? ' lab-hero' : ''}`}>
      <div className="lab-copy">
        <div className="lab-eyebrow">{`0${SECTION_ORDER.indexOf(id)} / ${id.toUpperCase()}`}</div>
        {id === 'hero' ? (
          <h1>
            Built by the <b>community</b> Ran by the <b>network</b>
          </h1>
        ) : (
          <h2>{copy.title}</h2>
        )}
        <p>
          {copy.body} Lorem ipsum body copy sits here so contrast against the stage can be judged: the quick
          brown fox jumps over the lazy dog, and the lattice below should never fight it.
        </p>
        {id === 'hero' ? (
          <div className="lab-cta">
            <a href="#builds">Explore community builds</a>
            <button type="button">Open the command deck</button>
          </div>
        ) : null}
      </div>
      {id === 'hero' && anchor ? <div className="lab-anchor" data-stage-anchor="symbol" /> : null}
      {cards > 0 ? (
        <div className="lab-cards">
          {Array.from({ length: cards }, (_, i) => (
            <div
              key={focusId(i)}
              className="lab-card"
              onPointerEnter={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                bus.setFocus({ id: focusId(i), x: r.left, y: r.top, w: r.width, h: r.height, strength: 1 });
              }}
              onPointerLeave={() => bus.clearFocus(focusId(i))}
            >
              <h3>{`Card ${i + 1}`}</h3>
              <p>Hover me: the lattice beneath rises and glows.</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Page() {
  const anchor = params.get('anchor') !== '0';
  const ticking = useRef(false);

  useEffect(() => {
    document.body.dataset.anchorOutline = params.get('outline') === '1' ? '1' : '0';
    let lastY = window.scrollY;
    let lastT = performance.now();
    let vel = 0;
    const update = () => {
      ticking.current = false;
      const bus = useStageBus.getState();
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = window.scrollY / max;
      const now = performance.now();
      const dt = Math.max(1, now - lastT) / 1000;
      vel += ((window.scrollY - lastY) / dt - vel) * 0.3;
      lastY = window.scrollY;
      lastT = now;
      if (!params.has('scroll') || window.scrollY > 0) bus.setScroll(progress, vel);
      const mid = window.innerHeight * 0.5;
      for (const id of SECTION_ORDER) {
        const el = document.getElementById(id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top <= mid && r.bottom > mid) {
          if (window.scrollY > 0 || !params.has('section')) {
            bus.setSection(id, Math.min(1, Math.max(0, (mid - r.top) / r.height)));
          }
          break;
        }
      }
    };
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <Stage />
      <main className={`lab-page${params.get('clean') === '1' ? ' lab-clean' : ''}`}>
        {SECTION_ORDER.map((id) => (
          <SectionBlock key={id} id={id} anchor={anchor} />
        ))}
      </main>
      {params.get('panel') === '0' ? null : <Panel />}
    </>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
