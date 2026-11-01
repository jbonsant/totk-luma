/**
 * Visual presets for the simulated grading pipeline.
 */

export type GamutMode = 'bt709' | 'vivid';
export type PresetId = 'faithful' | 'natural' | 'vivid' | 'clearAir' | 'custom';

export interface VisualSettings {
  /** HDR output on; off means a faithful SDR image clipped at paper white. */
  hdr: boolean;
  /** Exposure offset in stops. */
  exposure: number;
  /** Display stage: chroma multiplier for output highlights above paper white, in nits after the tonemap (1 = neutral). */
  highlightSaturation: number;
  /** Scene stage: vibrance, a saturation boost weighted towards muted colours (0 = neutral). */
  vibrance: number;
  /** Scene stage: contrast around 18% of paper white, in log space (1 = neutral). */
  contrast: number;
  /** 0..1 strength of the built-in defog (scene stage in the simulation; a display-stage approximation in the app before P3). */
  hazeReduction: number;
  /** Display stage: 0..1 strength of the post-tonemap sharpen pass. */
  sharpening: number;
  gamut: GamutMode;
}

export interface Preset {
  id: PresetId;
  name: string;
  summary: string;
  note?: string;
  settings: VisualSettings;
}

export const NEUTRAL: VisualSettings = {
  hdr: true,
  exposure: 0,
  highlightSaturation: 1,
  vibrance: 0,
  contrast: 1,
  hazeReduction: 0,
  sharpening: 0,
  gamut: 'bt709',
};

export const PRESETS: Preset[] = [
  {
    id: 'faithful',
    name: 'Faithful SDR',
    summary: 'The game as it ships on Switch 1: SDR, BT.709, highlights clip at paper white.',
    settings: { ...NEUTRAL, hdr: false },
  },
  {
    id: 'natural',
    name: 'Luma HDR Natural',
    summary: 'Scene HDR kept before the clip, soft roll-off to your display peak, BT.709 colours.',
    settings: { ...NEUTRAL, highlightSaturation: 0.95, sharpening: 0.15 },
  },
  {
    id: 'vivid',
    name: 'Luma HDR Vivid',
    summary: 'Natural plus an expanded-gamut look and extra vibrance. Not faithful to the original grade.',
    settings: { ...NEUTRAL, highlightSaturation: 1.1, vibrance: 0.35, contrast: 1.08, sharpening: 0.2, gamut: 'vivid' },
  },
  {
    id: 'clearAir',
    name: 'Clear Air',
    summary: 'Less distance haze. Natural HDR with a defog look.',
    note: 'Uses the Serfrost Base Defogger v2.4 mod if you install it yourself (never bundled). Otherwise a built-in display-stage approximation.',
    settings: { ...NEUTRAL, hazeReduction: 0.7, contrast: 1.04, vibrance: 0.1, sharpening: 0.2 },
  },
  {
    id: 'custom',
    name: 'Custom',
    summary: 'Your own slider values, saved per display profile.',
    settings: { ...NEUTRAL },
  },
];

export function presetById(id: PresetId): Preset {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown preset ${id}`);
  return p;
}

/** Simulated GPU cost, in milliseconds per frame at 1.2x internal resolution. */
export function simulatedCostMs(s: VisualSettings, resolutionScale = 1.2): { label: string; ms: number }[] {
  const area = (resolutionScale / 1.2) ** 2;
  const rows: { label: string; ms: number }[] = [
    { label: 'HDR capture and tone map', ms: s.hdr ? 0.35 * area : 0.05 * area },
    { label: 'Scene stage: exposure, contrast, vibrance', ms: 0.12 * area },
    { label: 'Defog (built-in)', ms: s.hazeReduction > 0 ? (0.18 + 0.12 * s.hazeReduction) * area : 0 },
    { label: 'Display stage: sharpen pass', ms: s.sharpening > 0 ? (0.2 + 0.25 * s.sharpening) * area : 0 },
    { label: 'Gamut expansion (vivid)', ms: s.gamut === 'vivid' ? 0.04 * area : 0 },
  ];
  return rows.map((r) => ({ ...r, ms: Math.round(r.ms * 100) / 100 }));
}
