/**
 * Source modes and look stages, as named in ADR 0002 D3 and ADR 0006.
 *
 * The demo always renders its procedural scene from scene-linear values, so
 * with HDR on it simulates the planned Scene HDR tier (phase P3). The label
 * says so, so a calibrated image is never mistaken for genuine scene HDR.
 */

export type SourceMode = 'scene' | 'expanded' | 'sdr';

export const SOURCE_MODE_LABELS: Record<SourceMode, string> = {
  scene: 'Scene HDR (tonemap replaced, planned P3)',
  expanded: 'Expanded SDR (inverse tonemap fallback)',
  sdr: 'SDR (as the game outputs)',
};

/** The source mode the demo simulates: Scene HDR with HDR on, SDR with it off. Expanded SDR is never simulated. */
export function simulatedSourceMode(hdr: boolean): SourceMode {
  return hdr ? 'scene' : 'sdr';
}

/** Where a look runs (ADR 0006 §1). */
export type LookStage = 'scene' | 'display';

export const STAGE_LABELS: Record<LookStage, string> = {
  scene: 'Scene stage: scene-linear, before the tonemap',
  display: 'Display stage: in nits, after the tonemap',
};

export const STAGE_SHORT: Record<LookStage, string> = {
  scene: 'Scene stage',
  display: 'Display stage',
};

/** Which look stages run in a source mode. Only Scene HDR has scene values; otherwise looks are approximate. */
export function activeStages(mode: SourceMode): { stages: LookStage[]; approximate: boolean; label: string } {
  if (mode === 'scene') return { stages: ['scene', 'display'], approximate: false, label: 'Scene stage + display stage' };
  return { stages: ['display'], approximate: true, label: 'Display stage only (approximate)' };
}
