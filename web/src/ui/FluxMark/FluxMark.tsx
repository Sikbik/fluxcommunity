import type { SVGAttributes } from 'react';

export type FluxTone = 'blue' | 'white' | 'black' | 'gray';
export type FluxMarkVariant = 'mark' | 'round';

export interface FluxMarkProps extends Omit<SVGAttributes<SVGSVGElement>, 'children' | 'width' | 'height'> {
  /**
   * Official colourways only (Flux Brand Book): blue, white, black or gray.
   * `mark` is the bare symbol in that colour. `round` is the symbol on a disc: blue disc
   * with a white symbol, white disc with a blue symbol, white disc with a black symbol,
   * or a gray disc with a white symbol.
   */
  tone?: FluxTone;
  /** `mark` (bare symbol, default) or `round` (on its disc). */
  variant?: FluxMarkVariant;
  /** Height in px; width follows the artwork's aspect ratio. Default 32. */
  size?: number;
  /** Accessible name. Omit when the mark is decorative next to the words "Flux". */
  title?: string;
}

const FILL: Record<FluxTone, string> = {
  blue: '#2b61d1',
  white: '#ffffff',
  black: '#000000',
  gray: '#7e7c7c',
};

// Official artwork, verbatim from web/public/brand (flux-mark-*.svg and flux-round-*.svg).
// Never redraw, recolour outside the four tones above, or distort.
const MARK_VIEW = { w: 279.714, h: 322.975 };
const MARK_PATHS = [
  {
    d: 'M175.03,202.425l-28.9,16.7L84.03,183.28l28.2-16.285.7-.414,1.077.622Z',
    t: 'translate(-6.271 103.85)',
  },
  {
    d: 'M326.213,116.8v33.607L265.09,115.125l-16.576-9.572-16.576,9.572-77.7,44.858-16.576,9.572v19.787l-29.9-17.259-16.576-9.572-16.576,9.572L46.5,188.307V116.8L186.356,36.06Z',
    t: 'translate(-46.5 -36.06)',
  },
  {
    d: 'M261.9,132.948v89.715l-77.7,44.858-.1-.062-77.594-44.8V132.948L184.2,88.07Z',
    t: 'translate(17.819 19.693)',
  },
  {
    d: 'M135.884,141.366v51.591L91.192,218.774,46.5,192.957V141.366l44.692-25.8Z',
    t: 'translate(-46.5 49.17)',
  },
] as const;

const ROUND_VIEW = { w: 337.555, h: 335.319 };
const DISC =
  'M168.777,0c93.213,0,168.777,75.064,168.777,167.66s-75.564,167.66-168.777,167.66S0,260.256,0,167.66,75.564,0,168.777,0Z';
const ROUND_GROUP = 'translate(76.538 61.305)';
const ROUND_PATHS = [
  {
    d: 'M144.555,190.421l-19.224,11.107-41.3-23.841,18.756-10.832.469-.276.717.413Z',
    t: 'translate(-32.311 13.286)',
  },
  {
    d: 'M232.54,89.764v22.352L191.887,88.647l-11.025-6.367-11.025,6.367L118.16,118.483l-11.025,6.367V138.01L87.25,126.531l-11.025-6.367L65.2,126.531l-18.7,10.79V89.764l93.02-53.7Z',
    t: 'translate(-46.5 -36.06)',
  },
  {
    d: 'M209.856,117.919V177.59l-51.678,29.835-.069-.041L106.5,177.59V117.919L158.178,88.07Z',
    t: 'translate(-23.815 -16.396)',
  },
  {
    d: 'M105.95,132.727v34.314L76.225,184.212,46.5,167.041V132.727L76.225,115.57Z',
    t: 'translate(-46.5 -5.999)',
  },
] as const;

/** Disc and symbol colours for the round lockups, per the brand files. */
const ROUND: Record<FluxTone, { disc: string; symbol: string }> = {
  blue: { disc: '#2b61d1', symbol: '#ffffff' },
  white: { disc: '#ffffff', symbol: '#2b61d1' },
  black: { disc: '#ffffff', symbol: '#000000' },
  gray: { disc: '#7e7c7c', symbol: '#ffffff' },
};

/**
 * The Flux symbol, inline, as the official artwork in blue, white, black or gray.
 * It never takes the page accent or a tier colour.
 *
 *   <FluxMark tone="white" size={28} />
 *   <FluxMark variant="round" tone="blue" size={32} title="Flux" />
 */
export function FluxMark({ tone = 'white', variant = 'mark', size = 32, title, ...rest }: FluxMarkProps) {
  const label = title ? { role: 'img' as const, 'aria-label': title } : { 'aria-hidden': true as const };
  // The accessible name (or aria-hidden) is applied through the `label` spread on each svg.
  if (variant === 'round') {
    const { disc, symbol } = ROUND[tone];
    const width = (size * ROUND_VIEW.w) / ROUND_VIEW.h;
    return (
      // biome-ignore lint/a11y/noSvgWithoutTitle: named or hidden through the `label` spread
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${ROUND_VIEW.w} ${ROUND_VIEW.h}`}
        width={width}
        height={size}
        focusable="false"
        {...label}
        {...rest}
      >
        <path d={DISC} fill={disc} />
        <g transform={ROUND_GROUP}>
          {ROUND_PATHS.map((p) => (
            <path key={p.t} d={p.d} transform={p.t} fill={symbol} />
          ))}
        </g>
      </svg>
    );
  }
  const width = (size * MARK_VIEW.w) / MARK_VIEW.h;
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: named or hidden through the `label` spread
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${MARK_VIEW.w} ${MARK_VIEW.h}`}
      width={width}
      height={size}
      focusable="false"
      {...label}
      {...rest}
    >
      {MARK_PATHS.map((p) => (
        <path key={p.t} d={p.d} transform={p.t} fill={FILL[tone]} />
      ))}
    </svg>
  );
}
