/**
 * System effects that have no surface of their own. Today that is the sound wiring: the engine
 * itself lives in `sound.ts` (and is what `lib/sound` re-exports for the shell); this mounts the
 * delegated listeners and subscriptions that make it respond to the page. Renders nothing.
 */
import { useEffect } from 'react';
import { startSound } from './wiring';

export default function SystemOverlay() {
  useEffect(() => startSound(), []);
  return null;
}
