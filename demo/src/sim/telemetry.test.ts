import { describe, expect, it } from 'vitest';
import { DEFAULT_PERF, simulatedWorkload, summarisePerf } from './telemetry';

describe('simulated workload', () => {
  it('GPU load drops when the cap leaves the GPU idle', () => {
    const at40 = simulatedWorkload(DEFAULT_PERF, 40);
    const at30 = simulatedWorkload(DEFAULT_PERF, 30);
    expect(at30.gpuLoadPct).toBeLessThan(at40.gpuLoadPct);
    // about 20 ms of GPU work in a 33.3 ms frame
    expect(at30.gpuLoadPct).toBeGreaterThanOrEqual(55);
    expect(at30.gpuLoadPct).toBeLessThanOrEqual(65);
  });

  it('without the D2 patch the game holds 30 (native), whatever cap was asked for', () => {
    const s = summarisePerf({ ...DEFAULT_PERF, cap: 60, timingPatch: false }, 'macbook');
    expect(s.capFps).toBe(30);
    expect(s.cap.option.label).toBe('30 (native)');
    expect(s.cadence.label).toContain('30 (native)');
  });
});

describe('default state (ADR 0003)', () => {
  it('is built-in ProMotion, D2 on, cap 40, even cadence', () => {
    const s = summarisePerf(DEFAULT_PERF, 'macbook');
    expect(s.cap.mode.id).toBe('promotion');
    expect(DEFAULT_PERF.timingPatch).toBe(true);
    expect(s.capFps).toBe(40);
    expect(s.cadence.fit).toBe('even');
    expect(s.cadence.panelHz).toBeCloseTo(40, 6);
  });

  it('VRR is not verified by default', () => {
    expect(DEFAULT_PERF.vrrVerified).toBe(false);
    expect(summarisePerf({ ...DEFAULT_PERF, panelMode: { ...DEFAULT_PERF.panelMode, a95l: 'vrr' } }, 'a95l').cap.mode.id).toBe('fixed120');
  });
});

describe('presentation labels', () => {
  it('30 on fixed 60 reads as an even 2:2 cadence', () => {
    const s = summarisePerf({ ...DEFAULT_PERF, cap: 30, panelMode: { ...DEFAULT_PERF.panelMode, macbook: 'fixed60' } }, 'macbook');
    expect(s.cadence.label).toBe('Fixed 60 Hz - cap 30 - even cadence 2:2');
  });

  it('45 under verified HDMI VRR names the doubled panel rate', () => {
    const s = summarisePerf({ ...DEFAULT_PERF, cap: 45, vrrVerified: true, panelMode: { ...DEFAULT_PERF.panelMode, a95l: 'vrr' } }, 'a95l');
    expect(s.cadence.panelHz).toBe(90);
    expect(s.cadence.fit).toBe('VRR');
  });

  it('a cap the scene cannot reach paces at the real frame rate and says so', () => {
    const s = summarisePerf({ ...DEFAULT_PERF, cap: 60 }, 'macbook');
    expect(s.expectedFps).toBeLessThan(60);
    expect(s.cadence.label).toContain('cap 60, running at');
  });
});
