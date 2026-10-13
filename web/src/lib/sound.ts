/**
 * The sound effects. The engine itself (a tiny WebAudio synth: hover ticks, clicks, a block
 * chime, confirm and warn blips, an ambient swell) lives in `system/sound.ts` with its tested
 * scheduling logic; this module keeps the import path the shell already uses.
 */
export { sfx, soundEnabled } from '@/system/sound';
