/**
 * Tone mappers: scene-linear nits -> display nits.
 *
 * Every curve is monotonic non-decreasing and never exceeds `peak`.
 * These are the curves the future app would offer; here they only drive a
 * simulated preview.
 */
import { clamp, pqDecode, pqEncode } from './color';

export type CurveId = 'hardClip' | 'reinhard' | 'bt2390' | 'lumaKnee';

export interface ToneParams {
  /** Display peak in nits (the most the panel should be asked for). */
  peak: number;
  /** Display black floor in nits (EETF minimum luminance). */
  black: number;
  /** Brightest scene value the curve should still distinguish (nits). */
  sourceMax: number;
  /** Knee start as a fraction of peak, used by the Luma soft knee (0.3 - 0.95). */
  knee: number;
}

export const CURVE_LABELS: Record<CurveId, string> = {
  hardClip: 'Hard clip',
  reinhard: 'Extended Reinhard',
  bt2390: 'BT.2390 EETF',
  lumaKnee: 'Luma soft knee',
};

export function hardClip(nits: number, p: ToneParams): number {
  return clamp(nits, 0, p.peak);
}

/**
 * Extended Reinhard on peak-normalised values with white point sourceMax/peak.
 * Maps sourceMax exactly to peak; values above are held at peak.
 */
export function extendedReinhard(nits: number, p: ToneParams): number {
  const x = Math.max(nits, 0) / p.peak;
  const w = Math.max(p.sourceMax / p.peak, 1.0001);
  const y = (x * (1 + x / (w * w))) / (1 + x);
  return Math.min(y, 1) * p.peak;
}

/**
 * ITU-R BT.2390 EETF (section 5.4.1), evaluated in the PQ domain.
 * Source range is [0, sourceMax]; target range is [black, peak].
 * With black = 0 the curve is the identity below its knee start KS.
 */
export function bt2390Eetf(nits: number, p: ToneParams): number {
  const srcMin = 0;
  const srcMax = Math.max(p.sourceMax, p.peak);
  const pqMin = pqEncode(srcMin);
  const pqMax = pqEncode(srcMax);
  const range = pqMax - pqMin;
  const e1 = clamp((pqEncode(nits) - pqMin) / range, 0, 1);
  const minLum = clamp((pqEncode(p.black) - pqMin) / range, 0, 1);
  const maxLum = clamp((pqEncode(p.peak) - pqMin) / range, 0, 1);
  const ks = Math.max(1.5 * maxLum - 0.5, 0);

  let e2 = e1;
  if (e1 >= ks && ks < 1) {
    const t = (e1 - ks) / (1 - ks);
    const t2 = t * t;
    const t3 = t2 * t;
    e2 = (2 * t3 - 3 * t2 + 1) * ks + (t3 - 2 * t2 + t) * (1 - ks) + (-2 * t3 + 3 * t2) * maxLum;
  }
  const e3 = e2 + minLum * Math.pow(1 - e2, 4);
  const out = pqDecode(e3 * range + pqMin);
  return Math.min(out, p.peak);
}

/** Knee start of the BT.2390 EETF in nits (identity below this when black = 0). */
export function bt2390KneeNits(p: ToneParams): number {
  const srcMax = Math.max(p.sourceMax, p.peak);
  const range = pqEncode(srcMax);
  const maxLum = pqEncode(p.peak) / range;
  const ks = Math.max(1.5 * maxLum - 0.5, 0);
  return pqDecode(ks * range);
}

/** Solve a / (1 - e^-a) = s for a > 0 (s > 1). */
function solveKneeShape(s: number): number {
  if (s <= 1.0001) return 1e-4;
  let a = 2 * (s - 1); // decent first guess
  for (let i = 0; i < 40; i++) {
    const ea = Math.exp(-a);
    const f = a / (1 - ea) - s;
    const df = (1 - ea - a * ea) / ((1 - ea) * (1 - ea));
    const next = a - f / df;
    a = next > 1e-6 ? next : a / 2;
    if (Math.abs(f) < 1e-9) break;
  }
  return a;
}

/**
 * Luma soft knee: identity up to knee * peak, then an exponential shoulder that
 * keeps slope 1 at the knee (C1-continuous) and lands exactly on peak at sourceMax.
 */
export function lumaSoftKnee(nits: number, p: ToneParams): number {
  const L = Math.max(nits, 0);
  const k = clamp(p.knee, 0.05, 0.99) * p.peak;
  if (L <= k) return L;
  const span = Math.max(p.sourceMax, p.peak * 1.0001) - k;
  const room = p.peak - k;
  const s = span / room; // slope needed at the knee in normalised units
  const a = solveKneeShape(s);
  const t = Math.min((L - k) / span, 1);
  const f = (1 - Math.exp(-a * t)) / (1 - Math.exp(-a));
  return Math.min(k + room * f, p.peak);
}

export function toneMap(curve: CurveId, nits: number, p: ToneParams): number {
  switch (curve) {
    case 'hardClip':
      return hardClip(nits, p);
    case 'reinhard':
      return extendedReinhard(nits, p);
    case 'bt2390':
      return bt2390Eetf(nits, p);
    case 'lumaKnee':
      return lumaSoftKnee(nits, p);
  }
}

/**
 * A log-spaced lookup table for fast per-pixel tone mapping.
 * Covers 1e-4 .. 1e5 nits; below the range the curve is treated as linear.
 */
export interface ToneLut {
  lo: number;
  hi: number;
  size: number;
  /** output / input ratio at each sample */
  gain: Float32Array;
}

export function buildToneLut(curve: CurveId, p: ToneParams, size = 1024): ToneLut {
  const lo = Math.log10(1e-4);
  const hi = Math.log10(1e5);
  const gain = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const L = Math.pow(10, lo + ((hi - lo) * i) / (size - 1));
    gain[i] = toneMap(curve, L, p) / L;
  }
  return { lo, hi, size, gain };
}

export function lutGain(lut: ToneLut, nits: number): number {
  if (nits <= 1e-4) return lut.gain[0];
  const pos = ((Math.log10(nits) - lut.lo) / (lut.hi - lut.lo)) * (lut.size - 1);
  if (pos >= lut.size - 1) return lut.gain[lut.size - 1];
  const i = pos | 0;
  const f = pos - i;
  return lut.gain[i] * (1 - f) + lut.gain[i + 1] * f;
}

// --- SDR preview mapping ----------------------------------------------------

/**
 * SDR preview of simulated HDR values (documented mapping).
 *
 * The browser can only show SDR, so display nits are mapped to linear sRGB:
 *  - 0 .. paper white maps linearly to 0 .. SDR_PREVIEW_WHITE (0.62 linear, about
 *    0.81 in sRGB code value), so the UI and diffuse white sit below the top.
 *  - paper white .. display peak is squeezed into the remaining 0.62 .. 1.0
 *    with a Reinhard-style shoulder that reaches exactly 1.0 at the display peak.
 *
 * The result shows relative structure (what clips, what rolls off), never
 * real brightness.
 */
export const SDR_PREVIEW_WHITE = 0.62;

export function sdrPreview(displayNits: number, paperWhite: number, peak: number): number {
  const x = Math.max(displayNits, 0) / paperWhite;
  if (x <= 1) return x * SDR_PREVIEW_WHITE;
  const h = Math.max(peak / paperWhite, 1.0001); // headroom
  const u = (x - 1) / (h - 1); // 0 at paper white, 1 at peak
  const shoulder = (u * 2) / (1 + u); // 0 -> 0, 1 -> 1, slope 2 at 0
  return SDR_PREVIEW_WHITE + (1 - SDR_PREVIEW_WHITE) * Math.min(shoulder, 1);
}
