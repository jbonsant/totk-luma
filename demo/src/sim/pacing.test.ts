import { describe, expect, it } from 'vitest';
import type { PanelTiming } from './pacing';
import { cadenceDurationsMs, computeCadence, fixedCadencePattern, frameStats, promotionPattern, promotionRates, simulateFrames } from './pacing';

const fixed = (hz: number): PanelTiming => ({ kind: 'fixed', hz, name: `Fixed ${hz} Hz` });
const promotion: PanelTiming = { kind: 'promotion', name: 'ProMotion, 4.17 ms steps' };
const vrr: PanelTiming = { kind: 'vrr', range: { min: 48, max: 120, lfc: true }, name: 'HDMI VRR 48-120 Hz' };
const ms = (pattern: number[], hz: number) => pattern.map((d) => ((d * 1000) / hz).toFixed(1));

describe('fixed refresh cadence (ADR 0003 arithmetic)', () => {
  it('30 FPS on 60 Hz shows every frame for 2 refreshes', () => {
    const c = computeCadence(30, fixed(60), 'cap 30');
    expect(c.pattern.every((d) => d === 2)).toBe(true);
    expect(c.even).toBe(true);
    expect(c.fit).toBe('even');
  });

  it('45 FPS on 60 Hz is 2,1,1', () => {
    expect(fixedCadencePattern(45, 60)).toEqual([2, 1, 1]);
    expect(computeCadence(45, fixed(60), 'cap 45').fit).toBe('uneven');
  });

  it('45 FPS on 120 Hz is 3,3,2 (16.7 / 25 ms)', () => {
    expect(fixedCadencePattern(45, 120)).toEqual([3, 3, 2]);
    const c = computeCadence(45, fixed(120), 'cap 45');
    expect(c.fit).toBe('uneven');
    expect(c.label).toBe('Fixed 120 Hz - cap 45 - uneven cadence 3:3:2');
  });

  it('40 on 120 Hz is even (3) and 48 on 120 Hz is 3,2', () => {
    expect(computeCadence(40, fixed(120), 'cap 40').pattern).toEqual([3]);
    expect([...fixedCadencePattern(48, 120)].sort()).toEqual([2, 3]);
  });

  it('40 on 60 Hz is 2,1 and 48 on 60 Hz is 2,1,1,1', () => {
    expect([...fixedCadencePattern(40, 60)].sort()).toEqual([1, 2]);
    expect([...fixedCadencePattern(48, 60)].sort()).toEqual([1, 1, 1, 2]);
  });

  it('48 on a fixed 48 Hz panel is even', () => {
    expect(computeCadence(48, fixed(48), 'cap 48').fit).toBe('even');
  });

  it('60 FPS on 120 Hz shows every frame for 2 refreshes', () => {
    const c = computeCadence(60, fixed(120), 'cap 60');
    expect(c.pattern).toEqual([2]);
    expect(c.panelHz).toBe(120);
  });

  it('a cap above the refresh drops frames', () => {
    expect(computeCadence(90, fixed(60), 'cap 90').dropped).toBeGreaterThan(0);
  });
});

describe('ProMotion: discrete 4.17 ms granularity, not continuous VRR', () => {
  it('lists the evenly held rates 120, 80, 60, 48, 40, 34.3, 30, 26.7, 24 Hz', () => {
    expect(promotionRates().map((r) => Math.round(r * 10) / 10)).toEqual([120, 80, 60, 48, 40, 34.3, 30, 26.7, 24]);
  });

  it.each([
    [30, 8, '33.3'],
    [40, 6, '25.0'],
    [48, 5, '20.8'],
    [60, 4, '16.7'],
  ])('%i FPS is even at %i steps (%s ms)', (fps, steps, frameMs) => {
    const c = computeCadence(fps, promotion, `cap ${fps}`);
    expect(c.pattern).toEqual([steps]);
    expect(c.fit).toBe('even');
    expect(c.panelHz).toBeCloseTo(fps, 6);
    expect(cadenceDurationsMs(c)[0].toFixed(1)).toBe(frameMs);
  });

  it('45 FPS is at best 20.8 / 20.8 / 25.0 ms', () => {
    expect(promotionPattern(45)).toEqual([5, 5, 6]);
    const c = computeCadence(45, promotion, 'cap 45');
    expect(c.fit).toBe('uneven');
    expect(ms(c.pattern, c.tickHz)).toEqual(['20.8', '20.8', '25.0']);
    expect(c.label).toBe('ProMotion, 4.17 ms steps - cap 45 - uneven cadence 20.8 / 20.8 / 25.0 ms');
    // the average still matches 45 FPS
    expect(c.panelHz).toBeCloseTo(45, 6);
  });

  it('labels an even rate with the panel rate it holds', () => {
    expect(computeCadence(40, promotion, 'cap 40').label).toBe(
      'ProMotion, 4.17 ms steps - cap 40 - even cadence, 25.0 ms per frame (panel at 40 Hz)',
    );
  });
});

describe('HDMI VRR cadence (only after G6-1)', () => {
  it('60 FPS is inside the 48-120 range', () => {
    const c = computeCadence(60, vrr, 'cap 60');
    expect(c.mode).toBe('vrr-native');
    expect(c.fit).toBe('VRR');
    expect(c.panelHz).toBe(60);
  });

  it('45 FPS is below the 48 Hz floor and is doubled by the host to 90 Hz', () => {
    const c = computeCadence(45, vrr, 'cap 45');
    expect(c.mode).toBe('vrr-lfc');
    expect(c.fit).toBe('VRR');
    expect(c.pattern).toEqual([2]);
    expect(c.panelHz).toBe(90);
    expect(c.label).toBe('HDMI VRR 48-120 Hz - cap 45 - VRR, panel at 90 Hz (host frame doubling x2)');
  });

  it('30 FPS is doubled to 60 Hz', () => {
    expect(computeCadence(30, vrr, 'cap 30').panelHz).toBe(60);
  });

  it('below the range without frame doubling falls back to an uneven cadence', () => {
    const c = computeCadence(45, { kind: 'vrr', range: { min: 48, max: 120, lfc: false }, name: 'VRR' }, 'cap 45');
    expect(c.mode).toBe('vrr-outside');
    expect(c.fit).toBe('uneven');
  });
});

describe('simulated frame times and statistics', () => {
  it('is deterministic for a seed', () => {
    const input = { seed: 7, capFps: 45, workloadMs: 20, jitter: 0.05, coldCache: true };
    expect(simulateFrames(input, 50)).toEqual(simulateFrames(input, 50));
  });

  it('a cold cache produces shader spikes', () => {
    const cold = simulateFrames({ seed: 3, capFps: 30, workloadMs: 20, jitter: 0.05, coldCache: true }, 2000);
    const warm = simulateFrames({ seed: 3, capFps: 30, workloadMs: 20, jitter: 0.05, coldCache: false }, 2000);
    const big = (f: { ms: number }[]) => f.filter((x) => x.ms > 60).length;
    expect(big(cold)).toBeGreaterThan(big(warm));
    expect(cold.some((f) => f.shader)).toBe(true);
  });

  it('computes average FPS, 1% low and p99 correctly', () => {
    const times = Array.from({ length: 100 }, (_, i) => (i === 99 ? 100 : 20));
    const s = frameStats(times);
    expect(s.avgFps).toBeCloseTo((1000 * 100) / (99 * 20 + 100), 6);
    expect(s.low1Fps).toBeCloseTo(10, 6);
    expect(s.p99Ms).toBe(20);
    expect(s.stutters).toBe(1);
  });
});
