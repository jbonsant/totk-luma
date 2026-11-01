/**
 * Original procedural scene: sky islands at golden hour.
 *
 * Writes scene-linear BT.709 RGB in absolute nits into a Float32Array
 * (3 floats per pixel). The output is deterministic for a given (w, h, t, haze).
 * No game assets or likenesses are used; every shape here is generated.
 *
 * Static layers (sky, sun, sea base, terrain) are cached per size; only the
 * moving parts (clouds, island bob, sea glints, lantern flicker, haze) are
 * recomputed each frame, so the scene can animate at about 30 Hz on the main thread.
 */
import type { Vec3 } from './color';

export interface SceneOptions {
  /** Atmospheric haze density, 0 (clear) to 1 (thick). */
  haze: number;
}

export interface SceneFrame {
  width: number;
  height: number;
  /** RGB triplets in nits, row-major, top row first. */
  rgb: Float32Array;
  /** Colour of the haze veil (airlight) in nits. */
  airlight: Vec3;
  /** Brightest value in the frame (nits). */
  maxNits: number;
}

export const SUN_CORE_NITS = 7500;
export const GLINT_MAX_NITS = 4200;
export const HORIZON_V = 0.6;
export const SUN_POS = { u: 0.7, v: 0.47 };
const SUN_R = 0.017;
const LANTERN = { u: 0.17, v: 0.775 };
export const AIRLIGHT: Vec3 = [235, 188, 150];

// --- deterministic value noise ------------------------------------------------

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let xf = x - xi;
  let yf = y - yi;
  xf = xf * xf * (3 - 2 * xf);
  yf = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

export function fbm(x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * f, y * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

// --- layout -------------------------------------------------------------------------

interface Island {
  cx: number;
  cy: number;
  /** half width in u units */
  r: number;
  depth: number;
  phase: number;
  seed: number;
}

const ISLANDS: Island[] = [
  { cx: 0.6, cy: 0.395, r: 0.028, depth: 0.92, phase: 4.4, seed: 51 },
  { cx: 0.47, cy: 0.17, r: 0.06, depth: 0.82, phase: 1.7, seed: 23 },
  { cx: 0.87, cy: 0.29, r: 0.08, depth: 0.72, phase: 3.1, seed: 37 },
  { cx: 0.24, cy: 0.25, r: 0.135, depth: 0.55, phase: 0, seed: 11 },
];

const KIND_SKY = 0;
const KIND_SEA = 1;
const KIND_TERRAIN = 2;

function terrainRidge(u: number): number {
  return 0.7 + 0.36 * smoothstep(0.3, 0.98, u) - 0.03 * Math.sin(u * 7.0) + 0.035 * (fbm(u * 8, 3.7, 4) - 0.5);
}

/** Sky radiance (nits) at screen position (u, v). */
function sky(u: number, v: number, aspect: number, out: Vec3): void {
  const k = Math.min(Math.max(v / HORIZON_V, 0), 1);
  const warm = smoothstep(0.35, 1.0, k);
  const r = 16 + 105 * k * k + 430 * warm * warm;
  const g = 36 + 92 * k * k + 215 * warm * warm;
  const b = 100 + 62 * k - 40 * warm * warm;
  const du = (u - SUN_POS.u) * aspect;
  const dv = v - SUN_POS.v;
  const d = Math.sqrt(du * du + dv * dv);
  const glow = 1500 * Math.exp(-d / 0.035) + 380 * Math.exp(-d / 0.16);
  out[0] = r + glow;
  out[1] = g + glow * 0.72;
  out[2] = b + glow * 0.42;
}

interface StaticLayers {
  w: number;
  h: number;
  base: Float32Array;
  depth: Float32Array;
  kind: Uint8Array;
  /** first sea row */
  seaRow0: number;
  /** cloud band rows */
  cloudRow0: number;
  cloudRow1: number;
}

let cache: StaticLayers | null = null;

function buildStatic(w: number, h: number): StaticLayers {
  const aspect = w / h;
  const base = new Float32Array(w * h * 3);
  const depth = new Float32Array(w * h);
  const kind = new Uint8Array(w * h);
  const skyC: Vec3 = [0, 0, 0];
  const ridges = new Float32Array(w);
  for (let x = 0; x < w; x++) ridges[x] = terrainRidge((x + 0.5) / w);

  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const i = y * w + x;
      let r: number;
      let g: number;
      let b: number;
      let d: number;
      let k = KIND_SKY;
      if (v > HORIZON_V) {
        k = KIND_SEA;
        const dist = (v - HORIZON_V) / (1 - HORIZON_V);
        sky(u, HORIZON_V - (v - HORIZON_V) * 0.6, aspect, skyC);
        const fres = 0.07 + 0.5 * Math.pow(1 - dist, 4);
        const swell = 0.85 + 0.3 * valueNoise(u * 40, v * 160);
        r = 2.5 + skyC[0] * fres * swell;
        g = 9 + skyC[1] * fres * swell;
        b = 16 + skyC[2] * fres * swell;
        d = 1 - dist * 0.85;
      } else {
        sky(u, v, aspect, skyC);
        r = skyC[0];
        g = skyC[1];
        b = skyC[2];
        const du = (u - SUN_POS.u) * aspect;
        const dv = v - SUN_POS.v;
        const dd = Math.sqrt(du * du + dv * dv);
        // sun disc with a one-pixel soft edge and slight limb darkening
        const cover = Math.min(Math.max((SUN_R - dd) * h + 0.5, 0), 1);
        if (cover > 0) {
          const q = Math.min(dd / SUN_R, 1);
          const limb = 1 - 0.35 * q * q;
          r += (SUN_CORE_NITS * limb - r) * cover;
          g += (SUN_CORE_NITS * 0.86 * limb - g) * cover;
          b += (SUN_CORE_NITS * 0.66 * limb - b) * cover;
        }
        // haze gathers towards the horizon, the zenith stays clear
        const kz = Math.min(v / HORIZON_V, 1);
        d = 0.25 + 0.75 * kz * kz;
      }
      // foreground terrain, blended over a one-pixel edge (anti-aliased ridge)
      const ridge = ridges[x];
      const edge = (v - ridge) * h + 0.5;
      if (edge > 0) {
        const a = Math.min(edge, 1);
        const into = Math.max(v - ridge, 0) * 14;
        const tex = fbm(u * 46, v * 30, 3);
        const fine = valueNoise(u * 300, v * 160);
        const shade = 0.55 + 0.9 * tex * (0.8 + 0.4 * fine);
        const rim = Math.exp(-into * 4) * (0.45 + 0.55 * smoothstep(0.0, 0.7, u));
        r += (5.5 * shade + 170 * rim * shade - r) * a;
        g += (6.5 * shade + 108 * rim * shade - g) * a;
        b += (2.4 * shade + 44 * rim * shade - b) * a;
        d += (0.04 - d) * a;
        if (a >= 0.5) k = KIND_TERRAIN;
      }
      base[i * 3] = r;
      base[i * 3 + 1] = g;
      base[i * 3 + 2] = b;
      depth[i] = d;
      kind[i] = k;
    }
  }
  return {
    w,
    h,
    base,
    depth,
    kind,
    seaRow0: Math.floor(HORIZON_V * h),
    cloudRow0: Math.floor(0.05 * h),
    cloudRow1: Math.ceil(0.57 * h),
  };
}

function layers(w: number, h: number): StaticLayers {
  if (!cache || cache.w !== w || cache.h !== h) cache = buildStatic(w, h);
  return cache;
}

let frameDepth: Float32Array | null = null;
let cloudGrid: Float32Array | null = null;

/**
 * Render the scene for time t (seconds) into `rgb` (width * height * 3 floats).
 */
export function renderScene(rgb: Float32Array, width: number, height: number, t: number, opts: SceneOptions): SceneFrame {
  const L = layers(width, height);
  const w = width;
  const h = height;
  const aspect = w / h;
  const haze = Math.min(Math.max(opts.haze, 0), 1);
  rgb.set(L.base);
  if (!frameDepth || frameDepth.length !== w * h) frameDepth = new Float32Array(w * h);
  const depth = frameDepth;
  depth.set(L.depth);

  // --- clouds: density on a half-resolution grid, bilinear upsampled ---
  const gw = (w >> 1) + 2;
  const r0 = L.cloudRow0;
  const r1 = L.cloudRow1;
  const gh = ((r1 - r0) >> 1) + 2;
  if (!cloudGrid || cloudGrid.length !== gw * gh) cloudGrid = new Float32Array(gw * gh);
  const grid = cloudGrid;
  const drift = t * 0.012;
  for (let gy = 0; gy < gh; gy++) {
    const v = (r0 + gy * 2 + 0.5) / h;
    for (let gx = 0; gx < gw; gx++) {
      const u = (gx * 2 + 0.5) / w;
      grid[gy * gw + gx] = fbm(u * 1.75 * aspect + drift, v * 9.5 + drift * 0.15, 4);
    }
  }
  for (let y = r0; y < r1; y++) {
    const v = (y + 0.5) / h;
    const band = smoothstep(0.05, 0.19, v) * (1 - smoothstep(0.42, 0.57, v));
    if (band <= 0) continue;
    const gyf = (y - r0) / 2;
    const gy = gyf | 0;
    const fy = gyf - gy;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (L.kind[i] !== KIND_SKY) continue;
      const gxf = x / 2;
      const gx = gxf | 0;
      const fx = gxf - gx;
      const a = grid[gy * gw + gx];
      const b = grid[gy * gw + gx + 1];
      const c = grid[(gy + 1) * gw + gx];
      const d = grid[(gy + 1) * gw + gx + 1];
      const n = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
      const density = smoothstep(0.47, 0.68, n) * band;
      if (density < 0.002) continue;
      const u = (x + 0.5) / w;
      const cdu = (u - SUN_POS.u) * aspect;
      const cdv = v - SUN_POS.v;
      const cd = Math.sqrt(cdu * cdu + cdv * cdv);
      const thin = 1 - smoothstep(0.5, 0.75, n);
      const silver = 2400 * Math.exp(-cd / 0.075) * (0.35 + 0.65 * thin);
      const low = smoothstep(0.25, 0.55, v);
      const shade = 0.55 + 0.45 * thin;
      const cr = 175 * shade + silver + 150 * low;
      const cg = 128 * shade + silver * 0.74 + 70 * low;
      const cb = 132 * shade + silver * 0.5 + 6 * low;
      const o = i * 3;
      rgb[o] += (cr - rgb[o]) * density;
      rgb[o + 1] += (cg - rgb[o + 1]) * density;
      rgb[o + 2] += (cb - rgb[o + 2]) * density;
    }
  }

  // --- floating rock islands (gentle bob) ---
  for (const isl of ISLANDS) {
    const cy = isl.cy + 0.006 * Math.sin(t * 0.45 + isl.phase);
    const halfV = (isl.r / aspect) * 2.6;
    const y0 = Math.max(0, Math.floor((cy - (isl.r / aspect) * 0.45) * h));
    const y1 = Math.min(h - 1, Math.ceil((cy + halfV) * h));
    const x0 = Math.max(0, Math.floor((isl.cx - isl.r * 1.3) * w));
    const x1 = Math.min(w - 1, Math.ceil((isl.cx + isl.r * 1.3) * w));
    for (let y = y0; y <= y1; y++) {
      const v = (y + 0.5) / h;
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (L.kind[i] !== KIND_SKY) continue;
        const u = (x + 0.5) / w;
        const dx = (u - isl.cx) / isl.r;
        const dy = ((v - cy) * aspect) / isl.r;
        const capTop = -0.2 * Math.sqrt(Math.max(1 - dx * dx, 0)) - 0.05 * valueNoise(dx * 9 + isl.seed, 1.5);
        const n = fbm(dx * 5 + isl.seed, dy * 5, 2);
        const half =
          Math.pow(Math.max(1 - dy / 1.75, 0), 1.05) * (0.8 + 0.45 * n) * (1 - 0.12 * Math.abs(Math.sin(dy * 5 + isl.seed)));
        // coverage in pixels, for soft one-pixel edges
        const pxX = isl.r * w;
        const pxY = (isl.r * h) / aspect;
        const capCov = Math.min(Math.max((dy - capTop) * pxY + 0.5, 0), 1) * Math.min(Math.max((1 - Math.abs(dx)) * pxX + 0.5, 0), 1) * (dy <= 0.12 ? 1 : 0);
        // fade parts thinner than a pixel so the tip does not leave a one-pixel stalk
        const rockCov = dy > 0 && half > 0 ? Math.min(Math.max((half - Math.abs(dx)) * pxX + 0.5, 0), 1) * Math.min(half * pxX * 2, 1) : 0;
        const cov = Math.max(capCov, rockCov);
        if (cov <= 0) continue;
        const sunSide = smoothstep(-0.7, 1.0, dx);
        let r: number;
        let g: number;
        let b: number;
        if (capCov > 0 && dy < 0.08) {
          const tex = valueNoise(dx * 26 + isl.seed, dy * 26);
          const lip = smoothstep(capTop + 0.06, capTop, dy); // sunlit lip
          r = 34 + 95 * sunSide + 22 * tex + 60 * lip * sunSide;
          g = 50 + 78 * sunSide + 26 * tex + 40 * lip * sunSide;
          b = 11 + 18 * sunSide + 6 * lip;
        } else {
          const tex = valueNoise(dx * 14 + isl.seed, dy * 18);
          const strata = 0.8 + 0.2 * Math.sin(dy * 22 + tex * 3);
          const down = smoothstep(0.05, 1.6, dy);
          const rim = smoothstep(half - 0.14, half, Math.abs(dx)) * (dx > 0 ? 1 : 0.15);
          const lit = (1 - 0.85 * down) * strata;
          r = (20 + 18 * tex) * lit + 95 * rim * (1 - down * 0.5) + 5;
          g = (15 + 13 * tex) * lit + 58 * rim * (1 - down * 0.5) + 4;
          b = (12 + 8 * tex) * lit + 28 * rim * (1 - down * 0.5) + 4.5;
        }
        const o = i * 3;
        rgb[o] += (r - rgb[o]) * cov;
        rgb[o + 1] += (g - rgb[o + 1]) * cov;
        rgb[o + 2] += (b - rgb[o + 2]) * cov;
        depth[i] += (isl.depth - depth[i]) * cov;
      }
    }
  }

  // --- sea glints along the sun column ---
  for (let y = L.seaRow0; y < h; y++) {
    const v = (y + 0.5) / h;
    const dist = (v - HORIZON_V) / (1 - HORIZON_V);
    const colW = 0.014 + 0.17 * dist;
    const xa = Math.max(0, Math.floor((SUN_POS.u - colW * 2.6) * w));
    const xb = Math.min(w - 1, Math.ceil((SUN_POS.u + colW * 2.6) * w));
    const waveScale = 3 + 1 / (dist + 0.03);
    for (let x = xa; x <= xb; x++) {
      const i = y * w + x;
      if (L.kind[i] !== KIND_SEA) continue;
      const u = (x + 0.5) / w;
      const du = u - SUN_POS.u;
      const col = Math.exp(-(du * du) / (colW * colW));
      const ripple = valueNoise(u * 28 * waveScale, v * 90 * waveScale + t * 1.6);
      const ripple2 = valueNoise(u * 220, v * 700 - t * 2.3);
      const sparkle = Math.max(ripple * ripple2 - 0.42, 0) * 3.4;
      const glint = col * (Math.min(sparkle, 1) * GLINT_MAX_NITS + 130 * ripple);
      const o = i * 3;
      rgb[o] += glint;
      rgb[o + 1] += glint * 0.8;
      rgb[o + 2] += glint * 0.56;
    }
  }

  // --- lantern: emissive body, light pool and halo (flickers) ---
  const flicker = 0.86 + 0.08 * Math.sin(t * 11.3) + 0.06 * Math.sin(t * 17.9 + 1.3);
  const reach = 0.3;
  const lx0 = Math.max(0, Math.floor((LANTERN.u - reach / aspect) * w));
  const lx1 = Math.min(w - 1, Math.ceil((LANTERN.u + reach / aspect) * w));
  const ly0 = Math.max(0, Math.floor((LANTERN.v - reach) * h));
  const ly1 = Math.min(h - 1, Math.ceil((LANTERN.v + reach) * h));
  for (let y = ly0; y <= ly1; y++) {
    const v = (y + 0.5) / h;
    const lv = v - LANTERN.v;
    for (let x = lx0; x <= lx1; x++) {
      const u = (x + 0.5) / w;
      const lu = (u - LANTERN.u) * aspect;
      const i = y * w + x;
      const o = i * 3;
      const ld = Math.sqrt(lu * lu + lv * lv);
      if (Math.abs(lu) < 0.0028 && lv > 0.008 && lv < 0.05) {
        rgb[o] = 3;
        rgb[o + 1] = 2.4;
        rgb[o + 2] = 2;
        depth[i] = 0.04;
        continue;
      }
      if (Math.abs(lu) < 0.0085 && lv > -0.016 && lv <= 0.008) {
        const core = 1 - Math.min(Math.sqrt(lu * lu + (lv + 0.004) * (lv + 0.004)) / 0.012, 1);
        const e = (520 + 2300 * core * core) * flicker;
        rgb[o] = e;
        rgb[o + 1] = e * 0.62;
        rgb[o + 2] = e * 0.26;
        depth[i] = 0.04;
        continue;
      }
      if (L.kind[i] === KIND_TERRAIN) {
        const pool = 85 * flicker * Math.exp(-ld / 0.04);
        rgb[o] += pool;
        rgb[o + 1] += pool * 0.55;
        rgb[o + 2] += pool * 0.2;
      }
      const halo = 140 * flicker * Math.exp(-ld / 0.022);
      rgb[o] += halo;
      rgb[o + 1] += halo * 0.58;
      rgb[o + 2] += halo * 0.22;
    }
  }

  // --- aerial perspective / haze, and the frame maximum ---
  const hazeK = 0.4 + 3.2 * haze;
  const hazeAmt = 0.25 + 0.75 * haze;
  let maxNits = 0;
  const A = AIRLIGHT;
  for (let i = 0, o = 0; i < w * h; i++, o += 3) {
    const d = depth[i];
    const hz = (1 - Math.exp(-hazeK * d * d)) * hazeAmt;
    const r = rgb[o];
    const g = rgb[o + 1];
    const b = rgb[o + 2];
    const k = r > 3000 ? hz * 0.15 : hz;
    const nr = r + (A[0] - r) * k;
    const ng = g + (A[1] - g) * k;
    const nb = b + (A[2] - b) * k;
    rgb[o] = nr;
    rgb[o + 1] = ng;
    rgb[o + 2] = nb;
    if (nr > maxNits) maxNits = nr;
  }
  return { width: w, height: h, rgb, airlight: A, maxNits };
}

export function allocScene(width: number, height: number): Float32Array {
  return new Float32Array(width * height * 3);
}
