import { type CSSProperties, Fragment, type Ref } from 'react';
import { cn } from '@/lib/cn';
import styles from './hero.module.css';

interface Word {
  text: string;
  /** One of the two key words: 700 weight and the accent gradient. */
  key?: number;
}

/**
 * "Built by the community / Run by the network" as four stacked lines, light and bold in turn, with no
 * end punctuation (it is a headline, not a sentence).
 *
 * The h1 is ONE block of inline text with hard line breaks: the browser measures the largest
 * contentful paint per block, so a heading built from block or inline-block pieces would be beaten
 * by a longer paragraph. The lines are fixed (a font swap can never re-wrap the headline, so no
 * layout shift) and every word is a real text node with real spaces, so it reads as one sentence.
 */
const LINES: readonly (readonly Word[])[] = [
  [{ text: 'Built' }, { text: 'by' }, { text: 'the' }],
  [{ text: 'community', key: 0 }],
  [{ text: 'Run' }, { text: 'by' }, { text: 'the' }],
  [{ text: 'network', key: 1 }],
];

/** Stagger index of the first word (the eyebrow is 0 and the frame is 1). */
const FIRST = 2;

export function Headline({ id, ref }: { id: string; ref?: Ref<HTMLHeadingElement> }) {
  let n = FIRST;
  return (
    <h1 id={id} ref={ref} className={styles.title}>
      {LINES.map((line, li) => (
        <Fragment key={line.map((w) => w.text).join(' ')}>
          {li > 0 ? <br /> : null}
          {line.map((w, wi) => {
            const i = n++;
            return (
              <Fragment key={w.text}>
                {wi > 0 ? ' ' : null}
                <span
                  className={cn(styles.word, w.key !== undefined && styles.key)}
                  style={{ '--i': i, '--k': w.key ?? 0 } as CSSProperties}
                >
                  {w.text}
                </span>
              </Fragment>
            );
          })}
          {li < LINES.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </h1>
  );
}
