import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import styles from './Ambient.module.css';
import { buildPlaylist, type Caption } from './captions';
import { CAPTION_MS, CROSSFADE_MS, captionAt, nextStart } from './schedule';

/** Where the last tour stopped, so the next one carries on instead of opening on the same build. */
let lastShown: number | null = null;

/** The name with its last word in the heavy weight: the site's mixed-weight signature. */
function Name({ name }: { name: string }) {
  const words = name.split(' ');
  if (words.length < 2)
    return (
      <p className={styles.name} data-single="true">
        {name}
      </p>
    );
  const last = words.pop() as string;
  return (
    <p className={styles.name} style={{ '--i': 1 } as CSSProperties}>
      {words.join(' ')} <b>{last}</b>
    </p>
  );
}

function Art({ art }: { art: NonNullable<Caption['art']> }) {
  return (
    <div className={styles.art} data-blend={art.blend} data-light={art.light ? 'true' : undefined}>
      <picture>
        {art.avif ? <source srcSet={art.avif} type="image/avif" /> : null}
        <img src={art.src} width={art.width} height={art.height} alt="" decoding="async" />
      </picture>
    </div>
  );
}

function CaptionView({ caption, phase }: { caption: Caption; phase: 'enter' | 'leave' }) {
  const idx = (n: number) => ({ '--i': n }) as CSSProperties;
  return (
    <div className={styles.layer} data-role={phase} aria-hidden={phase === 'leave' ? true : undefined}>
      <div className={styles.cap} style={{ '--cap-ms': `${CAPTION_MS}ms` } as CSSProperties}>
        {caption.art ? <Art art={caption.art} /> : null}
        <p className={styles.eyebrow} style={idx(0)}>
          <span>{caption.groupLabel}</span>
          <span className={styles.of}>
            {String(caption.position).padStart(2, '0')} / {String(caption.total).padStart(2, '0')}
          </span>
        </p>
        {caption.name.includes(' ') ? (
          <Name name={caption.name} />
        ) : (
          <p className={styles.name} data-single="true" style={idx(1)}>
            {caption.name}
          </p>
        )}
        {caption.byline ? (
          <p className={styles.by} style={idx(2)}>
            {caption.byline}
          </p>
        ) : null}
        <p className={styles.line} style={idx(3)}>
          {caption.line}
        </p>
        {caption.note ? (
          <p className={styles.note} style={idx(4)}>
            {caption.note}
          </p>
        ) : null}
        <div className={styles.progress} style={idx(5)} aria-hidden="true" />
      </div>
    </div>
  );
}

interface Shown {
  index: number;
  prev: number | null;
  seq: number;
}

/**
 * The caption tour: one build at a time, 8 s each, a slow crossfade between. Time decides which
 * caption shows (`captionAt`); the component only sleeps until the next boundary, and pauses
 * while the tab is hidden.
 */
export function Tour() {
  const playlist = useMemo(buildPlaylist, []);
  const count = playlist.length;
  const startIndex = useRef(nextStart(lastShown, count));
  const [shown, setShown] = useState<Shown>(() => ({ index: startIndex.current, prev: null, seq: 0 }));

  useEffect(() => {
    let timer = 0;
    let startedAt = performance.now();
    let hiddenAt: number | null = null;

    const tick = () => {
      const t = captionAt(performance.now() - startedAt, count, startIndex.current);
      lastShown = t.index;
      setShown((s) => (s.index === t.index ? s : { index: t.index, prev: s.index, seq: s.seq + 1 }));
      timer = window.setTimeout(tick, t.nextInMs);
    };
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = performance.now();
        window.clearTimeout(timer);
      } else if (hiddenAt !== null) {
        // Time away does not count: the caption on screen when you left is the one you return to.
        startedAt += performance.now() - hiddenAt;
        hiddenAt = null;
        tick();
      }
    };
    tick();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [count]);

  // Retire the outgoing caption once its fade is done.
  useEffect(() => {
    if (shown.prev === null) return;
    const t = window.setTimeout(
      () => setShown((s) => (s.seq === shown.seq ? { ...s, prev: null } : s)),
      CROSSFADE_MS + 100,
    );
    return () => window.clearTimeout(t);
  }, [shown.seq, shown.prev]);

  // Warm the next picture so the crossfade never waits on the network.
  useEffect(() => {
    const next = playlist[(shown.index + 1) % count]?.art;
    if (!next) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = next.src;
  }, [shown.index, playlist, count]);

  const current = playlist[shown.index];
  const prev = shown.prev !== null ? playlist[shown.prev] : null;
  if (!current) return null;

  return (
    <div className={styles.tour}>
      {prev ? <CaptionView key={`p${shown.seq}`} caption={prev} phase="leave" /> : null}
      <CaptionView key={`c${shown.seq}`} caption={current} phase="enter" />
    </div>
  );
}
