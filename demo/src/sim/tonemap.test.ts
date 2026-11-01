import { describe, expect, it } from 'vitest';
import type { CurveId, ToneParams } from './tonemap';
import { bt2390Eetf, bt2390KneeNits, lumaSoftKnee, sdrPreview, toneMap } from './tonemap';

const CURVES: CurveId[] = ['hardClip', 'reinhard', 'bt2390', 'lumaKnee'];
const PARAMS: ToneParams[] = [
  { peak: 1600, black: 0, sourceMax: 10000, knee: 0.6 },
  { peak: 1000, black: 0.005, sourceMax: 4000, knee: 0.5 },
  { peak: 600, black: 0, sourceMax: 10000, knee: 0.8 },
  { peak: 203, black: 0.1, sourceMax: 1000, knee: 0.4 },
];

function samples(): number[] {
  const out: number[] = [0];
  for (let e = -3; e <= 4.3; e += 0.01) out.push(Math.pow(10, e));
  out.push(10000, 20000);
  return out;
}

describe('tone mappers', () => {
  for (const curve of CURVES) {
    for (const p of PARAMS) {
      it(`${curve} is monotonic and bounded by peak ${p.peak}`, () => {
        let prev = -Infinity;
        for (const x of samples()) {
          const y = toneMap(curve, x, p);
          expect(Number.isFinite(y)).toBe(true);
          expect(y).toBeGreaterThanOrEqual(prev - 1e-6);
          expect(y).toBeLessThanOrEqual(p.peak + 1e-6);
          prev = y;
        }
      });
    }
  }

  it('BT.2390 EETF is the identity below its knee (black = 0)', () => {
    const p = { peak: 1000, black: 0, sourceMax: 10000, knee: 0.6 };
    const ks = bt2390KneeNits(p);
    expect(ks).toBeGreaterThan(50);
    expect(ks).toBeLessThan(p.peak);
    for (const x of [0.01, 0.5, 5, 50, ks * 0.5, ks * 0.98]) expect(bt2390Eetf(x, p) / x).toBeCloseTo(1, 4);
  });

  it('BT.2390 EETF reaches the target peak at the source maximum', () => {
    const p = { peak: 1000, black: 0, sourceMax: 4000, knee: 0.6 };
    expect(bt2390Eetf(4000, p)).toBeCloseTo(1000, 0);
  });

  it('Luma soft knee is identity below the knee and lands on peak at sourceMax', () => {
    const p = { peak: 1600, black: 0, sourceMax: 10000, knee: 0.6 };
    expect(lumaSoftKnee(500, p)).toBe(500);
    expect(lumaSoftKnee(960, p)).toBeCloseTo(960, 6);
    expect(lumaSoftKnee(10000, p)).toBeCloseTo(1600, 3);
    // slope close to 1 just above the knee (C1 continuity)
    const d = (lumaSoftKnee(961, p) - lumaSoftKnee(960, p)) / 1;
    expect(d).toBeGreaterThan(0.98);
  });

  it('SDR preview maps paper white below 1 and peak to exactly 1', () => {
    expect(sdrPreview(203, 203, 1600)).toBeCloseTo(0.62, 6);
    expect(sdrPreview(1600, 203, 1600)).toBeCloseTo(1, 6);
    expect(sdrPreview(0, 203, 1600)).toBe(0);
    let prev = -1;
    for (let n = 0; n <= 2000; n += 5) {
      const v = sdrPreview(n, 203, 1600);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
  });
});
