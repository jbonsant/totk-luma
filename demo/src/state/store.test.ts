import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, headroomFrom, measuredContext } from './store';
import type { Calibration } from './store';

const a95l = (patch: Partial<Calibration> = {}): Calibration => ({ ...DEFAULT_STATE.calib.a95l, ...patch });
const macbook = (patch: Partial<Calibration> = {}): Calibration => ({ ...DEFAULT_STATE.calib.macbook, ...patch });

describe('headroomFrom - HDR10 PQ (A95L)', () => {
  it('keeps the computed peak when paper white changes (PQ is absolute)', () => {
    const peaks = [100, 160, 203, 300].map((pw) => headroomFrom('a95l', a95l({ paperWhite: pw })).computedPeak);
    expect(new Set(peaks).size).toBe(1);
    expect(peaks[0]).toBe(1300);
  });

  it('uses the calibrated peak when it is below the panel ceiling', () => {
    const hr = headroomFrom('a95l', a95l({ peak: 1100, peakTested: true }));
    expect(hr.computedPeak).toBe(1100);
    expect(hr.limitedBy).toBe('calibrated');
  });

  it('caps a calibrated peak above the example panel ceiling and says so', () => {
    const hr = headroomFrom('a95l', a95l({ peak: 1400, peakTested: true }));
    expect(hr.computedPeak).toBe(1300);
    expect(hr.limitedBy).toBe('panel');
  });

  it('derives headroom as peak / paper white', () => {
    const hr = headroomFrom('a95l', a95l({ paperWhite: 100 }));
    expect(hr.headroomNow).toBeCloseTo(13, 6);
  });
});

describe('headroomFrom - EDR (MacBook)', () => {
  it('reaches the spec peak at the default paper white', () => {
    const hr = headroomFrom('macbook', macbook());
    expect(hr.computedPeak).toBe(1600);
    expect(hr.headroomNow).toBeCloseTo(1600 / 203, 6);
  });

  it('is limited by the EDR headroom at a low paper white', () => {
    const hr = headroomFrom('macbook', macbook({ paperWhite: 80 }));
    expect(hr.computedPeak).toBe(80 * 16);
    expect(hr.limitedBy).toBe('edr-headroom');
  });

  it('never goes below paper white', () => {
    const hr = headroomFrom('macbook', macbook({ paperWhite: 500, peak: 400 }));
    expect(hr.computedPeak).toBe(500);
    expect(hr.headroomNow).toBe(1);
  });
});

describe('UI white (ADR 0002 D9)', () => {
  it('is paper white x 0.85 by default', () => {
    expect(DEFAULT_STATE.calib.macbook.uiScale).toBe(0.85);
    expect(headroomFrom('macbook', macbook()).uiWhite).toBeCloseTo(203 * 0.85, 6);
    expect(headroomFrom('a95l', a95l({ paperWhite: 100 })).uiWhite).toBeCloseTo(85, 6);
  });

  it('follows the UI scale', () => {
    expect(headroomFrom('a95l', a95l({ uiScale: 0.6 })).uiWhite).toBeCloseTo(203 * 0.6, 6);
  });
});

describe('measured readings (ADR 0002 D9)', () => {
  it('start empty, with no date and no instrument', () => {
    expect(DEFAULT_STATE.calib.macbook.measured).toEqual({ white: null, peak: null, black: null, date: null, instrument: null });
  });

  it('carry the date and the instrument, or say they were not entered', () => {
    expect(measuredContext({ date: '2026-11-01', instrument: ' Meter X, WOLED correction ' })).toBe('2026-11-01, Meter X, WOLED correction');
    expect(measuredContext({ date: null, instrument: '' })).toBe('date not entered, instrument not entered');
  });
});
