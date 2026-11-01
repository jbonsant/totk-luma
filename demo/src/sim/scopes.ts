/**
 * Scopes over a luminance buffer (nits): log histogram, PQ waveform, clipping.
 */
import { pqEncode } from './color';

export const HIST_MIN_NITS = 0.005;
export const HIST_MAX_NITS = 10000;

export interface Histogram {
  bins: Uint32Array;
  minNits: number;
  maxNits: number;
  total: number;
}

/**
 * Histogram with log10-spaced bins between minNits and maxNits.
 * Values below the range land in the first bin, values above in the last,
 * so counts always sum to the pixel count.
 */
export function logHistogram(lum: Float32Array, binCount = 96, minNits = HIST_MIN_NITS, maxNits = HIST_MAX_NITS): Histogram {
  const bins = new Uint32Array(binCount);
  const lo = Math.log10(minNits);
  const span = Math.log10(maxNits) - lo;
  const scale = binCount / span;
  for (let i = 0; i < lum.length; i++) {
    const v = lum[i];
    let b: number;
    if (!(v > minNits)) b = 0;
    else {
      b = Math.floor((Math.log10(v) - lo) * scale);
      if (b >= binCount) b = binCount - 1;
    }
    bins[b]++;
  }
  return { bins, minNits, maxNits, total: lum.length };
}

/** Position (0..1) of a nits value on the histogram's log axis. */
export function logAxisPos(nits: number, minNits = HIST_MIN_NITS, maxNits = HIST_MAX_NITS): number {
  const lo = Math.log10(minNits);
  const hi = Math.log10(maxNits);
  return Math.min(Math.max((Math.log10(Math.max(nits, minNits)) - lo) / (hi - lo), 0), 1);
}

export interface Waveform {
  columns: number;
  rows: number;
  /** counts, row-major with row 0 = PQ 0 (black) */
  data: Uint32Array;
  maxCount: number;
}

/**
 * Waveform: for each output column, the distribution of PQ-encoded luminance
 * over `rows` bins.
 */
const PQ_LUT_LO = -4;
const PQ_LUT_HI = 4;
const PQ_LUT_N = 4096;
const PQ_LUT = (() => {
  const t = new Float32Array(PQ_LUT_N + 1);
  for (let i = 0; i <= PQ_LUT_N; i++) t[i] = pqEncode(Math.pow(10, PQ_LUT_LO + ((PQ_LUT_HI - PQ_LUT_LO) * i) / PQ_LUT_N));
  return t;
})();

/** PQ encode through a log-spaced lookup table (fast, about 1e-3 accurate). */
export function pqEncodeFast(nits: number): number {
  if (!(nits > 1e-4)) return 0;
  const pos = ((Math.log10(nits) - PQ_LUT_LO) / (PQ_LUT_HI - PQ_LUT_LO)) * PQ_LUT_N;
  if (pos >= PQ_LUT_N) return 1;
  return PQ_LUT[pos | 0];
}

export function waveform(lum: Float32Array, w: number, h: number, columns = 160, rows = 96, step = 1): Waveform {
  const data = new Uint32Array(columns * rows);
  let maxCount = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const c = Math.min(Math.floor((x * columns) / w), columns - 1);
      const r = Math.min(Math.floor(pqEncodeFast(lum[y * w + x]) * rows), rows - 1);
      const idx = r * columns + c;
      const n = ++data[idx];
      if (n > maxCount) maxCount = n;
    }
  }
  return { columns, rows, data, maxCount };
}

/** Waveform axis ticks in nits, placed on a PQ scale. */
export const WAVEFORM_TICKS = [0.1, 1, 10, 100, 203, 1000, 4000, 10000];

export interface ClipStats {
  aboveFraction: number;
  belowFraction: number;
  above: number;
  below: number;
  total: number;
  maxNits: number;
}

export function clipStats(lum: Float32Array, peak: number, blackFloor: number): ClipStats {
  let above = 0;
  let below = 0;
  let maxNits = 0;
  for (let i = 0; i < lum.length; i++) {
    const v = lum[i];
    if (v > peak) above++;
    else if (v < blackFloor) below++;
    if (v > maxNits) maxNits = v;
  }
  const total = lum.length;
  return { above, below, total, aboveFraction: total ? above / total : 0, belowFraction: total ? below / total : 0, maxNits };
}

/**
 * Moves label centres apart so neighbours are at least `gap` px apart while
 * staying as close as possible to their ticks (relaxation passes). `min` and
 * `max` keep the outer labels inside the canvas (half a text line from each
 * edge); labels then shift only as far as the gap requires. If the range is
 * too short for every gap, the top label wins.
 */
export function spreadLabels(ys: number[], gap: number, min = -Infinity, max = Infinity): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const out = order.map((o) => o.y);
  for (let pass = 0; pass < 64; pass++) {
    let moved = false;
    for (let k = 1; k < out.length; k++) {
      const d = out[k] - out[k - 1];
      if (d < gap - 1e-9) {
        const push = (gap - d) / 2;
        out[k - 1] -= push;
        out[k] += push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  const n = out.length;
  if (n && (out[0] < min || out[n - 1] > max)) {
    out[0] = Math.max(out[0], min);
    for (let k = 1; k < n; k++) out[k] = Math.max(out[k], out[k - 1] + gap);
    out[n - 1] = Math.min(out[n - 1], max);
    for (let k = n - 2; k >= 0; k--) out[k] = Math.min(out[k], out[k + 1] - gap);
    out[0] = Math.max(out[0], min);
  }
  const res = new Array<number>(ys.length);
  order.forEach((o, k) => (res[o.i] = out[k]));
  return res;
}
