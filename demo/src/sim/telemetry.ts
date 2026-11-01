/**
 * Simulated performance model. The numbers are invented for the demo; their
 * shape loosely follows the prior local measurements (GPU-bound in open sky,
 * CPU-bound in dense interiors, about 45-50 FPS with the D2 timing patch at
 * 1.2x). They are not predictions.
 */
import { DEFAULT_PANEL_MODE, capMenu, capText, resolveCap, resolvePanelMode } from './caps';
import type { CapFps, CapOption, PanelMode, PanelModeId } from './caps';
import type { DisplayProfile } from './displays';
import { computeCadence } from './pacing';
import type { Cadence } from './pacing';

export type ResolutionScale = 1 | 1.2 | 1.5 | 2;
type DisplayId = DisplayProfile['id'];

export interface PerfSettings {
  /** Requested cap; the cap in effect is resolved against the menu for the display and mode. */
  cap: CapFps;
  /** Panel mode chosen per display. */
  panelMode: Record<DisplayId, PanelModeId>;
  /** Simulated pass of gate G6-1 (HDMI VRR to the A95L verified). Off by default. */
  vrrVerified: boolean;
  resolution: ResolutionScale;
  coldCache: boolean;
  /** Hypervisor On with the A+B fix (validation pending, gate G-AB). */
  hypervisor: boolean;
  /** D2 timing patch present (owner-supplied, experimental). */
  timingPatch: boolean;
}

export const DEFAULT_PERF: PerfSettings = {
  cap: 40,
  panelMode: { ...DEFAULT_PANEL_MODE },
  vrrVerified: false,
  resolution: 1.2,
  coldCache: false,
  hypervisor: false,
  timingPatch: true,
};

export const RESOLUTIONS: { scale: ResolutionScale; label: string; pixels: string }[] = [
  { scale: 1, label: '1.0x', pixels: '1600 x 900 output' },
  { scale: 1.2, label: '1.2x', pixels: 'about 1080p (1921 x 1076 targets)' },
  { scale: 1.5, label: '1.5x', pixels: 'about 1350p' },
  { scale: 2, label: '2.0x', pixels: 'about 1800p' },
];

export interface Workload {
  cpuMs: number;
  gpuMs: number;
  gpuLoadPct: number;
  bound: 'CPU' | 'GPU';
}

export interface CapState {
  mode: PanelMode;
  menu: CapOption[];
  option: CapOption;
}

/** The panel mode, cap menu and cap in effect for a display. */
export function capState(s: PerfSettings, display: DisplayId): CapState {
  const mode = resolvePanelMode(display, s.panelMode[display], s.vrrVerified);
  const menu = capMenu(display, mode, s.timingPatch);
  return { mode, menu, option: resolveCap(menu, s.cap) };
}

/** Simulated per-frame cost for the demo scene ("open sky at golden hour"). */
export function simulatedWorkload(s: PerfSettings, capFps: number): Workload {
  const area = (s.resolution / 1.2) ** 2;
  let gpuMs = 6.5 + 13.5 * area; // about 20 ms at 1.2x
  let cpuMs = 18.2;
  if (s.hypervisor) cpuMs *= 0.78; // faster guest CPU path, but see the artifact warning
  if (s.coldCache) gpuMs *= 1.04;
  // the GPU is busy for gpuMs out of every frame interval; a lower cap leaves it idle longer
  const interval = Math.max(cpuMs, gpuMs, 1000 / capFps);
  return {
    cpuMs,
    gpuMs,
    gpuLoadPct: Math.min(100, Math.round((gpuMs / interval) * 100)),
    bound: gpuMs >= cpuMs ? 'GPU' : 'CPU',
  };
}

export interface PerfSummary {
  workload: Workload;
  cap: CapState;
  capFps: number;
  expectedFps: number;
  cadence: Cadence;
}

export function summarisePerf(s: PerfSettings, display: DisplayId): PerfSummary {
  const cap = capState(s, display);
  const capFps = cap.option.fps;
  const workload = simulatedWorkload(s, capFps);
  const frameMs = Math.max(workload.cpuMs, workload.gpuMs);
  const uncapped = 1000 / frameMs;
  const expectedFps = Math.min(capFps, uncapped);
  // pacing assumes the frame rate the game would settle at (rounded for display)
  const cadenceFps = uncapped >= capFps ? capFps : Math.round(expectedFps * 10) / 10;
  const label = uncapped >= capFps ? capText(cap.option) : `${capText(cap.option)}, running at ${cadenceFps} FPS`;
  const cadence = computeCadence(cadenceFps, cap.mode.timing, label);
  return { workload, cap, capFps, expectedFps, cadence };
}
