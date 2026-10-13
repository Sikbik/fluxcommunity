// All GLSL for the stage, as strings. Shared chunks first, then one vertex/fragment pair per pass.
// three prefixes ShaderMaterial sources (version, precision, position/normal/uv attributes, the matrix
// and cameraPosition uniforms, varying and texture2D aliases), so none of that is declared here.
//
// Colour is linear HDR everywhere. Either the post chain tone maps (uDirect = 0) or each material
// does it itself through `finish()` when the stage renders straight to the canvas (uDirect = 1).

import { ringTablesGlsl } from '../pulses';

export const GLSL_COMMON = /* glsl */ `
#define PI 3.14159265359
#define TAU 6.28318530718

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}
vec3 acesFilm(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
`;

/** Appended to every scene material: the straight-to-canvas path (tier 1) tone maps and dithers here. */
export const GLSL_FINISH = /* glsl */ `
uniform float uDirect;
uniform float uExposure;
uniform float uTime;
vec3 finish(vec3 c) {
  c = max(c, vec3(0.0));
  if (uDirect < 0.5) return c;
  c = toSrgb(acesFilm(c * uExposure));
  float n = hash21(gl_FragCoord.xy + fract(uTime * 0.37) * 71.0) + hash21(gl_FragCoord.xy * 1.37 + 19.0) - 1.0;
  return c + n * (1.0 / 255.0);
}
`;

// ---- the lattice -----------------------------------------------------------------------------------------

export const LATTICE_VERT = /* glsl */ `
${GLSL_COMMON}
${ringTablesGlsl()}

uniform float uWTime;
uniform vec2 uOrigin;
uniform float uLift;
uniform float uRelief;
uniform float uIgnite;
uniform vec3 uIgniteC;
uniform float uSink;
uniform float uChainPhase;
uniform float uChainAmp;
uniform vec4 uCursor;
uniform vec4 uSymbol;
uniform float uSymbolBoost;
uniform vec2 uViewport;
uniform int uRingCount;
uniform vec4 uRingA[14];
uniform vec4 uRingB[14];
uniform int uFocusCount;
uniform vec4 uFocusA[8];
uniform vec4 uFocusB[8];
uniform vec3 uTints[6];

attribute vec2 aCell;
attribute vec4 aMeta;

varying vec3 vWorld;
varying vec3 vNrm;
varying vec4 vMeta;   // kind, param, rnd, heat
varying vec4 vCell;   // lift, pool, ignite, rnd2
varying vec3 vTint;
varying vec2 vLocal;

void main() {
  vec2 g = aCell + uOrigin;
  vec2 c = vec2(1.7320508 * (g.x + 0.5 * g.y), 1.5 * g.y);
  float rnd = hash21(g);
  float rnd2 = hash21(g + 31.7);
  float rnd3 = hash21(g.yx - 12.3);

  float h = 0.0;
  float heat = 0.0;
  vec3 tint = vec3(0.0);

  // Idle: a slow swell across the field, and a few cells that rise and fall on their own clock.
  float swell = vnoise(c * 0.115 + vec2(uWTime * 0.05, -uWTime * 0.034));
  h += (swell - 0.45) * 0.3 + (rnd3 - 0.5) * 0.09;
  // Static relief: a skyline of cells that stand proud, mostly low with a few tall blocks, clustered in
  // loose patches so the field reads as cut stone rather than a flat grid.
  float cluster = vnoise(c * 0.16 + 7.0);
  float stone = pow(rnd3, 2.4) * (0.2 + 0.7 * cluster) * 0.7 + floor(rnd2 * 3.0) * 0.035 * cluster;
  h += stone * uRelief;
  float camD = length(c - cameraPosition.xz);
  float riser = smoothstep(0.968, 0.994, rnd) * smoothstep(7.0, 15.0, camD) * (1.0 - smoothstep(18.0, 48.0, camD));
  float rb = 0.5 + 0.5 * sin(uWTime * (0.11 + rnd2 * 0.16) + rnd3 * TAU);
  h += riser * rb * (0.14 + 0.2 * rnd2);
  heat += riser * rb * 0.16;

  // The chain breathing: a faint swell that travels outward from under the symbol.
  float ds = length(c - uSymbol.xz);
  if (uChainAmp > 0.0) h += uChainAmp * 0.06 * sin(ds * 0.4 - uChainPhase * TAU);

  // The symbol: a lit pool beneath it, raised a touch while it is hovered.
  float pool = exp(-(ds * ds) / (uSymbol.w * uSymbol.w));
  h += pool * uSymbolBoost * 0.26;
  heat += pool * uSymbolBoost * 0.35;

  // The cursor lifts cells like a hand over keys.
  {
    float d = length(c - uCursor.xy);
    float f = 1.0 - smoothstep(0.0, uCursor.w, d);
    f = f * f * (3.0 - 2.0 * f);
    float v = f * uCursor.z * (0.78 + 0.44 * rnd);
    h += v * 0.95 * uLift;
    heat += v * 0.85;
  }

  // Click, success and block rings, and the decorative beam landings.
  for (int i = 0; i < 14; i++) {
    if (i >= uRingCount) break;
    vec4 a = uRingA[i];
    vec4 b = uRingB[i];
    int k = int(b.x + 0.5);
    vec4 k0 = RING_K0[k];
    vec4 k1 = RING_K1[k];
    float age = a.z;
    float r = age * k0.x;
    float w = k0.y + k0.z * age;
    float x = length(c - a.xy) - r;
    float front = exp(-(x * x) / (w * w));
    float trail = x < 0.0 ? 0.32 * cos(x * 1.9 / (0.6 + w * 0.4)) * exp(x / (w * 2.6)) : 0.0;
    float env = (1.0 - exp(-age * 16.0)) * (1.0 - smoothstep(k1.x * 0.5, k1.x, age));
    float v = (front + trail) * env / (1.0 + 0.035 * r) * a.w;
    h += v * k0.w * uLift;
    float hv = max(v, 0.0) * k1.y;
    heat += hv;
    tint += uTints[int(b.y + 0.5)] * hv;
  }

  // Focus regions are viewport rectangles: cells that appear under a hovered card rise and glow.
  vec4 clip0 = projectionMatrix * viewMatrix * vec4(c.x, 0.0, c.y, 1.0);
  if (uFocusCount > 0 && clip0.w > 0.0) {
    vec2 px = (clip0.xy / clip0.w * 0.5 + 0.5) * uViewport;
    px.y = uViewport.y - px.y;
    for (int i = 0; i < 8; i++) {
      if (i >= uFocusCount) break;
      vec4 fa = uFocusA[i];
      vec4 fb = uFocusB[i];
      vec2 q = abs(px - fa.xy) - fa.zw;
      float dd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
      float f = (1.0 - smoothstep(0.0, fb.y, dd)) * fb.x;
      h += f * 0.3;
      heat += f * 0.95;
    }
  }

  // Intro: cells ignite from the centre outward, popping up white-hot as they arrive. The front travels
  // out to uIgniteC.z world units; at uIgnite = 1 every cell has long since been passed.
  float cd = length(c - uIgniteC.xy);
  float ig = clamp((uIgnite * uIgniteC.z - cd) / 7.0, 0.0, 1.0);
  float pop = ig * (1.0 - ig) * 4.0;
  h += pop * 0.34;
  heat += pop * 0.95;

  // Ambient: the field sinks into the void as the tunnel takes over.
  float sink = clamp(uSink * 1.5 - rnd * 0.5, 0.0, 1.0);
  h -= sink * 2.6;

  float scale = smoothstep(0.0, 0.25, ig) * (1.0 - smoothstep(0.55, 1.0, sink));
  vec3 lp = position;
  lp.xz *= scale;
  lp.y *= mix(0.15, 1.0, scale);
  vec3 wp = vec3(c.x + lp.x, h + lp.y, c.y + lp.z);

  vWorld = wp;
  vNrm = normal;
  vMeta = vec4(aMeta.x, aMeta.y, rnd, heat);
  vCell = vec4(h, pool, ig, rnd2);
  vTint = tint;
  vLocal = position.xz;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const LATTICE_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_FINISH}

uniform float uWTime;
uniform vec3 uAccent;
uniform vec3 uAccentHot;
uniform vec3 uAccentCore;
uniform vec3 uHaze;
uniform float uGlow;
uniform float uHazeAmt;
uniform float uFogScale;
uniform float uBeat;
uniform float uHexApothem;
uniform vec4 uSymbol;
uniform float uSymbolGlow;
uniform float uSymbolBoost;
uniform sampler2D tDist;
uniform vec3 uSymRight;     // world axes of the symbol plane, scaled to one mark unit
uniform vec3 uSymUp;
uniform vec3 uSymFwd;       // plane normal, toward the camera
uniform vec2 uSymExtent;

varying vec3 vWorld;
varying vec3 vNrm;
varying vec4 vMeta;
varying vec4 vCell;
varying vec3 vTint;
varying vec2 vLocal;

// A blurred mirror image of the symbol: the reflected ray is intersected with the symbol's plane and the
// baked distance texture says whether it landed on a shard (and how deep inside it, for a brighter rim).
float symbolMirror(vec3 P, vec3 R) {
  float dn = dot(R, uSymFwd);
  if (dn > -0.02) return 0.0;
  float t = dot(uSymbol.xyz - P, uSymFwd) / dn;
  if (t <= 0.0) return 0.0;
  vec3 H = P + R * t - uSymbol.xyz;
  vec2 m = vec2(dot(H, uSymRight), dot(H, uSymUp)) / max(dot(uSymRight, uSymRight), 1e-4);
  float acc = 0.0;
  for (int i = 0; i < 4; i++) {
    float o = float(i) * 0.012;
    vec2 q = (m + vec2(0.0, -o)) / (2.0 * uSymExtent) + 0.5;
    if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) continue;
    vec4 d = texture2D(tDist, q);
    float inside = max(max(d.r, d.g), max(d.b, d.a));
    acc += smoothstep(0.0, 0.25, inside) * (1.0 - float(i) * 0.2);
  }
  return acc * 0.25;
}

// Pointy-top hexagon distance: 0 at the centre, 1 on the edge of a hexagon with the given apothem.
float hexD(vec2 p, float apothem) {
  p = abs(p);
  float d = max(p.x, max(0.5 * p.x + 0.8660254 * p.y, -0.5 * p.x + 0.8660254 * p.y));
  return d / apothem;
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec3 N = normalize(vNrm);
  float kind = vMeta.x;
  float rnd = vMeta.z;
  float heat = vMeta.w;
  float rnd2 = vCell.w;
  float pool = vCell.y;
  float ig = vCell.z;
  float pop = ig * (1.0 - ig) * 4.0;

  float fogK = dist / uFogScale;
  float fog = 1.0 - exp(-fogK * fogK);
  // Level of detail from the pixel footprint on the field: once a gap is thinner than a pixel or two it
  // cannot be drawn without shimmering, so edges give way to their average glow instead.
  vec2 dw = fwidth(vWorld.xz);
  float lod = 1.0 - smoothstep(0.035, 0.17, dw.x + dw.y);

  vec3 fogCol = uHaze * (0.72 * uHazeAmt);
  float poolK = pool * uSymbolGlow;
  // Light leaks unevenly: some gaps burn bright, others are nearly dark, in loose drifting patches.
  float pn = vnoise(vWorld.xz * 0.07 + vec2(uWTime * 0.01, 0.0)) * 0.6 + vnoise(vWorld.xz * 0.23 - vec2(0.0, uWTime * 0.018)) * 0.4;
  float seamK = 0.24 + 1.3 * smoothstep(0.28, 0.72, pn);
  float tw = pow(0.5 + 0.5 * sin(uWTime * (0.45 + rnd * 1.25) + rnd2 * 40.0), 18.0) * step(0.58, rnd2);

  vec3 col = vec3(0.0);
  // What a distant cell averages to: dark glass, a breath of the glow from its gaps, the haze it mirrors.
  float grazing = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
  vec3 farCol = uAccent * (0.04 * (0.5 + seamK) + 0.05 * heat + 0.1 * poolK) + uHaze * (0.8 * grazing + 0.03);

  if (kind < 0.5) {
    // Top face: dark glass. A faint tilt per cell so every tile catches the light a little differently.
    vec3 Nt = normalize(vec3((rnd - 0.5) * 0.11, 1.0, (rnd2 - 0.5) * 0.11));
    float ndv = clamp(dot(Nt, V), 0.0, 1.0);
    // Facet wobble: a slow variation of the normal inside the tile, used to break up the symbol's glare.
    vec2 fq = vWorld.xz * 6.5 + rnd * 40.0;
    float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
    float scuff = 0.45 + 1.1 * vnoise(vWorld.xz * 2.1 + rnd * 9.0);
    vec3 R = reflect(-V, Nt);
    float up = max(R.y, 0.0);
    vec3 env = uHaze * (1.3 * exp(-up * 6.5) + 0.05);
    vec3 toSym = normalize(uSymbol.xyz - vWorld);
    // The glare of the symbol on rough stone: the facets scatter it, so it breaks up instead of
    // lighting a whole tile evenly.
    vec3 Ns = normalize(Nt + vec3(vnoise(fq * 0.3) - 0.5, 0.0, vnoise(fq * 0.3 + 17.3) - 0.5) * 0.12);
    float sl = pow(max(dot(reflect(-V, Ns), toSym), 0.0), 16.0);
    env += mix(uAccent, uAccentHot, 0.7) * sl * 1.3 * uSymbolGlow;
    float mir = symbolMirror(vWorld, R) * lod;
    env += mix(uAccent, vec3(0.42, 0.62, 1.0), 0.6) * mir * 0.3 * uSymbolGlow;
    col = env * fres * mix(1.0, scuff, lod) * 1.1;
    col += uAccent * 0.003;
    float hd = hexD(vLocal, uHexApothem);
    float rim = smoothstep(0.55, 1.0, hd);
    vec3 glass = mix(uAccent, uAccentHot, clamp(heat, 0.0, 1.0));
    col += (glass * (0.03 * seamK + 0.5 * heat + 0.2 * poolK + 0.12 * uBeat) + vTint * 1.1) * rim * lod;
    col += (uAccentHot * 0.1 + vTint * 0.08) * heat * (1.0 - rim);
    col += uAccentCore * pop * 0.35;
    col = mix(farCol, col, lod);
  } else if (kind < 1.5) {
    // Bevel: the cut edge that catches the light from below.
    float facing = pow(clamp(dot(N, V), 0.0, 1.0), 0.7);
    vec3 base = mix(uAccent, uAccentHot, clamp(0.3 + 0.7 * heat, 0.0, 1.0));
    float e = 0.3 * seamK + 1.0 * heat + 0.8 * poolK + 0.28 * uBeat;
    col = base * e * (0.5 + 0.5 * facing) * (0.7 + 0.3 * rnd);
    col += (uAccentCore * heat * heat * 0.5 + vTint * 1.1) * (0.4 + facing);
    col += uAccentHot * tw * 0.9;
    col += uAccentCore * pop * 0.9;
    col = mix(farCol, col, lod);
  } else {
    // Wall: light leaking up through the gaps, brightest where the cell meets the field.
    float y = vWorld.y;
    float gl = exp(-max(y, 0.0) * 11.0);   // a tight foot glow where the block meets the floor
    float gw = exp(-max(y, 0.0) * 3.0);    // and a faint broad wash up its side
    vec3 base = mix(uAccent, uAccentHot, clamp(0.3 + 0.7 * gl, 0.0, 1.0));
    float e = 0.03 + gl * (1.15 * seamK + 1.2 * poolK + 0.9 * heat + 0.22 * uBeat) + gw * (0.1 * seamK + 0.28 * poolK + 0.3 * heat);
    col = base * e * (0.6 + 0.4 * (0.5 + rnd));
    col += (uAccentCore * heat * gl * 0.3 + vTint * gl) * 0.8;
    col += uAccentHot * tw * 0.6 * gl;
    col += uAccentCore * pop * 0.9 * gl;
    col = mix(farCol, col, lod);
  }

  col *= uGlow;
  col = mix(col, fogCol, fog);
  gl_FragColor = vec4(finish(col), 1.0);
}
`;

// ---- the sky, haze and the ambient tunnel ------------------------------------------------------------

export const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const SKY_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_FINISH}

uniform float uWTime;
uniform vec3 uAccent;
uniform vec3 uAccentHot;
uniform vec3 uAccentCore;
uniform vec3 uHaze;
uniform float uHazeAmt;
uniform vec3 uFwd;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec2 uTan;
uniform vec2 uSymNdc;
uniform float uSymR;
uniform float uSymbolGlow;
uniform float uAmbient;
uniform float uTravel;
uniform float uTunnelTime;
uniform vec4 uWave[4];
uniform vec2 uSway;
uniform vec3 uBrand;

varying vec2 vUv;

// ---- ambient: a hexagonal glass corridor with racing light --------------------------------------------
const float TUN_A = 3.2;              // apothem
const float TUN_HALF = 1.8475209;     // half face width = A / sqrt(3)
const float TUN_PERIOD = 64.0;

vec2 hexCell(vec2 p, out vec2 id) {
  const vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  id = p - gv;
  return gv;
}

vec3 tunnel(vec3 rd) {
  vec2 ro = uSway;
  float tmin = 1e9;
  int face = 0;
  vec2 fn = vec2(0.0, 1.0);
  for (int k = 0; k < 6; k++) {
    float a = 1.5707963 + float(k) * 1.0471976;
    vec2 n = vec2(cos(a), sin(a));
    float dn = dot(rd.xy, n);
    if (dn > 1e-4) {
      float t = (TUN_A - dot(ro, n)) / dn;
      if (t < tmin) { tmin = t; face = k; fn = n; }
    }
  }
  vec3 P = vec3(ro, 0.0) + rd * tmin;
  vec2 tang = vec2(-fn.y, fn.x);
  float u = dot(P.xy, tang);
  float zw = -P.z + uTravel;           // distance along the corridor in world terms
  float fk = float(face);

  float fres = 0.05 + 0.95 * pow(1.0 - clamp(abs(dot(rd, vec3(fn, 0.0))), 0.0, 1.0), 3.0);

  // Panels: dark glass with a mottled sheen and a quiet hex pattern of seams.
  vec2 cid;
  vec2 gv = hexCell(vec2(u * 1.15, zw * 0.42), cid);
  vec2 q = abs(gv);
  float hd = max(q.x, q.x * 0.5 + q.y * 0.8660254);
  float seam = 1.0 - smoothstep(0.0, 0.045, 0.5 - hd);
  float cellRnd = hash21(cid + fk * 17.0);
  float twink = pow(0.5 + 0.5 * sin(uTunnelTime * (0.4 + cellRnd) + cellRnd * 30.0), 14.0);
  float mottle = fbm(vec2(u * 1.7 + fk * 3.0, zw * 0.28));
  mottle = mottle * mottle * 2.2;
  float slide = fbm(vec2(u * 0.7 + fk * 5.0, zw * 0.09 - uTunnelTime * 0.6));
  slide = smoothstep(0.42, 0.8, slide);

  // Ribs: the frames that march down the corridor, brighter at the corners.
  float ribSpacing = 3.4;
  float rz = abs(fract(zw / ribSpacing + 0.5) - 0.5) * ribSpacing;
  float rib = (1.0 - smoothstep(0.0, 0.11, rz)) * (1.0 - smoothstep(40.0, 110.0, tmin));
  float cornerD = TUN_HALF - abs(u);
  float cornerLine = 1.0 - smoothstep(0.0, 0.07, cornerD);
  float ribNode = rib * (1.0 - smoothstep(0.0, 0.45, cornerD));

  // Racing light: thin streaks that come down each face toward the camera.
  float streaks = 0.0;
  vec3 streakCol = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float hs = hash21(vec2(fk * 11.0 + fi, 3.7 + fi * 1.3));
    float hu = hash21(vec2(fk * 7.0 + fi * 2.0, 9.1));
    float hz = hash21(vec2(fk * 5.0 + fi, 21.3));
    float lane = (hu - 0.5) * 2.0 * (TUN_HALF * 0.8);
    float speed = 10.0 + hs * 18.0;
    float zs = mod(hz * TUN_PERIOD + uTunnelTime * speed, TUN_PERIOD);
    float dz = abs(mod(zw - zs + TUN_PERIOD * 0.5, TUN_PERIOD) - TUN_PERIOD * 0.5);
    float len = 0.7 + hs * 2.2;
    float along = exp(-(dz * dz) / (len * len));
    float across = exp(-pow((u - lane) / (0.014 + 0.02 * hs), 2.0));
    float s = along * across * (0.5 + 0.9 * hs) * smoothstep(1.5, 12.0, tmin);
    streaks += s;
    streakCol += mix(uAccentHot, vec3(1.0), step(0.5, hs)) * s;
  }

  // Block waves: a bright band running down the corridor from the camera.
  float wave = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 w = uWave[i].xy; // x: distance of the front from the camera, y: strength
    float dd = (-P.z) - w.x;
    wave += w.y * exp(-(dd * dd) / 5.5);
  }

  // The floor (face 3) mirrors the far light and the streaks as a long soft line under the vanishing point.
  float isFloor = step(2.5, fk) * step(fk, 3.5);
  float floorLine = isFloor * exp(-(u * u) / 0.16) * (1.0 - exp(-tmin * 0.09));
  vec3 col = vec3(0.0);
  col += uAccent * 0.008 * (0.5 + cellRnd);
  col += (uHaze * 0.5 + uAccent * 0.14) * fres * mottle * 0.62;
  col += mix(uAccent, uAccentHot, 0.5) * slide * fres * 0.45;
  col += mix(uAccentHot, uAccentCore, 0.5) * floorLine * 0.3;
  col += streakCol * isFloor * 0.8;
  col += uAccentHot * seam * (0.04 + 0.5 * twink) * (0.5 + 0.5 * cellRnd);
  col += (uAccentHot * 0.7 + uAccentCore * 0.7) * rib * 0.5 * (0.4 + 0.6 * (1.0 - smoothstep(0.0, 1.1, cornerD)));
  col += uAccentCore * ribNode * 1.6;
  col += mix(uAccent, uAccentHot, 0.6) * cornerLine * 0.75;
  col += streakCol * 3.0;
  col += (uAccentHot * 0.6 + uAccentCore * 0.8) * wave * (0.25 + 1.4 * (rib + cornerLine * 0.6) + 0.3 * seam);

  // Depth: dark near the lens, a hot core at the vanishing point.
  float fogT = 1.0 - exp(-tmin * 0.032);
  vec3 core = mix(uAccentHot, uAccentCore, 0.6) * 1.4;
  col = mix(col, core, pow(fogT, 4.2));
  return col;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uFwd + uRight * (ndc.x * uTan.x) + uUp * (ndc.y * uTan.y));
  float h = rd.y;

  // Horizon haze. At and below the horizon the colour is exactly the lattice's fog colour, so the field
  // dissolves into it without a seam; above it a tight band of drifting mist falls away quickly.
  float above = max(h, 0.0);
  float band = exp(-above * 20.0);
  float az = atan(rd.x, -rd.z);
  float n = fbm(vec2(az * 3.4 + uWTime * 0.012, above * 13.0 - uWTime * 0.01));
  float wisps = fbm(vec2(az * 9.0 - uWTime * 0.02, above * 30.0 + 3.0));
  float lift = smoothstep(0.0, 0.05, above);
  float mist = band * (1.0 + 1.25 * (n - 0.45) * lift + 1.1 * (wisps - 0.45) * lift);
  vec3 col = uHaze * uHazeAmt * (0.72 * max(mist, 0.0) + 0.02 * exp(-above * 9.0));

  // The symbol's own light: a wide soft glow and a tighter core, centred behind it.
  vec2 dq = (ndc - uSymNdc) * vec2(uTan.x / uTan.y, 1.0);
  float r2 = dot(dq, dq);
  col += uBrand * exp(-r2 / (uSymR * uSymR * 0.6)) * 0.08 * uSymbolGlow;
  col += uBrand * 1.6 * exp(-r2 / (uSymR * uSymR * 0.1)) * 0.045 * uSymbolGlow;

  if (uAmbient > 0.001) {
    vec3 tcol = tunnel(rd);
    col = mix(col, tcol, uAmbient);
  }
  gl_FragColor = vec4(finish(col), 1.0);
}
`;

// ---- the symbol --------------------------------------------------------------------------------------

export const SYMBOL_VERT = /* glsl */ `
varying vec3 vNv;
varying vec3 vNo;
varying vec3 vPo;
varying vec3 vPv;
void main() {
  vNo = normal;
  vPo = position;
  vNv = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPv = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export const SYMBOL_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_FINISH}

uniform sampler2D tDist;
uniform float uChannel;
uniform vec2 uExtent;       // texture half extent in mark units
uniform float uRange;       // distance that maps to 1.0
uniform float uHalfDepth;   // half the straight wall height, mark units
uniform float uBevel;       // chamfer width, mark units
uniform float uLite;        // 1 on the lowest tier: no mosaic, no grain
uniform vec3 uEdge;         // the Flux blue rim
uniform float uBright;      // presence
uniform float uHover;
uniform float uPress;
uniform float uFlash;
uniform float uWTime;
uniform float uSeed;
uniform float uDissolve;    // 0 solid .. 1 gone (intro assembly)
uniform vec3 uKeyDir;       // key light in view space
uniform float uBeat;

varying vec3 vNv;
varying vec3 vNo;
varying vec3 vPo;
varying vec3 vPv;

float chan(vec4 t) {
  return uChannel < 0.5 ? t.r : (uChannel < 1.5 ? t.g : (uChannel < 2.5 ? t.b : t.a));
}

void main() {
  vec3 Nv = normalize(vNv);
  vec3 No = normalize(vNo);
  vec3 V = normalize(-vPv);
  float faceness = abs(No.z);
  float wFace = smoothstep(0.88, 0.99, faceness);
  float wSide = 1.0 - smoothstep(0.12, 0.42, faceness);
  float wBevel = max(0.0, 1.0 - wFace - wSide);

  // Nearness to the outline: 1 at the rim, 0 once 'uRange' inside. Drives the edge lit gradient.
  vec2 suv = vPo.xy / (2.0 * uExtent) + 0.5;
  float d = chan(texture2D(tDist, suv));
  float rimK = 1.0 - clamp(d, 0.0, 1.0);
  float rimG = rimK * rimK * rimK;

  // Hand-cut ice: the face is a mosaic of broad facets, each tilted a little differently, divided by hair
  // thin cracks, with a fine hammered grain on top. Nearest and second nearest feature point per pixel.
  vec2 q = vPo.xy * 7.5 + uSeed * 11.0;
  vec2 ip = floor(q);
  vec2 fq = q - ip;
  float f1 = 9.0;
  float f2 = 9.0;
  vec2 fid = ip;
  if (uLite < 0.5) {
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = 0.08 + 0.84 * hash22(ip + g + uSeed * 3.1);
        vec2 r = g + o - fq;
        float dd = dot(r, r);
        if (dd < f1) { f2 = f1; f1 = dd; fid = ip + g; }
        else if (dd < f2) { f2 = dd; }
      }
    }
  } else {
    f1 = 0.0;
    f2 = 1.0;
    fid = vec2(0.0);
  }
  float edgeD = sqrt(f2) - sqrt(f1);
  float crack = 1.0 - smoothstep(0.0, 0.055, edgeD);
  vec2 tilt = (hash22(fid + 3.7 + uSeed) - 0.5) * 0.26;
  float rough = hash21(fid + 9.1);

  // Sandblasted grain: two rotated octaves so no lattice shows, differenced for a micro normal.
  vec2 micro = vec2(0.0);
  float cloud;
  if (uLite < 0.5) {
    vec2 bp = mat2(0.8, -0.6, 0.6, 0.8) * vPo.xy * 85.0 + uSeed * 9.0;
    vec2 bq = mat2(0.6, 0.8, -0.8, 0.6) * vPo.xy * 190.0 + uSeed * 4.0;
    float b0 = vnoise(bp) * 0.65 + vnoise(bq) * 0.35;
    float bx = vnoise(bp + vec2(0.6, 0.0)) * 0.65 + vnoise(bq + vec2(0.6, 0.0)) * 0.35;
    float by = vnoise(bp + vec2(0.0, 0.6)) * 0.65 + vnoise(bq + vec2(0.0, 0.6)) * 0.35;
    micro = vec2(b0 - bx, b0 - by);
    cloud = fbm(vPo.xy * 11.0 + uSeed * 13.0);
  } else {
    cloud = 0.45 + 0.16 * sin(vPo.x * 11.0 + uSeed * 7.0) * sin(vPo.y * 9.0 - uSeed * 5.0 + vPo.x * 3.0);
  }
  Nv = normalize(Nv + vec3(tilt + micro * 0.36, 0.0) * wFace);

  vec3 L = normalize(uKeyDir);
  float key = clamp(dot(Nv, L), 0.0, 1.0);
  float fresnel = pow(1.0 - clamp(dot(Nv, V), 0.0, 1.0), 3.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(Nv, H), 0.0), 90.0);
  float gloss = pow(max(dot(Nv, H), 0.0), 9.0);

  // The light falls from the upper left across the whole mark: bright and white there, a deeper blue
  // toward the lower right where it takes the colour of the field below.
  float lg = clamp(dot(vPo.xy, vec2(-0.58, 0.81)) * 1.5 + 0.5, 0.0, 1.0);
  float lit = smoothstep(0.38, 0.98, key);
  vec3 ice = mix(vec3(0.26, 0.42, 0.82), vec3(0.9, 0.95, 1.0), lit);
  ice = mix(ice * vec3(0.8, 0.9, 1.1), ice, lg);
  float body = 0.24 + 0.58 * lg + 0.34 * (cloud - 0.45);
  vec3 face = ice * body * (0.86 + 0.28 * hash21(fid + 5.3));
  face *= 1.0 - 0.4 * crack;
  face += vec3(0.82, 0.9, 1.0) * crack * lit * 0.16;
  face += uEdge * (0.62 * rimG + 0.1 * fresnel);
  face += vec3(0.9, 0.95, 1.0) * rimG * 0.2;
  face += vec3(1.0) * spec * (0.35 + 0.9 * rough);
  face += vec3(0.65, 0.8, 1.0) * gloss * 0.16;
  face += vec3(0.55, 0.7, 1.0) * 0.05 * (0.5 + 0.5 * sin(uWTime * 0.6 + cloud * 7.0));
  // The lit field below throws a blue wash up the lower part of the mark.
  face += uEdge * 0.42 * smoothstep(0.1, -0.5, vPo.y);

  // Chamfers burn Flux blue with a white-hot line where they catch the key light.
  float bspec = pow(max(dot(reflect(-L, Nv), V), 0.0), 22.0);
  // Hot at the silhouette (where the bloom picks it up), a vivid Flux blue ramp toward the face.
  float bt = clamp((vPo.z - uHalfDepth) / uBevel, 0.0, 1.0);
  float hot = 1.0 - smoothstep(0.0, 0.6, bt);
  vec3 bevel = uEdge * (1.05 + 0.5 * key + 0.8 * uHover + 0.6 * uBeat) * mix(0.8, 1.0, bt)
    + uEdge * hot * (2.4 + 1.2 * uHover + 0.8 * uBeat)
    + vec3(1.0) * (0.06 + 1.4 * bspec) * (0.4 + 0.6 * key) * (0.3 + 0.7 * hot);

  // The straight walls are the glass seen edge on: bright where they meet the front chamfer, falling to a
  // deep blue at the back, with a little of the key light skating along them.
  float zt = clamp((vPo.z + uHalfDepth) / (2.0 * uHalfDepth), 0.0, 1.0);
  float wallGrad = zt * zt;
  vec3 wall = uEdge * (0.2 + 1.1 * wallGrad + 0.45 * key + 0.35 * uHover) + vec3(0.015, 0.04, 0.11);
  wall += vec3(0.75, 0.88, 1.0) * pow(zt, 8.0) * 0.45 * (0.4 + key);

  vec3 col = face * wFace + bevel * wBevel + wall * wSide;
  col /= max(wFace + wBevel + wSide, 1e-3);

  col *= uBright * (1.0 - uPress * 0.1);
  col += vec3(0.7, 0.82, 1.0) * uFlash * 1.5;

  // Assembly: the shards resolve out of light.
  float dn = vnoise(vPo.xy * 38.0 + uSeed * 7.0);
  float keep = step(uDissolve, dn * 0.9 + 0.05);
  if (uDissolve > 0.001 && keep < 0.5) discard;

  gl_FragColor = vec4(finish(col), 1.0);
}
`;

// ---- dust -----------------------------------------------------------------------------------------------

export const DUST_VERT = /* glsl */ `
${GLSL_COMMON}
uniform float uWTime;
uniform vec3 uBox;          // size of the wrap box
uniform vec3 uCamera;
uniform vec3 uDrift;        // world drift per second
uniform vec2 uPointer;      // lattice plane pointer hit (x, z) for a little flow
uniform float uPointerK;
uniform float uSize;
uniform float uDpr;
uniform float uFade;

attribute vec4 aDust;       // xyz in 0..1 box, w = seed

varying vec4 vDust;         // brightness, hue mix, hex rotation seed, alpha mul

void main() {
  vec3 p = aDust.xyz * uBox;
  float s = aDust.w;
  // Slow upward drift with a per particle sway, wrapped around the camera so the field is endless.
  p += uDrift * uWTime * (0.6 + 0.8 * hash11(s * 91.7));
  p.x += sin(uWTime * 0.21 + s * 40.0) * 0.6;
  p.z += cos(uWTime * 0.17 + s * 23.0) * 0.5;
  vec3 center = uCamera + vec3(0.0, 0.0, -uBox.z * 0.4);
  vec3 w = mod(p - center + uBox * 0.5, uBox) - uBox * 0.5 + center;
  w.y = mod(p.y, uBox.y);
  float low = exp(-w.y * 0.33);
  // A little pointer flow near the lattice plane.
  vec2 dp = w.xz - uPointer;
  float f = exp(-dot(dp, dp) / 9.0) * uPointerK;
  w.xz += normalize(dp + 1e-3) * f * 0.8;
  w.y += f * 0.5;

  vec4 mv = viewMatrix * vec4(w, 1.0);
  float depth = -mv.z;
  float nearFade = smoothstep(0.6, 3.0, depth);
  float farFade = 1.0 - smoothstep(26.0, uBox.z * 0.62, depth);
  float flick = 0.65 + 0.35 * sin(uWTime * (0.4 + hash11(s * 7.3) * 1.2) + s * 50.0);
  float bri = (0.35 + 0.65 * hash11(s * 13.1)) * flick;
  vDust = vec4(bri * nearFade * farFade * uFade * (0.25 + 0.75 * low), hash11(s * 5.5), s, 1.0);
  float size = uSize * (0.5 + 1.1 * hash11(s * 3.3));
  gl_PointSize = clamp(size * uDpr * 60.0 / max(depth, 0.5), 1.0, 70.0 * uDpr);
  gl_Position = projectionMatrix * mv;
}
`;

export const DUST_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_FINISH}
uniform vec3 uAccent;
uniform vec3 uAccentHot;
uniform vec3 uAccentCore;
varying vec4 vDust;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  // A rounded hexagon: soft disc with a brighter rim, like a bokeh blade shape.
  vec2 q = abs(p);
  float hx = max(q.x * 0.8660254 + q.y * 0.5, q.y);
  float body = 1.0 - smoothstep(0.55, 1.0, hx);
  float rimK = smoothstep(0.62, 0.9, hx) * (1.0 - smoothstep(0.9, 1.02, hx));
  float a = body * 0.45 + rimK * 0.55;
  if (a < 0.003) discard;
  vec3 c = mix(uAccentHot, uAccentCore, step(0.82, vDust.y) * 0.8 + 0.1);
  c = mix(uAccent * 1.4, c, 0.6 + 0.4 * vDust.y);
  gl_FragColor = vec4(finish(c * a * vDust.x * 0.9), 1.0);
}
`;

// ---- payout beams ------------------------------------------------------------------------------------

export const BEAM_VERT = /* glsl */ `
${GLSL_COMMON}
uniform vec4 uBeamA[6];     // start xyz, progress 0..1 (negative: inactive)
uniform vec4 uBeamB[6];     // end xyz, arc height
uniform vec4 uBeamC[6];     // colour rgb, fade
uniform float uDpr;

attribute vec2 aBeam;       // x: beam index, y: trail position 0 (head) .. 1 (tail)

varying vec4 vColor;

void main() {
  int i = int(aBeam.x + 0.5);
  vec4 A = uBeamA[i];
  vec4 B = uBeamB[i];
  vec4 C = uBeamC[i];
  float t = A.w - aBeam.y * 0.17;
  float live = step(0.0, A.w) * step(0.0, t);
  float e = clamp(t, 0.0, 1.0);
  e = e * e * (3.0 - 2.0 * e);
  vec3 p = mix(A.xyz, B.xyz, e);
  p.y += sin(e * PI) * B.w;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float depth = max(-mv.z, 0.5);
  float head = 1.0 - aBeam.y;
  float size = mix(0.12, 0.46, head * head * head);
  gl_PointSize = clamp(size * uDpr * 900.0 / depth, 2.0, 80.0 * uDpr);
  float fadeOut = 1.0 - smoothstep(1.0, 1.28, A.w);
  vColor = vec4(C.rgb, live * (0.12 + 0.88 * head * head) * C.w * fadeOut);
  gl_Position = projectionMatrix * mv;
}
`;

export const BEAM_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_FINISH}
varying vec4 vColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  float core = exp(-r * r * 9.0);
  float halo = exp(-r * r * 2.6) * 0.45;
  float a = (core + halo) * vColor.a;
  if (a < 0.004) discard;
  vec3 c = mix(vColor.rgb, vec3(1.0), core * 0.7);
  gl_FragColor = vec4(finish(c * a * 3.2), 1.0);
}
`;

// ---- post -------------------------------------------------------------------------------------------------

export const BRIGHT_DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;     // texel of the source
uniform float uSpread;   // tap spacing in source texels
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;

vec3 tap(vec2 o) {
  vec3 c = texture2D(tSrc, vUv + o * uTexel * uSpread).rgb;
  return (any(isnan(c)) || any(isinf(c))) ? vec3(0.0) : min(c, vec3(48.0));
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 prefilter(vec3 c) {
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  return c * contrib;
}
void main() {
  // Four groups of four taps (a 2x2 box each) around the centre, Karis weighted so one hot pixel
  // cannot flicker the whole bloom.
  vec3 g0 = prefilter((tap(vec2(-1.0, 1.0)) + tap(vec2(0.0, 1.0)) + tap(vec2(-1.0, 0.0)) + tap(vec2(0.0, 0.0))) * 0.25);
  vec3 g1 = prefilter((tap(vec2(0.0, 1.0)) + tap(vec2(1.0, 1.0)) + tap(vec2(0.0, 0.0)) + tap(vec2(1.0, 0.0))) * 0.25);
  vec3 g2 = prefilter((tap(vec2(-1.0, 0.0)) + tap(vec2(0.0, 0.0)) + tap(vec2(-1.0, -1.0)) + tap(vec2(0.0, -1.0))) * 0.25);
  vec3 g3 = prefilter((tap(vec2(0.0, 0.0)) + tap(vec2(1.0, 0.0)) + tap(vec2(0.0, -1.0)) + tap(vec2(1.0, -1.0))) * 0.25);
  float w0 = 1.0 / (1.0 + luma(g0));
  float w1 = 1.0 / (1.0 + luma(g1));
  float w2 = 1.0 / (1.0 + luma(g2));
  float w3 = 1.0 / (1.0 + luma(g3));
  vec3 c = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3) / (w0 + w1 + w2 + w3);
  gl_FragColor = vec4(c, 1.0);
}
`;

// Dual Kawase: five taps down, eight up. Cheap and smooth.
export const KAWASE_DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 hp = uTexel * 0.5;
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
  s += texture2D(tSrc, vUv - hp).rgb;
  s += texture2D(tSrc, vUv + hp).rgb;
  s += texture2D(tSrc, vUv + vec2(hp.x, -hp.y)).rgb;
  s += texture2D(tSrc, vUv - vec2(hp.x, -hp.y)).rgb;
  gl_FragColor = vec4(s * 0.125, 1.0);
}
`;

export const KAWASE_UP_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;     // texel of the (smaller) source
uniform float uWeight;
varying vec2 vUv;
void main() {
  vec2 hp = uTexel * 0.5;
  vec3 s = texture2D(tSrc, vUv + vec2(-hp.x * 2.0, 0.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(-hp.x, hp.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(0.0, hp.y * 2.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(hp.x, hp.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(hp.x * 2.0, 0.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(hp.x, -hp.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(0.0, -hp.y * 2.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(-hp.x, -hp.y)).rgb * 2.0;
  gl_FragColor = vec4(s * (uWeight / 12.0), 1.0);
}
`;

export const COMPOSITE_FRAG = /* glsl */ `
${GLSL_COMMON}
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 uRes;
uniform float uTime;
uniform float uExposure;
uniform float uBloom;
uniform float uChroma;
uniform float uGrain;
uniform float uVignette;
uniform float uFlash;
uniform vec2 uFlashC;
uniform float uFade;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  c.x *= uRes.x / uRes.y;
  float r2 = dot(c, c);
  // Chromatic aberration: nothing at the centre, growing with the square of the distance.
  vec2 off = (uv - 0.5) * r2 * uChroma;
  vec3 col;
  col.r = texture2D(tScene, uv + off).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - off).b;
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  vec3 bloom = texture2D(tBloom, uv).rgb;
  if (any(isnan(bloom)) || any(isinf(bloom))) bloom = vec3(0.0);
  col += bloom * uBloom;
  // The intro flash: a white-hot wash that keeps the corners dark.
  float vig = smoothstep(0.2, 1.1, sqrt(r2));
  vec2 fd = (uv - uFlashC) * vec2(uRes.x / uRes.y, 1.0);
  col += vec3(0.28, 0.52, 1.0) * uFlash * 0.75 * exp(-dot(fd, fd) * 5.0);
  col *= uExposure;
  // Vignette, slightly blue so the corners stay inky instead of grey.
  col *= 1.0 - uVignette * vig * vig;
  col = toSrgb(acesFilm(col));
  // Triangular dither (kills banding in the dark gradients) plus a fine animated grain.
  float n1 = hash21(gl_FragCoord.xy + fract(uTime * 7.13) * 91.7);
  float n2 = hash21(gl_FragCoord.xy * 1.37 + fract(uTime * 3.71) * 53.1);
  float tri = n1 + n2 - 1.0;
  col += tri * (uGrain * 0.022 + 1.0 / 255.0);
  col *= uFade;
  gl_FragColor = vec4(col, 1.0);
}
`;
