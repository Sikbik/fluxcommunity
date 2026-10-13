// Single source of truth for the generated artwork: prompts, post-processing and manifest data.
//
// Read by:
//   web/scripts/generate-art.mjs   builds the prompt and calls scripts/imagegen.mjs
//   web/scripts/optimize-art.mjs   turns assets-src/raw/<id>.png into web/public/art/<id>.webp|avif
//                                  and rewrites web/src/content/art.ts
//
// Human readable record of what worked and what did not: assets-src/PROMPTS.md.
//
// House rules (docs/DESIGN.md section 9): no logos, no text, no UI, no people, no scenery. One accent
// colour per piece. Pure black background so mix-blend-mode: screen is seamless.

/** The style prefix from docs/DESIGN.md section 9, verbatim. `{accent}` is the only substitution. */
export const STYLE_PREFIX =
  'Dark glass and frosted crystal hexagonal forms with {accent} edge light and white-hot highlights, volumetric haze, soft bloom, photoreal 3D render, premium minimal, pure black (#000000) background, no text, no logos, no UI, no people, no scenery';

export const ACCENTS = {
  flux: 'electric royal blue (#2B61D1)',
  cumulus: 'vivid cyan (#36D3FF)',
  nimbus: 'luminous violet (#C77DFF)',
  stratus: 'saturated amber gold (#FFC857)',
};

/** Shared lighting rig and lens, so every piece reads as one render. */
const RIG = (accentName) =>
  `Lighting rig: the key light is a soft glow from beneath the subject, a white-hot rim light traces the upper edges, and a thin ${accentName} emissive edge light runs along every bevel. Material: frosted ice-like glass with crisp chamfered bevels, faint internal scattering and fine surface grain. Lens: 85 mm, shallow depth of field, gentle bloom. The only colours are ${accentName}, white and black.`;

const FRAMES = {
  square:
    'Frame: square 1:1. One subject, centred, filling about 55 percent of the frame height, with a generous empty black margin on all four sides. The glow falls off smoothly and reaches pure black #000000 well before any edge, so every edge and every corner is pure black.',
  landscape:
    'Frame: landscape 3:2. One subject, centred, filling about 55 percent of the frame height, with a generous empty black margin on all four sides. The glow falls off smoothly and reaches pure black #000000 well before any edge, so every edge and every corner is pure black.',
  wide: 'Frame: wide 16:9. The composition is centred and symmetrical. The image falls off to pure black #000000 toward all four edges through a strong vignette, so every edge and every corner is pure black.',
};

const FORBID_VOID =
  'Strictly forbidden: any text, letters, numbers, symbols or logos; any floor, ground plane, tabletop, horizon, walls, mountains, sky, stars or planets; any reflection of a surface; any people or hands; any frame, border or watermark. The background is a perfectly flat, empty, pure black void.';

const FORBID_BASIC =
  'Strictly forbidden: any text, letters, numbers, symbols or logos; any people or hands; any frame, border or watermark; any bright or coloured background. Everything outside the subject is pure black #000000.';

/**
 * @typedef {object} Piece
 * @property {string} id           file stem and manifest key
 * @property {'gateways'|'tiers'|'play'|'sprites'|'social'} group
 * @property {'flux'|'cumulus'|'nimbus'|'stratus'} accent
 * @property {'square'|'landscape'|'wide'|'raw'} frame   which composition paragraph to append
 * @property {string} subject      what is in the picture
 * @property {boolean} [forbidFloor]  false when the subject itself needs a floor or horizon
 * @property {boolean} [rig]       false to leave out the shared lighting rig paragraph (sprites)
 * @property {string} alt          short, specific description for the manifest
 * @property {'screen'|'normal'} blend
 * @property {number} w            output width in px
 * @property {number} h            output height in px
 * @property {object} [post]       post-processing: feather, featherX, featherY (edge mask, fraction of the
 *                                 size, 0 = none), black (percent crushed), alpha, gray, centerBrightRow
 * @property {number} [maxKB]      per file budget (default 120)
 * @property {boolean} [ship]      false = keep out of the manifest (build input only)
 * @property {string[]} [notes]    what happened, in order; rendered into PROMPTS.md
 */

/** @type {Piece[]} */
export const PIECES = [
  // ---------------------------------------------------------------- gateways
  {
    id: 'gateway-cloud',
    group: 'gateways',
    accent: 'flux',
    frame: 'square',
    subject:
      'A tower of eight large rectangular glass shipping-container blocks (long boxes with about 2 to 1 proportions) stacked in a staggered brick pattern, seen in isometric three-quarter view and centred in the frame. The top two containers are lifted slightly and sliding sideways into place, trailing streaks of blue light. Each container is frosted ice-like glass with fine vertical ribbing lines like a shipping container, a bright blue emissive seam along its edges, white-hot corners and a faintly lit hexagonal core inside.',
    alt: 'A tower of frosted glass shipping containers, two sliding into place with streaks of blue light',
    notes: [
      'Take 1 was a single thin vertical column of seven cubes: plain and narrow in the frame.',
      'Take 2 was an isometric pyramid with two cubes drifting in: good, but left-heavy.',
      'Take 3 (shipped) is the shipping-container tower: more literal for a Docker cloud, distinct from the explorer cubes and the richest of the three. An alternate (centred cube pyramid with one descending cube) is kept in assets-src/raw/_alt.',
    ],
    blend: 'screen',
    w: 960,
    h: 960,
  },
  {
    id: 'gateway-edge',
    group: 'gateways',
    accent: 'flux',
    frame: 'square',
    subject:
      'A single square slab of glass silicon, a GPU die, seen from a high three-quarter angle and floating in the void. Its surface is etched with a precise hexagonal core in the middle and many fine glowing blue circuit traces that fan out to the edges in straight lines and 60 degree bends, ending in tiny bright nodes. Thick chamfered glass edge with a white-hot rim. No labels, no markings, no pins, no socket, no board underneath.',
    alt: 'A floating glass GPU die with a hexagonal core and glowing blue circuit traces',
    notes: [
      'First take shipped.',
    ],
    blend: 'screen',
    w: 800,
    h: 800,
  },
  {
    id: 'gateway-ai',
    group: 'gateways',
    accent: 'flux',
    frame: 'square',
    subject:
      'A faceted sphere, a neural orb, built from frosted glass triangular and hexagonal facets, hovering in the void. A white-hot core inside radiates blue light out through the facets. Thin luminous filaments connect small bright nodes on its surface like a neural network. A few loose glass shards drift around it. No face, no eye.',
    alt: 'A faceted glass orb with a white-hot core and a web of luminous filaments across its surface',
    notes: [
      'First take shipped.',
    ],
    blend: 'screen',
    w: 800,
    h: 800,
  },
  {
    id: 'gateway-games',
    group: 'gateways',
    accent: 'flux',
    frame: 'square',
    subject:
      'A game controller seen from above at a slight angle, constructed entirely from small hexagonal glass tiles arranged as a honeycomb. The tiles form the two grips, a directional pad made of a hex cluster, and four round-cornered hex buttons. A handful of loose tiles float just above it. Each tile has a bright blue edge glow. No cable, no logos, no symbols on the buttons.',
    alt: 'A game controller assembled from glowing hexagonal glass tiles, a few tiles floating loose',
    notes: [
      'First take shipped. Intentionally different from play-controller: a flat honeycomb of tiles, not a sculpted shell.',
    ],
    blend: 'screen',
    w: 800,
    h: 800,
  },
  {
    id: 'gateway-docs',
    group: 'gateways',
    accent: 'flux',
    frame: 'square',
    subject:
      'Five thin rectangular sheets of clear glass floating in a fanned cascade, tilted in perspective like pages. On each sheet are rows of luminous blue bars of different lengths and indentations that suggest lines of code (abstract bars of light only, no letters, no characters, no numbers), with one or two white-hot lines. Each sheet has one corner cut diagonally.',
    alt: 'Five floating glass pages in a fan, each etched with rows of glowing code-like lines',
    notes: [
      'First take shipped. The model drew code-like bars with no characters, as asked.',
    ],
    blend: 'screen',
    w: 800,
    h: 800,
  },
  {
    id: 'gateway-explorer',
    group: 'gateways',
    accent: 'flux',
    frame: 'square',
    subject:
      'A chain of seven glass cubes linked by thin glowing blue beams, receding diagonally from a large foreground block at lower left to the far distance at upper right, each block smaller and dimmer than the last. Strong depth of field: the nearest block is softly out of focus, the middle ones are sharp. Every block has a lit hexagonal core. A blockchain visualised as crystal.',
    alt: 'A chain of glass blocks linked by blue beams receding into the dark, the nearest softly out of focus',
    notes: [
      'First take shipped.',
    ],
    blend: 'screen',
    w: 800,
    h: 800,
  },
  {
    id: 'gateway-node',
    group: 'gateways',
    accent: 'flux',
    frame: 'square',
    subject:
      'A single thick hexagonal pillar of dark frosted glass, a node, standing upright and centred, about one third as wide as it is tall, with a flat white-hot hexagonal top face and blue light leaking from the seams of its facets. Three wide tilted concentric rings of blue light, like orbits, encircle it at different heights, far wider than the pillar. Small glass nodes sit on the rings like beads, and a few tiny cubes drift in the space between the rings. A soft blue glow pools at its base. Seen from a slightly elevated three-quarter angle.',
    alt: 'A hexagonal glass pillar encircled by three wide orbit rings carrying small glass nodes',
    notes: [
      'Take 1 was a plain pillar with three thin rings: correct but sparse, only about 14 percent of the frame width.',
      'Take 2 (shipped): a thicker pillar, wide tilted orbit rings with small glass nodes on them. An alternate (stepped hexagonal ziggurat with a beam) is kept in assets-src/raw/_alt.',
    ],
    blend: 'screen',
    w: 800,
    h: 800,
  },
  {
    id: 'gateway-site',
    group: 'gateways',
    accent: 'flux',
    frame: 'square',
    forbidFloor: false,
    subject:
      'The lattice horizon: a field of dark glass hexagonal tiles, each a raised hexagonal slab, receding to a distant horizon, with electric blue light seeping up between the tiles and a soft luminous haze along the horizon line. Low camera. The upper 45 percent of the frame is a pure black void. The lattice and the haze fade to pure black toward the left, right and bottom edges, so the glowing field floats as a soft band in the middle of the frame. No sky, no mountains, no sun.',
    alt: 'A field of dark glass hexagonal tiles lit blue from between, receding to a hazy horizon',
    notes: [
      'First take shipped. The one piece that is allowed a floor; the upper 45 percent of the frame is void and the lattice fades out sideways.',
    ],
    blend: 'screen',
    w: 800,
    h: 800,
  },
  {
    id: 'gateway-wallet',
    group: 'gateways',
    accent: 'flux',
    frame: 'square',
    subject:
      'A vault and a key. A thick hexagonal vault door of dark frosted glass with concentric rings of bright blue light and a glowing hexagonal keyhole at its centre, and in front of it, floating at an angle, a crystal key made of faceted clear glass whose bow, the head of the key, is a hexagon. No dials, no numbers, no text.',
    alt: 'A hexagonal glass vault door with glowing rings and a faceted crystal key floating in front of it',
    notes: [
      'First take shipped.',
    ],
    blend: 'screen',
    w: 800,
    h: 800,
  },

  // ------------------------------------------------------------------- tiers
  {
    id: 'tier-cumulus',
    group: 'tiers',
    accent: 'cumulus',
    frame: 'square',
    subject:
      'One small hexagonal crystal: a single hexagonal prism of clear faceted glass with a shallow pointed cap, about as tall as it is wide, floating alone. It glows from inside in vivid cyan (#36D3FF) with white-hot edges. Minimal, one object only.',
    alt: 'A single small hexagonal crystal glowing cyan from within',
    notes: [
      'First take shipped. Mean lit colour #5CBAD3, hue about 190 degrees against the tier colour at 193.',
    ],
    blend: 'screen',
    w: 640,
    h: 640,
  },
  {
    id: 'tier-nimbus',
    group: 'tiers',
    accent: 'nimbus',
    frame: 'square',
    subject:
      'A double-hex cluster: two true six-sided hexagonal prisms of faceted glass standing side by side and fused along one side face, the left one taller and wider, the right one shorter and smaller. Each prism has six rectangular side faces and a flat hexagonal top face with a clearly visible hexagon outline. Seen from a slightly elevated three-quarter angle so both hexagonal top faces can be seen. It glows from inside in luminous violet (#C77DFF) with white-hot edges. Not square boxes, not rectangular cuboids. One object only.',
    alt: 'Two fused hexagonal glass prisms, one larger than the other, glowing violet from within',
    notes: [
      'Take 1 came back as two square-section boxes: the words \'double-hex\' were read loosely.',
      'Take 2 (shipped) spells out true six-sided prisms with visible hexagonal top faces and forbids boxes and cuboids.',
    ],
    blend: 'screen',
    w: 640,
    h: 640,
  },
  {
    id: 'tier-stratus',
    group: 'tiers',
    accent: 'stratus',
    frame: 'square',
    subject:
      'A tall faceted tower: a slender spire made of stacked, stepped hexagonal tiers, each tier a hexagonal prism narrower than the one below, tapering to a faceted pointed top, floating upright. The glass body is tinted deep saturated golden amber (#FFC857) and glows from inside with rich warm amber light, with white-hot edges. Strongly saturated amber, not cream, not beige, not white. One object only, much taller than it is wide.',
    alt: 'A tall faceted hexagonal crystal tower glowing amber from within',
    notes: [
      'Take 1 was cream and beige (mean lit colour #C7A371), not amber.',
      'Take 2 (shipped) asks for deep saturated golden amber, not cream, beige or white, and the accent wording became \'saturated amber gold\'.',
    ],
    blend: 'screen',
    w: 640,
    h: 640,
  },

  // -------------------------------------------------------------------- play
  {
    id: 'play-tunnel',
    group: 'play',
    accent: 'flux',
    frame: 'wide',
    forbidFloor: false,
    subject:
      'A long hexagonal glass tunnel receding to a bright vanishing point, framed by thin chamfered glass ribs. Rows of thin rectangular glass game-cartridge tiles (slim slabs with a small notch at the top, like cartridges) are mounted along the walls and drift down the corridor edge-lit in blue, racing toward the viewer with streaks of white and blue light. One-point perspective, symmetrical. A faint cluster of hexagonal bokeh in the far glow. No screens, no logos, no text on the cartridges.',
    alt: 'A hexagonal glass tunnel lined with glowing game cartridge tiles racing toward the viewer',
    notes: [
      'First take shipped. The vignette was strengthened in post (10 percent edge feather) so the corners are exactly black.',
    ],
    blend: 'screen',
    w: 1600,
    h: 900,
    maxKB: 120,
    post: { feather: 0.1 },
  },
  {
    id: 'play-controller',
    group: 'play',
    accent: 'flux',
    frame: 'landscape',
    subject:
      'A chunky modern game controller floating at a three-quarter angle, sculpted from frosted glass, with hexagonal buttons and a hexagonal directional pad, glowing blue seams along the shell and a white-hot highlight along its top edge. A faint halo of drifting hexagonal glass dust around it. No logos, no symbols on the buttons, no cable.',
    alt: 'A frosted glass game controller with hexagonal buttons floating at a three-quarter angle',
    notes: [
      'First take shipped.',
    ],
    blend: 'screen',
    w: 960,
    h: 640,
  },

  // ----------------------------------------------------------------- sprites
  {
    id: 'sprite-bokeh',
    group: 'sprites',
    accent: 'flux',
    frame: 'raw',
    subject:
      'A single soft hexagonal bokeh highlight, like a camera lens aperture highlight: a perfectly regular hexagon with softly rounded corners, a flat even interior of pale blue-white light at about 70 percent brightness, a slightly brighter thin rim, and a softly blurred outer edge. Centred, about 60 percent of the frame width. No bright core, no hot spot, no gradient toward the centre, a flat even fill. Nothing else, no noise, no grain, on a flat pure black background.',
    alt: 'A soft hexagonal bokeh highlight',
    notes: [
      'Take 1 had a bright hot core: it read as a glow, not a bokeh highlight.',
      'Take 2 (shipped) asks for a flat even interior at about 70 percent with a brighter thin rim. Alpha is derived from luminance in post.',
    ],
    blend: 'screen',
    w: 256,
    h: 256,
    rig: false,
    post: { alpha: true },
  },
  {
    id: 'sprite-streak',
    group: 'sprites',
    accent: 'flux',
    frame: 'raw',
    subject:
      'A single anamorphic lens-flare streak and nothing else. One perfectly straight, razor-thin horizontal line of light runs across the entire width of the frame from the left edge to the right edge, exactly at the vertical centre. It is about 1 percent of the frame height thick, white-hot at the very centre, shifting to electric blue toward both ends and fading smoothly to black before it reaches the left and right edges, with a very faint soft glow around it. It is not a hexagon, there are no shapes, no dots, no other light, on a flat pure black background.',
    alt: 'A thin horizontal anamorphic light streak',
    notes: [
      'Take 1 came back byte-identical to the bokeh. Two concurrent runs finished together and the wrapper returned the same file; generate-art.mjs now detects duplicates by checksum, retries, and staggers the first wave.',
      'The style prefix also pulls toward hexagons, so take 2 (shipped) says \'it is not a hexagon\' and describes only a line.',
      'Post: crop an 8 to 1 band centred on the brightest row, fade both ends, derive alpha from luminance.',
    ],
    blend: 'screen',
    w: 512,
    h: 64,
    rig: false,
    post: { alpha: true, centerBrightRow: true, featherX: 0.3, featherY: 0.35 },
  },
  {
    id: 'sprite-dirt',
    group: 'sprites',
    accent: 'flux',
    frame: 'raw',
    subject:
      'A lens dirt texture: fine dust specks, smudges, tiny hairlines and a few soft fingerprint-like arcs, rendered as soft pale blue-white blooms of scattered light on a flat pure black background. Uneven distribution, denser toward the corners and sparse in the centre, high contrast. No objects, no pattern, no text.',
    alt: 'A lens dirt overlay of dust, smudges and fine scratches seen as soft blooms of light',
    notes: [
      'First take shipped. Grayscale, no edge mask: the dust runs to the edges on purpose, it is a post-processing texture for the stage.',
    ],
    blend: 'screen',
    w: 1024,
    h: 683,
    rig: false,
    post: { gray: true, feather: 0 },
  },

  // ------------------------------------------------------------------ social
  {
    id: 'og-backdrop',
    group: 'social',
    accent: 'flux',
    frame: 'raw',
    forbidFloor: false,
    subject:
      'A wide cinematic scene with the weight on the right half. A luminous lattice of dark glass hexagonal tiles lit from beneath in electric blue sweeps in from the right edge, and above it a loose cluster of four large floating frosted-glass hexagonal shards hovers right of centre with a white-hot rim light and volumetric haze. The left third of the frame is almost empty, deep black, calm, reserved for text. Everything fades to pure black toward the top, the bottom and the left. All important content sits within the central 60 percent band of the frame height.',
    alt: 'A glowing hexagonal glass lattice with floating glass shards, fading to black on the left',
    notes: [
      'First take shipped. Its four shards echo the four shards of the symbol without trying to be the symbol. Not shipped to the site: web/scripts/build-og.mjs composites the real lockup and real text over it.',
    ],
    blend: 'normal',
    w: 1200,
    h: 630,
    maxKB: 120,
    ship: false,
    post: { feather: 0 },
  },
];

/** The full text sent to the image model for a piece. */
export function buildPrompt(piece) {
  const accentName = ACCENTS[piece.accent] ?? ACCENTS.flux;
  const frame = FRAMES[piece.frame];
  const forbid = piece.forbidFloor === false ? FORBID_BASIC : FORBID_VOID;
  const parts = [`${STYLE_PREFIX.replace('{accent}', accentName)}.`, `Subject: ${piece.subject}`];
  if (piece.rig !== false) parts.push(RIG(accentName));
  if (frame) parts.push(frame);
  parts.push(forbid);
  return parts.join('\n\n');
}
