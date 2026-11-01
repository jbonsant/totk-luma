/**
 * App state for the demo. Everything is simulated and stays in this browser.
 */
import { DISPLAYS, UI_SCALE_DEFAULT } from '../sim/displays';
import type { DisplayProfile } from '../sim/displays';
import type { PipelineSettings } from '../sim/pipeline';
import { PRESETS, presetById } from '../sim/presets';
import type { PresetId, VisualSettings } from '../sim/presets';
import { DEFAULT_PERF } from '../sim/telemetry';
import type { PerfSettings } from '../sim/telemetry';
import type { CurveId } from '../sim/tonemap';

export type ViewId = 'play' | 'calibrate' | 'performance' | 'visuals' | 'controller' | 'help';
export type MenuViewId = Exclude<ViewId, 'play'>;
export type DisplayId = DisplayProfile['id'];

export const MENU_VIEWS: { id: MenuViewId; label: string; hint: string }[] = [
  { id: 'calibrate', label: 'Calibrate', hint: 'Display profiles and HDR set-up' },
  { id: 'performance', label: 'Performance', hint: 'Frame cap, pacing, backend' },
  { id: 'visuals', label: 'Visuals', hint: 'Presets and grading' },
  { id: 'controller', label: 'Controller', hint: 'DualSense and automation' },
  { id: 'help', label: 'Help', hint: 'Troubleshooting and about' },
];

export const VIEW_IDS: ViewId[] = ['play', 'calibrate', 'performance', 'visuals', 'controller', 'help'];

/**
 * Owner-entered instrument readings (label class "measured"). ADR 0002 D9 asks
 * for the instrument, the window size and the date with every reading.
 */
export interface Measured {
  white: number | null;
  peak: number | null;
  black: number | null;
  /** Date of the readings (YYYY-MM-DD), required context for a measured value. */
  date: string | null;
  /** Instrument used, for example a colorimeter model and its correction, as the owner types it. */
  instrument: string | null;
}

/** The context every measured reading carries after its window size: date, then instrument. */
export function measuredContext(m: Pick<Measured, 'date' | 'instrument'>): string {
  const instrument = m.instrument?.trim();
  return `${m.date ?? 'date not entered'}, ${instrument ? instrument : 'instrument not entered'}`;
}

/** Window size of each measured patch, shown with every reading. */
export const MEASURED_WINDOWS: Record<'white' | 'peak' | 'black', string> = {
  white: '10% window',
  peak: '10% window',
  black: 'full field',
};

export interface Calibration {
  paperWhite: number;
  /** UI white = paper white x uiScale (ADR 0002 D9), default 0.85, range 0.6-1.0. */
  uiScale: number;
  peak: number;
  /** True once the owner has used the peak test (step c); until then `peak` is the profile default. */
  peakTested: boolean;
  black: number;
  curve: CurveId;
  knee: number;
  sourceMax: number;
  measured: Measured;
  savedAt: string | null;
}

export interface DashboardState {
  open: boolean;
  layout: 'compact' | 'full';
  zebra: boolean;
  falseColor: boolean;
  source: 'scene' | 'output';
}

export interface ControllerState {
  connection: 'usb' | 'bluetooth';
  connected: boolean;
  layout: 'positions' | 'labels';
  gyroSensitivity: number;
  aimOnlyZL: boolean;
  touchpad: 'capture' | 'halves' | 'off';
  rumble: number;
  agentPad: boolean;
  /** Owner wins: physical input latched the agent ESTOP; the virtual pad stays neutral until an explicit resume. */
  agentEstop: boolean;
  /** Proposed owner option (no ADR decides it): pause emulation while Player 1's pad is disconnected. */
  pauseOnDisconnect: boolean;
}

export interface AppState {
  display: DisplayId;
  calib: Record<DisplayId, Calibration>;
  preset: PresetId;
  visual: VisualSettings;
  haze: number;
  perf: PerfSettings;
  dashboard: DashboardState;
  controller: ControllerState;
}

function defaultCalibration(d: DisplayProfile): Calibration {
  return {
    paperWhite: d.defaultPaperWhite,
    uiScale: UI_SCALE_DEFAULT,
    peak: d.peakNits.value,
    peakTested: false,
    black: d.blackFloorNits.value,
    curve: 'lumaKnee',
    knee: 0.6,
    sourceMax: 10000,
    measured: { white: null, peak: null, black: null, date: null, instrument: null },
    savedAt: null,
  };
}

export const DEFAULT_STATE: AppState = {
  display: 'macbook',
  calib: { macbook: defaultCalibration(DISPLAYS.macbook), a95l: defaultCalibration(DISPLAYS.a95l) },
  preset: 'natural',
  visual: { ...presetById('natural').settings },
  haze: 0.35,
  perf: { ...DEFAULT_PERF },
  dashboard: { open: false, layout: 'full', zebra: false, falseColor: false, source: 'scene' },
  controller: {
    connection: 'usb',
    connected: true,
    layout: 'positions',
    gyroSensitivity: 1,
    aimOnlyZL: true,
    touchpad: 'capture',
    rumble: 0.7,
    agentPad: false,
    agentEstop: false,
    pauseOnDisconnect: false,
  },
};

// v2: caps, panel modes and labels follow ADR 0001-0006; v1 settings are not carried over
const STORAGE_KEY = 'totk-luma-demo:v2';

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Shallow-merge stored values over defaults, keeping only known keys and types. */
function mergeKnown<T extends object>(base: T, stored: unknown): T {
  if (!isObject(stored)) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(base as Record<string, unknown>)) {
    const sv = stored[k];
    if (sv === undefined) continue;
    if (isObject(v)) out[k] = mergeKnown(v, sv);
    else if (v === null || typeof sv === typeof v) out[k] = sv;
  }
  return out as T;
}

export function loadState(): AppState {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (!raw) return structuredClone(DEFAULT_STATE);
  try {
    const parsed: unknown = JSON.parse(raw);
    const merged = mergeKnown(structuredClone(DEFAULT_STATE), parsed);
    // never start with the dashboard open or the controller disconnected
    merged.dashboard.open = false;
    merged.controller.connected = true;
    if (!PRESETS.some((p) => p.id === merged.preset)) merged.preset = 'natural';
    return merged;
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

export function saveState(s: AppState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // storage may be blocked (private mode, file://); the demo still works
  }
}

export function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(`totk-luma-demo:${key}`) === '1';
  } catch {
    return false;
  }
}

export function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(`totk-luma-demo:${key}`, value ? '1' : '0');
  } catch {
    // ignore
  }
}

// --- derived values ---------------------------------------------------------

export type PeakLimit = 'calibrated' | 'panel' | 'edr-headroom';

export interface HeadroomInfo {
  display: DisplayProfile;
  paperWhite: number;
  /** UI white in nits: paper white x UI scale. */
  uiWhite: number;
  /** EDR headroom available right now (1.0 = paper white); for HDR10 it is derived as peak / paper white. */
  headroomNow: number;
  /** Headroom ceiling: the EDR potential, or for HDR10 the panel ceiling / paper white. */
  headroomPotential: number;
  /** What the renderer asks the panel for at most (nits). */
  computedPeak: number;
  /** Which limit set `computedPeak`. */
  limitedBy: PeakLimit;
}

/**
 * Peak the renderer requests.
 *
 * - HDR10 PQ is absolute: peak = min(calibrated peak, panel ceiling in nits).
 *   Paper white does not change it.
 * - EDR is relative to paper white: the peak is also limited by the EDR
 *   headroom macOS offers (paper white x potential headroom).
 */
export function headroomFrom(displayId: DisplayId, cal: Calibration): HeadroomInfo {
  const display = DISPLAYS[displayId];
  const paperWhite = cal.paperWhite;
  const ceiling = display.peakCeilingNits.value;
  let computedPeak = cal.peak;
  let limitedBy: PeakLimit = 'calibrated';
  if (ceiling < computedPeak) {
    computedPeak = ceiling;
    limitedBy = 'panel';
  }
  let headroomPotential = ceiling / paperWhite;
  if (display.potentialHeadroom) {
    headroomPotential = display.potentialHeadroom.value;
    const edrLimit = paperWhite * headroomPotential;
    if (edrLimit < computedPeak) {
      computedPeak = edrLimit;
      limitedBy = 'edr-headroom';
    }
  }
  computedPeak = Math.max(paperWhite, Math.round(computedPeak));
  const headroomNow = computedPeak / paperWhite;
  const uiWhite = paperWhite * cal.uiScale;
  return { display, paperWhite, uiWhite, headroomNow, headroomPotential, computedPeak, limitedBy };
}

export function headroomInfo(state: AppState): HeadroomInfo {
  return headroomFrom(state.display, state.calib[state.display]);
}

export function pipelineFrom(displayId: DisplayId, calib: AppState['calib'], visual: VisualSettings): PipelineSettings {
  const cal = calib[displayId];
  const hr = headroomFrom(displayId, cal);
  return {
    visual,
    display: { peak: hr.computedPeak, paperWhite: cal.paperWhite, black: cal.black },
    curve: cal.curve,
    knee: cal.knee,
    sourceMax: cal.sourceMax,
  };
}

export function pipelineFor(state: AppState, visual: VisualSettings = state.visual): PipelineSettings {
  return pipelineFrom(state.display, state.calib, visual);
}

export function faithfulPipeline(state: AppState): PipelineSettings {
  return pipelineFor(state, { ...presetById('faithful').settings });
}
