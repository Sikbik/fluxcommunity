import React from 'react'

const BaseGlyph = ({
  children,
  className = '',
  strokeWidth = 1.8,
  viewBox = '0 0 24 24',
  ...rest
}) => (
  <svg
    viewBox={viewBox}
    fill="none"
    className={className}
    aria-hidden="true"
    focusable="false"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    shapeRendering="geometricPrecision"
    {...rest}
  >
    {children}
  </svg>
)

export const CloudGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <path d="M8 19h8.5a4.5 4.5 0 0 0 .6-8.96A5.5 5.5 0 0 0 6.8 8.2 4.2 4.2 0 0 0 8 19Z" />
    <path d="M8.2 13.2h8.6" opacity="0.7" />
  </BaseGlyph>
)

export const CubeGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <path d="M12 3 4.7 7.2v9.6L12 21l7.3-4.2V7.2L12 3Z" />
    <path d="M12 12 4.7 7.2M12 12l7.3-4.8M12 12v9" opacity="0.7" />
  </BaseGlyph>
)

export const FlashGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <path d="M13.8 2.8 6.6 12h4.7l-1.1 9.2 7.2-9.2h-4.7l1.1-9.2Z" />
  </BaseGlyph>
)

export const BookGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <path d="M12 6.4c-1.6-1.5-3.7-2.4-6.5-2.4v14c2.8 0 4.9.9 6.5 2.4 1.6-1.5 3.7-2.4 6.5-2.4V4c-2.8 0-4.9.9-6.5 2.4Z" />
    <path d="M12 6.4V20.4" opacity="0.7" />
  </BaseGlyph>
)

export const ExternalLinkGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <path d="M13 5h6v6" />
    <path d="m19 5-9.5 9.5" />
    <path d="M19 12v6.2A1.8 1.8 0 0 1 17.2 20H5.8A1.8 1.8 0 0 1 4 18.2V6.8A1.8 1.8 0 0 1 5.8 5H12" />
  </BaseGlyph>
)

export const GithubGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <path d="M8.5 16.5h7M8 12h8M8.5 7.5h7" />
    <rect x="4.5" y="4" width="15" height="16" rx="3" />
    <path d="m10 20 2-2 2 2" opacity="0.7" />
  </BaseGlyph>
)

export const XGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <path d="m5 4 14 16" />
    <path d="M18.8 4 12 11.7 5.2 20" />
  </BaseGlyph>
)

export const ChatGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <path d="M4.5 6.8A2.8 2.8 0 0 1 7.3 4h9.4a2.8 2.8 0 0 1 2.8 2.8v6.4a2.8 2.8 0 0 1-2.8 2.8h-5.1L7.5 20v-4h-.2a2.8 2.8 0 0 1-2.8-2.8Z" />
    <path d="M8.5 10h7" opacity="0.7" />
  </BaseGlyph>
)

export const GroupGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <circle cx="9" cy="9" r="2.5" />
    <circle cx="15.5" cy="9.8" r="2.2" opacity="0.8" />
    <path d="M4.8 18a4.3 4.3 0 0 1 8.4 0" />
    <path d="M13 18a3.5 3.5 0 0 1 6 0" opacity="0.8" />
  </BaseGlyph>
)

export const WalletGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <rect x="3.5" y="6" width="17" height="12" rx="2.8" />
    <path d="M3.5 9h17" opacity="0.7" />
    <circle cx="16.5" cy="13" r="1.2" />
  </BaseGlyph>
)

export const ArrowRightGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <path d="M4 12h16" />
    <path d="m13 7 5 5-5 5" />
  </BaseGlyph>
)

export const MapGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <path d="m3.8 6.5 4.5-2 6.3 2.4 5.6-2.4v13l-5.6 2.2-6.3-2.4-4.5 2.1v-13Z" />
    <path d="M8.3 4.5v13M14.6 6.9v13" opacity="0.7" />
  </BaseGlyph>
)

export const AcademyGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <path d="m3 9 9-4 9 4-9 4-9-4Z" />
    <path d="M6.5 11v4.2c0 1.9 2.7 3.3 5.5 3.3s5.5-1.4 5.5-3.3V11" />
  </BaseGlyph>
)

export const GraphGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <path d="M4 19h16" />
    <path d="M6.2 15.2 10 11l3.1 2.7 4.7-5.4" />
    <circle cx="10" cy="11" r="1" />
    <circle cx="13.1" cy="13.7" r="1" />
    <circle cx="17.8" cy="8.3" r="1" />
  </BaseGlyph>
)

export const ServerGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <rect x="4" y="5" width="16" height="4.5" rx="1.6" />
    <rect x="4" y="10.8" width="16" height="4.5" rx="1.6" />
    <rect x="4" y="16.6" width="16" height="2.8" rx="1.4" />
    <circle cx="17.5" cy="7.2" r="0.8" />
    <circle cx="17.5" cy="13" r="0.8" />
  </BaseGlyph>
)

export const GlobeGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M4.5 12h15M12 3.8a13.2 13.2 0 0 1 0 16.4M12 3.8a13.2 13.2 0 0 0 0 16.4" opacity="0.7" />
  </BaseGlyph>
)

export const AIStarGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <path d="M12 3.8 14.2 9l5.6 2-5.6 2L12 18.2l-2.2-5.2-5.6-2 5.6-2L12 3.8Z" />
    <path d="m17.8 4.8.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8.8-1.8Z" opacity="0.8" />
  </BaseGlyph>
)

export const ReportGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <path d="M5 19V7.2A2.2 2.2 0 0 1 7.2 5H16l3 3v11H5Z" />
    <path d="M16 5v3h3" opacity="0.7" />
    <path d="M8.4 15.4h7.2M8.4 12.4h7.2M8.4 9.4h4.1" opacity="0.8" />
  </BaseGlyph>
)

export const CalculatorGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <rect x="5" y="3.8" width="14" height="16.4" rx="2.2" />
    <rect x="8" y="7" width="8" height="2.4" rx="0.6" opacity="0.8" />
    <path d="M8 12.4h.01M12 12.4h.01M16 12.4h.01M8 15.8h.01M12 15.8h.01M16 15.8h.01" />
  </BaseGlyph>
)

export const CodeGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <path d="m9.2 7.5-4.2 4.5 4.2 4.5M14.8 7.5l4.2 4.5-4.2 4.5M13.4 5.8l-2.8 12.4" />
  </BaseGlyph>
)

export const VideoGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <rect x="4.2" y="6.2" width="15.6" height="11.6" rx="2" />
    <path d="m10.3 9.7 4.8 2.3-4.8 2.3V9.7Z" />
  </BaseGlyph>
)

export const ActivityGlyph = ({ className }) => (
  <BaseGlyph className={className}>
    <path d="M3.8 12h3.3l2-4.2 2.6 8.4 2.3-5.1h6.2" />
  </BaseGlyph>
)
