/**
 * Colour science helpers for the simulated pipeline.
 *
 * Units: scene and display values are absolute luminance in nits (cd/m2) in
 * linear light. PQ follows SMPTE ST 2084 (10,000 nits = 1.0).
 */

export type Vec3 = [number, number, number];
export type Mat3 = [Vec3, Vec3, Vec3];

// --- SMPTE ST 2084 (PQ) -----------------------------------------------------

const M1 = 2610 / 16384; // 0.1593017578125
const M2 = (2523 / 4096) * 128; // 78.84375
const C1 = 3424 / 4096; // 0.8359375
const C2 = (2413 / 4096) * 32; // 18.8515625
const C3 = (2392 / 4096) * 32; // 18.6875

export const PQ_MAX_NITS = 10000;

/** Absolute nits -> PQ signal in [0, 1]. */
export function pqEncode(nits: number): number {
  // The raw formula gives about 7.3e-7 at zero; ST 2084 code value 0 is black.
  if (!(nits > 0)) return 0;
  const y = Math.min(nits / PQ_MAX_NITS, 1);
  const ym = Math.pow(y, M1);
  return Math.pow((C1 + C2 * ym) / (1 + C3 * ym), M2);
}

/** PQ signal in [0, 1] -> absolute nits. */
export function pqDecode(signal: number): number {
  const e = Math.min(Math.max(signal, 0), 1);
  const ep = Math.pow(e, 1 / M2);
  const num = Math.max(ep - C1, 0);
  const den = C2 - C3 * ep;
  return PQ_MAX_NITS * Math.pow(num / den, 1 / M1);
}

// --- sRGB transfer (IEC 61966-2-1) ------------------------------------------

export function srgbEncode(linear: number): number {
  const x = Math.min(Math.max(linear, 0), 1);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

export function srgbDecode(encoded: number): number {
  const x = Math.min(Math.max(encoded, 0), 1);
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/** 4096-entry lookup table for fast linear [0,1] -> 8-bit sRGB. */
export const SRGB_LUT_SIZE = 4096;
export const srgbLut: Uint8ClampedArray = (() => {
  const lut = new Uint8ClampedArray(SRGB_LUT_SIZE + 1);
  for (let i = 0; i <= SRGB_LUT_SIZE; i++) lut[i] = Math.round(srgbEncode(i / SRGB_LUT_SIZE) * 255);
  return lut;
})();

// --- Primaries and matrices -------------------------------------------------

export interface Primaries {
  name: string;
  r: [number, number];
  g: [number, number];
  b: [number, number];
  white: [number, number];
}

const D65: [number, number] = [0.3127, 0.329];

export const BT709: Primaries = { name: 'BT.709', r: [0.64, 0.33], g: [0.3, 0.6], b: [0.15, 0.06], white: D65 };
export const P3_D65: Primaries = { name: 'Display P3', r: [0.68, 0.32], g: [0.265, 0.69], b: [0.15, 0.06], white: D65 };
export const BT2020: Primaries = { name: 'BT.2020', r: [0.708, 0.292], g: [0.17, 0.797], b: [0.131, 0.046], white: D65 };

export function mulMat3(a: Mat3, b: Mat3): Mat3 {
  const out: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  return out;
}

export function applyMat3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function invertMat3(m: Mat3): Mat3 {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error('Matrix is not invertible');
  const k = 1 / det;
  return [
    [A * k, -(b * i - c * h) * k, (b * f - c * e) * k],
    [B * k, (a * i - c * g) * k, -(a * f - c * d) * k],
    [C * k, -(a * h - b * g) * k, (a * e - b * d) * k],
  ];
}

/** RGB -> CIE XYZ matrix derived from xy primaries and white point. */
export function rgbToXyzMatrix(p: Primaries): Mat3 {
  const xyz = (xy: [number, number]): Vec3 => [xy[0] / xy[1], 1, (1 - xy[0] - xy[1]) / xy[1]];
  const R = xyz(p.r);
  const G = xyz(p.g);
  const B = xyz(p.b);
  const W = xyz(p.white);
  const M: Mat3 = [
    [R[0], G[0], B[0]],
    [R[1], G[1], B[1]],
    [R[2], G[2], B[2]],
  ];
  const S = applyMat3(invertMat3(M), W);
  return [
    [M[0][0] * S[0], M[0][1] * S[1], M[0][2] * S[2]],
    [M[1][0] * S[0], M[1][1] * S[1], M[1][2] * S[2]],
    [M[2][0] * S[0], M[2][1] * S[1], M[2][2] * S[2]],
  ];
}

export const BT709_TO_XYZ = rgbToXyzMatrix(BT709);
export const P3_TO_XYZ = rgbToXyzMatrix(P3_D65);
export const BT2020_TO_XYZ = rgbToXyzMatrix(BT2020);
export const BT709_TO_P3 = mulMat3(invertMat3(P3_TO_XYZ), BT709_TO_XYZ);
export const BT709_TO_BT2020 = mulMat3(invertMat3(BT2020_TO_XYZ), BT709_TO_XYZ);
export const P3_TO_BT709 = invertMat3(BT709_TO_P3);

/** BT.709 / sRGB luminance weights (row Y of the RGB -> XYZ matrix). */
export const LUMA_709: Vec3 = [BT709_TO_XYZ[1][0], BT709_TO_XYZ[1][1], BT709_TO_XYZ[1][2]];

export function luminance709(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// --- EDR headroom -----------------------------------------------------------

/**
 * EDR headroom in Apple's sense: 1.0 is SDR reference white (paper white);
 * a headroom of 8 means highlights may reach 8x paper white.
 */
export function edrHeadroom(peakNits: number, paperWhiteNits: number): number {
  if (paperWhiteNits <= 0) return 1;
  return Math.max(1, peakNits / paperWhiteNits);
}

/** Nits -> EDR extended-linear value (1.0 = paper white). */
export function nitsToEdr(nits: number, paperWhiteNits: number): number {
  return nits / paperWhiteNits;
}

/** Linear interpolation helper. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
