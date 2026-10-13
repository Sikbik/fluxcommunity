import { useEffect, useLayoutEffect } from 'react';

/** useLayoutEffect in the browser, useEffect where there is no DOM. */
export const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
