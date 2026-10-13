import { SOCIALS, type SocialLink } from '@shared/catalog';
import { type CSSProperties, useRef } from 'react';
import { useStageBus } from '@/stage/bus';
import { ExtLink, Glyph, useInView, usePointerGlow, useStageFocus, useTilt } from '@/ui';
import { ChannelGlyph } from './ChannelGlyph';
import styles from './channels.module.css';
import { flowerLayout, type Layout, SLOT_COUNT, zigzagLayout } from './honeycomb';

/** Scale of the primary door against the other cells, on desktop and on a phone. */
const BIG_DESKTOP = 1.32;
const BIG_PHONE = 1.18;
const GAP = 0.045;

const FLOWER = flowerLayout({ big: BIG_DESKTOP, gap: GAP });
const ZIGZAG = zigzagLayout({ big: BIG_PHONE, gap: GAP });

/** The primary door goes first (it is the centre of the flower), the rest keep catalog order. */
export function orderChannels(socials: readonly SocialLink[]): SocialLink[] {
  const primary = socials.find((s) => s.id === 'discord') ?? socials[0];
  return primary ? [primary, ...socials.filter((s) => s !== primary)] : [];
}

const num = (n: number) => Number(n.toFixed(5));

function layoutVars(layout: Layout, prefix: 'f' | 'z'): CSSProperties {
  return { [`--${prefix}w`]: num(layout.width), [`--${prefix}h`]: num(layout.height) } as CSSProperties;
}

function slotVars(index: number, flower: Layout, zigzag: Layout): CSSProperties {
  const f = flower.slots[index];
  const z = zigzag.slots[index];
  return {
    '--i': index,
    '--fx': f ? num(f.x) : 0,
    '--fy': f ? num(f.y) : 0,
    '--fcw': f ? num(f.w) : 1,
    '--zx': z ? num(z.x) : 0,
    '--zy': z ? num(z.y) : 0,
    '--zcw': z ? num(z.w) : 1,
  } as CSSProperties;
}

/** The hexagon in the SVG's own units: a 100 wide, 115.47 tall box, inset so the 1 px stroke stays inside. */
const HEX = 'M50 0.5L99.5 29.1V86.4L50 114.97L0.5 86.4V29.1Z';
const HEX_INNER = 'M50 8.4L92.7 33.05V82.4L50 107.07L7.3 82.4V33.05Z';
/** A short radial tick outside each of the six vertices: the instrument marks. */
const TICKS = [
  'M50 -1.5V-5',
  'M100.9 28.3L104 26.5',
  'M100.9 87.2L104 89',
  'M50 117L50 120.5',
  'M-0.9 87.2L-4 89',
  'M-0.9 28.3L-4 26.5',
].join('');

interface CellProps {
  social: SocialLink;
  primary: boolean;
  index: number;
  shown: boolean;
  /** The slot's layout variables. */
  vars: CSSProperties;
}

function Cell({ social, primary, index, shown, vars }: CellProps) {
  const ref = useRef<HTMLDivElement>(null);
  // A channel can need no handle line (Discord says only its name): then there is no element and no gap.
  const handle = social.handle.trim();
  usePointerGlow(ref);
  useTilt(ref, { max: primary ? 3 : 4 });
  useStageFocus(ref, primary ? 0.9 : 0.7);

  const launch = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    useStageBus.getState().firePulse('success', r.left + r.width / 2, r.top + r.height / 2, 0.8);
    el.dataset.launch = 'true';
    window.setTimeout(() => {
      delete el.dataset.launch;
    }, 280);
  };

  return (
    <li
      className={styles.slot}
      style={vars}
      data-id={social.id}
      data-primary={primary ? 'true' : undefined}
      data-handle={handle === '' ? 'none' : undefined}
      data-shown={shown ? 'true' : 'false'}
    >
      <div ref={ref} className={styles.cell} data-index={index}>
        <span className={styles.halo} aria-hidden="true" />
        <span className={styles.fill} aria-hidden="true" />
        <span className={styles.pattern} aria-hidden="true" />
        <span className={styles.grain} aria-hidden="true" />
        <span className={styles.spot} aria-hidden="true" />
        <svg
          className={styles.edge}
          viewBox="0 0 100 115.47"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {primary ? <path className={styles.inner} d={HEX_INNER} /> : null}
          {primary ? <path className={styles.ripple} d={HEX} /> : null}
          <path className={styles.ring} d={HEX} />
          <path className={styles.hot} d={HEX} pathLength={100} />
          <path className={styles.beam} d={HEX} pathLength={100} />
          <path className={styles.ticks} d={TICKS} />
        </svg>
        <div className={styles.body}>
          <span className={styles.glyphBox}>
            <ChannelGlyph id={social.id} size={primary ? 44 : 34} />
          </span>
          <ExtLink
            href={social.url}
            withUtm
            tone="bare"
            icon={false}
            className={styles.link}
            onClick={launch}
          >
            <span className={styles.name}>{social.name}</span>
            {handle === '' ? null : <span className={styles.handle}>{handle}</span>}
          </ExtLink>
          <Glyph name="arrow-up-right" size={primary ? 18 : 15} className={styles.arrow} />
        </div>
        <span className={styles.dim} aria-hidden="true" />
      </div>
    </li>
  );
}

/**
 * The channel cluster: a hex honeycomb of cells, the primary door largest. Seven channels make a
 * hex flower (rows of 2, 3, 2) on desktop and a honeycomb two cells wide on a phone; any other count
 * wraps as a centred row of cells. Every cell is a real external link.
 */
export function Channels() {
  const root = useRef<HTMLUListElement>(null);
  const shown = useInView(root, { once: true, rootMargin: '0px 0px -12% 0px' });
  const channels = orderChannels(SOCIALS);
  const exact = channels.length === SLOT_COUNT;

  return (
    <div className={styles.stage}>
      <ul
        ref={root}
        className={styles.cluster}
        // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from unstyled lists without it
        role="list"
        aria-label="Flux community channels"
        data-layout={exact ? 'honeycomb' : 'free'}
        style={{ ...layoutVars(FLOWER, 'f'), ...layoutVars(ZIGZAG, 'z') }}
      >
        {channels.map((social, i) => (
          <Cell
            key={social.id}
            social={social}
            primary={i === 0}
            index={i}
            shown={shown}
            vars={exact ? slotVars(i, FLOWER, ZIGZAG) : ({ '--i': i } as CSSProperties)}
          />
        ))}
      </ul>
    </div>
  );
}
