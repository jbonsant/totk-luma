import { describe, expect, it } from 'vitest';
import {
  BT709_TO_BT2020,
  BT709_TO_P3,
  LUMA_709,
  applyMat3,
  edrHeadroom,
  pqDecode,
  pqEncode,
  srgbDecode,
  srgbEncode,
} from './color';

describe('PQ (SMPTE ST 2084)', () => {
  it('maps the ends of the range exactly', () => {
    expect(pqEncode(0)).toBeCloseTo(0, 6);
    expect(pqEncode(10000)).toBeCloseTo(1, 6);
  });

  it('matches reference code values', () => {
    expect(pqEncode(100)).toBeCloseTo(0.508, 3);
    expect(pqEncode(1000)).toBeCloseTo(0.752, 3);
    expect(pqEncode(203)).toBeCloseTo(0.58, 2);
  });

  it('round-trips decode(encode(x))', () => {
    for (const x of [0.001, 0.05, 1, 5, 80, 100, 203, 600, 1000, 1600, 4000, 9999]) {
      expect(pqDecode(pqEncode(x)) / x).toBeCloseTo(1, 4);
    }
  });

  it('is monotonic', () => {
    let prev = -1;
    for (let n = 0; n <= 10000; n += 7.3) {
      const v = pqEncode(n);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('sRGB transfer', () => {
  it('round-trips and hits known points', () => {
    expect(srgbEncode(0)).toBe(0);
    expect(srgbEncode(1)).toBeCloseTo(1, 6);
    expect(srgbEncode(0.18)).toBeCloseTo(0.4613, 3);
    for (const x of [0.001, 0.01, 0.2, 0.5, 0.9]) expect(srgbDecode(srgbEncode(x))).toBeCloseTo(x, 6);
  });
});

describe('matrices and luminance', () => {
  it('derives BT.709 luminance weights', () => {
    expect(LUMA_709[0]).toBeCloseTo(0.2126, 3);
    expect(LUMA_709[1]).toBeCloseTo(0.7152, 3);
    expect(LUMA_709[2]).toBeCloseTo(0.0722, 3);
  });

  it('matches the published BT.709 -> BT.2020 matrix', () => {
    expect(BT709_TO_BT2020[0][0]).toBeCloseTo(0.6274, 3);
    expect(BT709_TO_BT2020[0][1]).toBeCloseTo(0.3293, 3);
    expect(BT709_TO_BT2020[1][1]).toBeCloseTo(0.9195, 3);
    expect(BT709_TO_BT2020[2][2]).toBeCloseTo(0.8956, 3);
  });

  it('keeps white white across gamuts', () => {
    for (const m of [BT709_TO_P3, BT709_TO_BT2020]) {
      const w = applyMat3(m, [1, 1, 1]);
      for (const c of w) expect(c).toBeCloseTo(1, 4);
    }
  });
});

describe('EDR headroom', () => {
  it('is peak over paper white, never below 1', () => {
    expect(edrHeadroom(1600, 200)).toBe(8);
    expect(edrHeadroom(100, 203)).toBe(1);
  });
});
