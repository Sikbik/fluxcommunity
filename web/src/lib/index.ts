/** Barrel for the framework-free helpers and the small global stores. */

export { copyText } from './clipboard';
export { type ClassValue, cn } from './cn';
export { type Flags, getFlags, parseFlags } from './flags';
export * from './format';
export * from './hash';
export { comboLabels, isTypingTarget, matchCombo, parseCombo } from './hotkeys';
export {
  clamp,
  clamp01,
  damp,
  easeInOutCubic,
  easeOutCubic,
  easeOutExpo,
  invLerp,
  lerp,
  mod,
  remap,
  roundTo,
  smoothstep,
} from './math';
export {
  effectiveReducedMotion,
  osPrefersReducedMotion,
  startMotionSync,
  subscribeReducedMotion,
} from './motion';
export {
  anyModalOverlayOpen,
  type OverlayName,
  type OverlaysState,
  useOverlays,
} from './overlays';
export { deviceMemory, isMacLike, modKeyLabel, prefersSaveData } from './platform';
export { ACCENTS, DEFAULT_PREFS, PREFS_KEY, type Prefs, sanitizePrefs, usePrefs } from './prefs';
export {
  closeApp,
  goToSection,
  type HashRouteApi,
  type NavigateOptions,
  navigate,
  openApp,
  useHashRoute,
  useRouteStore,
} from './route';
export { cancelScroll, type ScrollOptions, scrollToSection, sectionElement, useGlideStore } from './scroll';
export { fireClickPulse, pushStageAccent, regionFromElement, syncStageAccent } from './stage';
export { readItem, readJson, removeItem, writeItem, writeJson } from './storage';
