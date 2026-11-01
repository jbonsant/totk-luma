import { describe, expect, it } from 'vitest';
import { SOURCE_MODE_LABELS, activeStages, simulatedSourceMode } from './source';

describe('source modes (ADR 0002 D3)', () => {
  it('uses the three ADR names', () => {
    expect(SOURCE_MODE_LABELS).toEqual({
      scene: 'Scene HDR (tonemap replaced, planned P3)',
      expanded: 'Expanded SDR (inverse tonemap fallback)',
      sdr: 'SDR (as the game outputs)',
    });
  });

  it('simulates Scene HDR with HDR on and SDR with it off, never Expanded SDR', () => {
    expect(simulatedSourceMode(true)).toBe('scene');
    expect(simulatedSourceMode(false)).toBe('sdr');
  });

  it('runs both look stages only with scene HDR; otherwise looks are approximate (ADR 0006)', () => {
    expect(activeStages('scene')).toMatchObject({ stages: ['scene', 'display'], approximate: false });
    expect(activeStages('expanded')).toMatchObject({ stages: ['display'], approximate: true });
    expect(activeStages('sdr').label).toBe('Display stage only (approximate)');
  });
});
