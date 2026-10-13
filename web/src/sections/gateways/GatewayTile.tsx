import type { Gateway } from '@shared/catalog';
import { type CSSProperties, type MouseEvent, useId, useRef } from 'react';
import { GATEWAY_ART } from '@/content/art';
import { GATEWAY_GLYPH, Glyph, NewTabHint, outboundLink, Panel, Reveal } from '@/ui';
import { ArtLayer } from './art/ArtLayer';
import { useParallax } from './art/useParallax';
import type { Placement } from './bento';
import { FxOver, FxUnder } from './Fx';
import styles from './GatewayTile.module.css';
import { playLaunch } from './launch';
import { KIND_LABEL, splitName, type TileSpec } from './tiles';

export interface GatewayTileProps {
  gateway: Gateway;
  placement: Placement;
  spec: TileSpec;
  /** Position in the stagger of the reveal. */
  index: number;
}

/**
 * One door. The whole tile is the link (`Panel as="a"`): glass slab, art that drifts opposite
 * the pointer, a tilt, a spotlight, the lattice lit beneath, and an arrow that slides out.
 * The link carries what `ExtLink` gives an outbound link, from `outboundLink`: utm, new tab,
 * noopener, and a hidden "Opens in a new tab" in the accessible name.
 */
export function GatewayTile({ gateway, placement, spec, index }: GatewayTileProps) {
  const host = useRef<HTMLElement>(null);
  useParallax(host);

  const uid = useId();
  const kindId = `${uid}k`;
  const nameId = `${uid}n`;
  const descId = `${uid}d`;
  const tabId = `${uid}t`;

  const link = outboundLink(gateway.url, { withUtm: true });
  const { form } = placement;
  const [lead, rest] = splitName(gateway.name);
  const quiet = spec.tone === 'quiet';
  const artId = GATEWAY_ART[gateway.id];

  const style: CSSProperties = {
    gridColumn: `${placement.col} / span ${placement.colSpan}`,
    gridRow: `${placement.row} / span ${placement.rowSpan}`,
  };

  const onClick = (e: MouseEvent<HTMLElement>) => playLaunch(e.currentTarget, e.clientX, e.clientY);

  return (
    <Reveal index={index} className={styles.cell} style={style}>
      <Panel
        ref={host}
        as="a"
        {...link.props}
        aria-labelledby={link.newTab ? `${nameId} ${tabId}` : nameId}
        aria-describedby={`${kindId} ${descId}`}
        onClick={onClick}
        interactive
        tilt={spec.tilt}
        stageFocus={spec.focus}
        hot={spec.hot}
        pattern={spec.pattern}
        size={spec.tone === 'hero' ? 'lg' : 'md'}
        halo={!quiet}
        container
        padding="none"
        className={styles.tile}
        contentClassName={styles.content}
        data-art-host=""
        data-form={form}
        data-tone={spec.tone}
        data-gateway={gateway.id}
      >
        {artId ? (
          <ArtLayer
            art={artId}
            floatSeconds={spec.float[0]}
            floatDelay={spec.float[1]}
            fallbackGlyph={GATEWAY_GLYPH[gateway.kind]}
            strength={quiet ? 0.78 : 1}
            breath={spec.fx === 'ai'}
            under={<FxUnder id={spec.fx} />}
          >
            <FxOver id={spec.fx} />
          </ArtLayer>
        ) : null}
        <span className={styles.scrim} aria-hidden="true" />
        <div className={styles.copy}>
          <p className={styles.kind} id={kindId}>
            <Glyph name={GATEWAY_GLYPH[gateway.kind]} size={form === 'strip' ? 22 : 18} />
            <span className={styles.kindLabel}>{KIND_LABEL[gateway.kind]}</span>
          </p>
          <div className={styles.body}>
            <h3 className={styles.name} id={nameId}>
              {rest ? (
                <>
                  <span className={styles.lite}>{lead}</span>
                  {rest}
                </>
              ) : (
                lead
              )}
            </h3>
            <p className={styles.tagline} id={descId}>
              {gateway.tagline}
            </p>
            {form === 'hero' ? <p className={styles.detail}>{gateway.description}</p> : null}
          </div>
          <div className={styles.foot}>
            <span className={styles.host}>{gateway.host}</span>
            <span className={styles.go} aria-hidden="true">
              <span className={styles.arrows}>
                <Glyph name="arrow-up-right" size={16} className={styles.arrowOut} />
                <Glyph name="arrow-up-right" size={16} className={styles.arrowIn} />
              </span>
            </span>
          </div>
          {link.newTab ? <NewTabHint id={tabId} /> : null}
        </div>
      </Panel>
    </Reveal>
  );
}
