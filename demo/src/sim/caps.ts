/**
 * Frame caps per display and panel mode, as decided in ADR 0003 §1-2.
 *
 * A cap is a guest vsync rate combined with the D2 measured-time patch.
 * Without D2 only "30 (native)" is offered. While D2 is active, Unbounded,
 * turbo and caps above 60 are refused, so there is no "unlocked" option.
 * 60 stays experimental until gate G-60 passes. 45 is selectable everywhere,
 * with a cadence warning unless HDMI VRR is verified (gate G6-1).
 */
import type { DisplayProfile } from './displays';
import { computeCadence } from './pacing';
import type { CadenceFit, PanelTiming } from './pacing';

export type CapFps = 30 | 40 | 45 | 48 | 60;
export type PanelModeId = 'promotion' | 'fixed120' | 'fixed60' | 'fixed48' | 'vrr';
type DisplayId = DisplayProfile['id'];

/** The reported VRR range of the A95L over HDMI [A]; unverified on macOS until G6-1. */
export const A95L_VRR_RANGE = { min: 48, max: 120, lfc: true } as const;

export interface PanelMode {
  id: PanelModeId;
  /** Menu label. */
  label: string;
  /** Name used at the start of the presentation label. */
  name: string;
  timing: PanelTiming;
}

const MODES: Record<DisplayId, PanelMode[]> = {
  macbook: [
    { id: 'promotion', label: 'ProMotion (fullscreen)', name: 'ProMotion, 4.17 ms steps', timing: { kind: 'promotion', name: 'ProMotion, 4.17 ms steps' } },
    { id: 'fixed60', label: 'Fixed 60 Hz', name: 'Fixed 60 Hz', timing: { kind: 'fixed', hz: 60, name: 'Fixed 60 Hz' } },
    { id: 'fixed48', label: 'Fixed 48 Hz', name: 'Fixed 48 Hz', timing: { kind: 'fixed', hz: 48, name: 'Fixed 48 Hz' } },
  ],
  a95l: [
    { id: 'fixed120', label: 'Fixed 120 Hz', name: 'Fixed 120 Hz', timing: { kind: 'fixed', hz: 120, name: 'Fixed 120 Hz' } },
    { id: 'fixed60', label: 'Fixed 60 Hz', name: 'Fixed 60 Hz', timing: { kind: 'fixed', hz: 60, name: 'Fixed 60 Hz' } },
    {
      id: 'vrr',
      label: 'HDMI VRR',
      name: 'HDMI VRR 48-120 Hz',
      timing: { kind: 'vrr', range: { ...A95L_VRR_RANGE }, name: 'HDMI VRR 48-120 Hz' },
    },
  ],
};

export const DEFAULT_PANEL_MODE: Record<DisplayId, PanelModeId> = { macbook: 'promotion', a95l: 'fixed120' };

/** The panel modes a display offers. The A95L VRR mode needs the simulated G6-1 pass. */
export function panelModes(display: DisplayId): PanelMode[] {
  return MODES[display];
}

/** Whether a panel mode can be used right now. */
export function panelModeAvailable(display: DisplayId, mode: PanelModeId, vrrVerified: boolean): boolean {
  if (!MODES[display].some((m) => m.id === mode)) return false;
  return mode !== 'vrr' || vrrVerified;
}

/** The panel mode in effect: an unavailable choice falls back to the display's default. */
export function resolvePanelMode(display: DisplayId, requested: PanelModeId, vrrVerified: boolean): PanelMode {
  const id = panelModeAvailable(display, requested, vrrVerified) ? requested : DEFAULT_PANEL_MODE[display];
  return MODES[display].find((m) => m.id === id) ?? MODES[display][0];
}

export type CapChip = 'Native' | 'Experimental' | 'Cadence warning' | 'VRR' | null;

export interface CapOption {
  fps: CapFps;
  /** Menu label, for example "60 (experimental)" or "30 (native)". */
  label: string;
  /** How the cap paces on this panel mode. */
  fit: CadenceFit;
  chip: CapChip;
  /** Cadence warning for 45 without verified VRR. */
  warning: string | null;
  /** Evenly paced neighbours suggested instead of an uneven cap. */
  suggest: CapFps[];
}

interface MenuRule {
  offered: CapFps[];
  /** 45 behaviour: null = not offered; otherwise its warning and suggestions, or 'smooth' with verified VRR. */
  fortyFive: { warning: string; suggest: CapFps[] } | 'smooth' | null;
}

/** ADR 0003 §2, row by row. */
const RULES: Record<DisplayId, Partial<Record<PanelModeId, MenuRule>>> = {
  macbook: {
    promotion: { offered: [30, 40, 48, 60], fortyFive: { warning: '20.8 / 20.8 / 25.0 ms', suggest: [40, 48] } },
    fixed60: { offered: [30, 60], fortyFive: { warning: '2,1,1', suggest: [30] } },
    fixed48: { offered: [48], fortyFive: null },
  },
  a95l: {
    fixed120: { offered: [30, 40, 60], fortyFive: { warning: '3,3,2', suggest: [40] } },
    fixed60: { offered: [30, 60], fortyFive: { warning: '2,1,1', suggest: [30] } },
    vrr: { offered: [30, 45, 60], fortyFive: 'smooth' },
  },
};

export const NATIVE_CAP_LABEL = '30 (native)';

function joinOr(caps: CapFps[]): string {
  return caps.length > 1 ? `${caps.slice(0, -1).join(', ')} or ${caps[caps.length - 1]}` : String(caps[0]);
}

/**
 * The caps offered for a display, panel mode and D2 state, in ascending order.
 * Without D2 this is only "30 (native)".
 */
export function capMenu(display: DisplayId, mode: PanelMode, d2: boolean): CapOption[] {
  if (!d2) {
    const fit = computeCadence(30, mode.timing, NATIVE_CAP_LABEL).fit;
    return [{ fps: 30, label: NATIVE_CAP_LABEL, fit, chip: 'Native', warning: null, suggest: [] }];
  }
  const rule = RULES[display][mode.id];
  if (!rule) return [];
  const fpsList: CapFps[] = [...rule.offered];
  if (rule.fortyFive && rule.fortyFive !== 'smooth') fpsList.push(45);
  fpsList.sort((a, b) => a - b);
  return fpsList.map((fps) => {
    const fit = computeCadence(fps, mode.timing, `cap ${fps}`).fit;
    const ff = fps === 45 && rule.fortyFive && rule.fortyFive !== 'smooth' ? rule.fortyFive : null;
    const experimental = fps === 60;
    return {
      fps,
      label: experimental ? '60 (experimental)' : String(fps),
      fit,
      chip: ff ? 'Cadence warning' : experimental ? 'Experimental' : fit === 'VRR' ? 'VRR' : null,
      warning: ff ? `Cadence warning: 45 on this panel paces ${ff.warning}. Try ${joinOr(ff.suggest)}.` : null,
      suggest: ff ? ff.suggest : [],
    };
  });
}

/** The cap in effect: the requested one if offered, else 40, 30 or the first offered. */
export function resolveCap(menu: CapOption[], requested: CapFps): CapOption {
  return (
    menu.find((o) => o.fps === requested) ??
    menu.find((o) => o.fps === 40) ??
    menu.find((o) => o.fps === 30) ??
    menu[0]
  );
}

export function capText(option: CapOption): string {
  return option.chip === 'Native' ? NATIVE_CAP_LABEL : `cap ${option.fps}`;
}
