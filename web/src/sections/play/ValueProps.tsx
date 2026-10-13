import { Glyph, type GlyphName, Panel, Reveal } from '@/ui';
import styles from './play.module.css';

interface Prop {
  id: string;
  glyph: GlyphName;
  title: string;
  body: string;
  hot: 'tl' | 'tr' | 'bl' | 'br';
}

/** The three value props. Every claim is the catalog's or DESIGN 5.6's own words. */
const PROPS: readonly Prop[] = [
  {
    id: 'node',
    glyph: 'nodes',
    title: 'A node of its own',
    body: 'Each server runs on its own independent node.',
    hot: 'tl',
  },
  {
    id: 'region',
    glyph: 'site',
    title: 'Pick your region',
    body: 'Choose the region your server runs in.',
    hot: 'br',
  },
  {
    id: 'pay',
    glyph: 'wallet',
    title: 'Card or FLUX',
    body: 'Pay by card or with FLUX. Flat monthly plans, no contract.',
    hot: 'tr',
  },
];

export function ValueProps() {
  return (
    // biome-ignore lint/a11y/noRedundantRoles: `list-style: none` strips list semantics in WebKit, so the role is restored
    <ul className={styles.props} role="list">
      {PROPS.map((p, i) => (
        <li key={p.id} className={styles.propCell}>
          <Reveal index={i + 1} className={styles.propReveal}>
            <Panel
              interactive
              tilt={false}
              stageFocus={0.35}
              hot={p.hot}
              pattern="none"
              size="md"
              padding="md"
              container
              className={styles.prop}
              contentClassName={styles.propContent}
            >
              <span className={styles.icon} aria-hidden="true">
                <Glyph name={p.glyph} size={24} />
              </span>
              <div className={styles.propText}>
                <h3 className={styles.propTitle}>{p.title}</h3>
                <p className={styles.propBody}>{p.body}</p>
              </div>
              <span className={styles.numeral} aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
            </Panel>
          </Reveal>
        </li>
      ))}
    </ul>
  );
}
