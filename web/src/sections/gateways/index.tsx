import { GATEWAYS } from '@shared/catalog';
import { type CSSProperties, useMemo, useRef } from 'react';
import { Section, useInView, useMedia } from '@/ui';
import { BENTO_DESKTOP_MIN, BENTO_PHONE_MAX, DOM_ORDER, LAYOUTS, placementFor } from './bento';
import { GatewayTile } from './GatewayTile';
import styles from './gateways.module.css';
import { TILES } from './tiles';

/**
 * 02 / Gateways. The official doors into Flux as a bento of glass tiles floating over the
 * lattice. The layout (12 columns, 2, or 1) is picked by breakpoint from `bento.ts`; every
 * tile is a real link and none is decoration.
 */
export default function Gateways() {
  const desktop = useMedia(`(min-width: ${BENTO_DESKTOP_MIN}px)`, true);
  const tablet = useMedia(`(min-width: ${BENTO_PHONE_MAX}px)`, true);
  const layout = LAYOUTS[desktop ? 'desktop' : tablet ? 'tablet' : 'phone'];

  // The idle motion (float, micro animations) only runs while the bento is on screen.
  const grid = useRef<HTMLDivElement>(null);
  const live = useInView(grid, { rootMargin: '160px' });

  const byId = useMemo(() => new Map(GATEWAYS.map((g) => [g.id, g])), []);

  return (
    <Section
      id="gateways"
      width="wide"
      title={
        <>
          Start <b>anywhere</b>.
        </>
      }
      lead="The official doors into Flux, one hop away."
    >
      <div
        ref={grid}
        className={styles.grid}
        data-layout={layout.name}
        data-art-live={live ? 'true' : 'false'}
        style={{ '--cols': layout.cols } as CSSProperties}
      >
        {DOM_ORDER.map((id, i) => {
          const gateway = byId.get(id);
          const placement = placementFor(layout, id);
          const spec = TILES[id];
          if (!gateway || !placement || !spec) return null;
          return <GatewayTile key={id} gateway={gateway} placement={placement} spec={spec} index={i} />;
        })}
      </div>
    </Section>
  );
}
