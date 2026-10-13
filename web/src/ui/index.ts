/**
 * The design system. Section code imports from `@/ui`; the README next to this file is
 * the documentation. Primitives are grouped as in the README.
 */

// Controls
export {
  Button,
  type ButtonProps,
  type ButtonVisualProps,
  LinkButton,
  type LinkButtonProps,
} from './Button/Button';
export { Chip, type ChipProps } from './Chip/Chip';
// Layout and structure
export { Container, type ContainerProps } from './Container/Container';
export { CountUp, type CountUpProps } from './CountUp/CountUp';
export { Dialog, type DialogProps } from './Dialog/Dialog';
// Overlays
export { Drawer, type DrawerProps } from './Drawer/Drawer';
export { ExtLink, type ExtLinkProps } from './ExtLink/ExtLink';
export { NewTabHint, type NewTabHintProps } from './ExtLink/NewTabHint';
export { FluxMark, type FluxMarkProps, type FluxMarkVariant, type FluxTone } from './FluxMark/FluxMark';
export {
  FreshnessChip,
  type FreshnessChipProps,
  type FreshnessKind,
} from './FreshnessChip/FreshnessChip';
// Marks, glyphs, decoration
export { Glyph, type GlyphProps } from './Glyph/Glyph';
export {
  GATEWAY_GLYPH,
  GLYPH_GROUPS,
  GLYPH_NAMES,
  GLYPHS,
  type GlyphName,
  type GlyphShape,
  glyphShapes,
  isGlyphName,
} from './Glyph/glyphs';
export { HexBullet, type HexBulletProps } from './HexBullet/HexBullet';
export { HexRing, type HexRingProps } from './HexRing/HexRing';
// Hooks
export * from './hooks';
export {
  Magnetic,
  type MagneticProps,
  Spotlight,
  type SpotlightProps,
  Tilt,
  type TiltProps,
} from './Interaction/Interaction';
export { getLayer, type LayerName } from './internal/layers';
export {
  isExternalHref,
  NEW_TAB_HINT,
  type OutboundLink,
  type OutboundLinkOptions,
  outboundLink,
} from './internal/links';
export {
  observeResize,
  type ResizeFrameCallback,
  type ResizeFrameOptions,
  type ResizeObserverHookOptions,
  useResizeObserver,
} from './internal/useResizeObserver';
export { Kbd, type KbdProps } from './Kbd/Kbd';
export { Lattice2D, type Lattice2DProps } from './Lattice2D/Lattice2D';
export { Marquee, type MarqueeItemInfo, type MarqueeItemState, type MarqueeProps } from './Marquee/Marquee';
export { Meter, type MeterProps } from './Meter/Meter';
export { Odometer, type OdometerProps } from './Odometer/Odometer';
export { Panel, type PanelCorner, type PanelProps } from './Panel/Panel';
// Motion and interaction
export { Reveal, type RevealProps } from './Reveal/Reveal';
export { SearchField, type SearchFieldProps } from './SearchField/SearchField';
export { Section, type SectionProps } from './Section/Section';
export { SectionHeader, type SectionHeaderProps } from './SectionHeader/SectionHeader';
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentOption,
} from './SegmentedControl/SegmentedControl';
export { Select, type SelectOption, type SelectProps } from './Select/Select';
export { Skeleton, type SkeletonProps } from './Skeleton/Skeleton';
export { Sparkline, type SparklineProps } from './Sparkline/Sparkline';
export { SplitReveal, type SplitRevealProps } from './SplitReveal/SplitReveal';
export { Stat, type StatProps } from './Stat/Stat';
// Status and data
export { type Status, StatusDot, type StatusDotProps } from './StatusDot/StatusDot';
export { Switch, type SwitchProps } from './Switch/Switch';
export { type TabItem, TabPanel, type TabPanelProps, Tabs, type TabsProps, tabIds } from './Tabs/Tabs';
export {
  type ToastAction,
  ToastHost,
  type ToastItem,
  type ToastKind,
  type ToastOptions,
  toast,
  useToastStore,
} from './Toast/exports';
export { Tooltip, type TooltipProps } from './Tooltip/Tooltip';
