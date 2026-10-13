import type { Ref, RefCallback } from 'react';

/** Merges several refs (callback or object) into one callback ref. */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(value);
      else if (ref && typeof ref === 'object') (ref as { current: T | null }).current = value;
    }
  };
}
