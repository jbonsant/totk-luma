import { describe, expect, it } from 'vitest';
import { WAVEFORM_TICKS, clipStats, logAxisPos, logHistogram, spreadLabels, waveform } from './scopes';
import { pqEncode } from './color';
import { allocScene, renderScene } from './scene';

describe('scopes', () => {
  it('histogram counts sum to the pixel count, including out-of-range values', () => {
    const lum = new Float32Array([0, 0.001, 0.005, 0.1, 1, 100, 203, 1000, 9999, 10000, 50000, -1]);
    const h = logHistogram(lum, 64);
    const sum = h.bins.reduce((a, b) => a + b, 0);
    expect(sum).toBe(lum.length);
    expect(h.total).toBe(lum.length);
  });

  it('histogram sums correctly on a rendered scene', () => {
    const w = 96;
    const hgt = 54;
    const frame = renderScene(allocScene(w, hgt), w, hgt, 4, { haze: 0.3 });
    const lum = new Float32Array(w * hgt);
    for (let i = 0; i < lum.length; i++) lum[i] = frame.rgb[i * 3 + 1];
    const h = logHistogram(lum);
    expect(h.bins.reduce((a, b) => a + b, 0)).toBe(w * hgt);
  });

  it('clip percentage is right on a synthetic buffer', () => {
    const lum = new Float32Array(200);
    for (let i = 0; i < 200; i++) lum[i] = 100;
    for (let i = 0; i < 30; i++) lum[i] = 5000; // 15% above a 1000-nit peak
    for (let i = 30; i < 40; i++) lum[i] = 0.001; // 5% below a 0.005 floor
    const s = clipStats(lum, 1000, 0.005);
    expect(s.aboveFraction).toBeCloseTo(0.15, 10);
    expect(s.belowFraction).toBeCloseTo(0.05, 10);
    expect(s.maxNits).toBe(5000);
  });

  it('waveform counts every pixel once', () => {
    const w = 40;
    const h = 10;
    const lum = new Float32Array(w * h).map((_, i) => (i % 7) * 50);
    const wf = waveform(lum, w, h, 20, 32);
    expect(wf.data.reduce((a, b) => a + b, 0)).toBe(w * h);
  });

  it('log axis places decades evenly', () => {
    expect(logAxisPos(0.005)).toBe(0);
    expect(logAxisPos(10000)).toBe(1);
    expect(logAxisPos(100) - logAxisPos(10)).toBeCloseTo(logAxisPos(1000) - logAxisPos(100), 10);
  });
});

describe('scene', () => {
  it('is deterministic for a given time and has a very bright sun', () => {
    const a = renderScene(allocScene(64, 36), 64, 36, 2.5, { haze: 0.2 });
    const b = renderScene(allocScene(64, 36), 64, 36, 2.5, { haze: 0.2 });
    expect(Array.from(a.rgb)).toEqual(Array.from(b.rgb));
    const big = renderScene(allocScene(480, 270), 480, 270, 0, { haze: 0.2 });
    expect(big.maxNits).toBeGreaterThan(3000);
  });
});

describe('spreadLabels', () => {
  it('keeps close labels at least the gap apart and leaves distant ones alone', () => {
    const ys = [10, 80, 86, 150];
    const out = spreadLabels(ys, 12);
    expect(out[0]).toBe(10);
    expect(out[3]).toBe(150);
    expect(out[2] - out[1]).toBeGreaterThanOrEqual(12 - 1e-9);
    // centred on the original pair
    expect((out[1] + out[2]) / 2).toBeCloseTo(83, 6);
  });

  it('keeps the top label inside the canvas without closing the gaps below it', () => {
    // 10k sits at the top edge of the waveform (y = 4); its label needs 6 px for half a line
    const out = spreadLabels([4, 12, 60], 12, 6);
    expect(out[0]).toBe(6);
    expect(out[1]).toBe(18);
    expect(out[2]).toBe(60);
  });

  it('fits the eight waveform labels between both edges of a 92 px canvas', () => {
    const H = 92;
    const plotH = H - 8;
    const ys = WAVEFORM_TICKS.map((t) => 4 + plotH - pqEncode(t) * plotH);
    const out = spreadLabels(ys, 11, 6, H - 6);
    const sorted = [...out].sort((a, b) => a - b);
    expect(sorted[0]).toBeGreaterThanOrEqual(6);
    expect(sorted[sorted.length - 1]).toBeLessThanOrEqual(H - 6);
    for (let k = 1; k < sorted.length; k++) expect(sorted[k] - sorted[k - 1]).toBeGreaterThanOrEqual(11 - 1e-9);
  });
});
