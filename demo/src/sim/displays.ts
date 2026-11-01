/**
 * Display profiles used by the demo.
 *
 * Every number is a spec-sheet or example value with a source and a status.
 * Nothing here was detected from real hardware.
 */

export type ValueStatus = 'spec' | 'example - to be measured' | 'unverified' | 'unknown - to verify';

export interface SourcedValue<T> {
  value: T;
  status: ValueStatus;
  source: string;
}

export type VrrState = 'Verified (simulated)' | 'Unverified' | 'Not available' | 'Not continuous VRR';

export interface VrrConnection {
  id: string;
  label: string;
  connection: string;
  state: VrrState;
  /** What the connection can do, as text (range, step grid or "fixed refresh only"). */
  range: string;
  note: string;
  /** Gate that settles the state (ADR 0003). */
  gate: string;
  role: 'target' | 'control case';
}

/**
 * The output container for both displays (ADR 0002 D3): RGBA16F with an
 * extended-linear sRGB colour space. Wide-gamut colours are carried as values
 * outside 0-1, EDRMetadata stays nil and Luma does its own tone mapping.
 */
export const OUTPUT_CONTAINER = 'RGBA16F extended-linear sRGB';
export const OUTPUT_CONTAINER_LONG = 'RGBA16F + EXTENDED_SRGB_LINEAR (wide gamut carried as values outside 0-1)';
export const OUTPUT_RULES = 'EDRMetadata nil, app-side tone mapping';

/** UI white = paper white x UI scale (ADR 0002 D9): default 0.85, range 0.6-1.0. */
export const UI_SCALE_DEFAULT = 0.85;
export const UI_SCALE_MIN = 0.6;
export const UI_SCALE_MAX = 1;

/** ADR 0005, shown in Calibrate and Help. */
export const DOLBY_VISION_STATEMENT = 'Dolby Vision: not supported (no macOS signalling path; licensed SDK). HDR10 / EDR only.';

export interface DisplayProfile {
  id: 'macbook' | 'a95l';
  name: string;
  shortName: string;
  connection: string;
  panel: string;
  /** How the EDR output reaches the panel. */
  signalPath: string;
  bitDepth: SourcedValue<string>;
  sustainedFullScreenNits: SourcedValue<number>;
  peakNits: SourcedValue<number>;
  /** black floor used by the demo's clipping indicator (nits) */
  blackFloorNits: SourcedValue<number>;
  maxRefreshHz: SourcedValue<number>;
  gamut: SourcedValue<string>;
  /**
   * Simulated EDR headroom ceiling; 1.0 = paper white. Only for EDR (relative)
   * outputs. HDR10 PQ is absolute, so it has no fixed ratio: its headroom is
   * derived as peak / paper white.
   */
  potentialHeadroom: SourcedValue<number> | null;
  /** Highest peak the renderer will request for this profile, in nits. */
  peakCeilingNits: SourcedValue<number>;
  defaultPaperWhite: number;
  blooming: 'mini-LED local dimming' | 'per-pixel (OLED)';
  /** Where the simulated panel actually clips in the peak test (demo only). */
  simulatedClipNits: number;
}

const APPLE_SPEC = 'Apple MacBook Pro (M4 Pro) technical specifications, Liquid Retina XDR display';
const SONY_EXAMPLE = 'Example from third-party reviews of the A95L, to be measured by the owner';

export const MACBOOK: DisplayProfile = {
  id: 'macbook',
  name: 'MacBook Pro 16-inch - Liquid Retina XDR (built-in)',
  shortName: 'MacBook XDR',
  connection: 'Built-in',
  panel: 'mini-LED, local dimming',
  signalPath: 'EDR on the built-in panel',
  bitDepth: { value: 'RGBA16F (16-bit float), planned', status: 'example - to be measured', source: 'Planned swapchain format (ADR 0002); the current emulator path is 8-bit' },
  sustainedFullScreenNits: { value: 1000, status: 'spec', source: APPLE_SPEC },
  peakNits: { value: 1600, status: 'spec', source: APPLE_SPEC + ' (HDR content only)' },
  blackFloorNits: { value: 0.005, status: 'example - to be measured', source: 'Demo assumption for mini-LED; blooming raises it near highlights' },
  maxRefreshHz: { value: 120, status: 'spec', source: APPLE_SPEC + ' (ProMotion up to 120 Hz)' },
  gamut: { value: 'Display P3 (wide colour)', status: 'spec', source: APPLE_SPEC },
  potentialHeadroom: { value: 16, status: 'example - to be measured', source: 'Example: macOS reports the potential EDR headroom per display at run time' },
  peakCeilingNits: { value: 1600, status: 'spec', source: APPLE_SPEC + ' (HDR content only)' },
  defaultPaperWhite: 203,
  blooming: 'mini-LED local dimming',
  simulatedClipNits: 1600,
};

export const A95L: DisplayProfile = {
  id: 'a95l',
  name: 'Sony A95L (QD-OLED) over HDMI',
  shortName: 'Sony A95L',
  connection: 'HDMI 2.1 (TV port HDMI 3 or 4, Enhanced format)',
  panel: 'QD-OLED, per-pixel light',
  signalPath: 'macOS converts EDR to HDR10 (PQ) over HDMI',
  bitDepth: { value: 'HDR10 over HDMI, depth set by macOS', status: 'unknown - to verify', source: 'Depends on the macOS HDMI output mode chosen at run time (gate G-DISP)' },
  sustainedFullScreenNits: { value: 250, status: 'example - to be measured', source: SONY_EXAMPLE + ' (full-field)' },
  peakNits: { value: 1300, status: 'example - to be measured', source: SONY_EXAMPLE + ' (10% window)' },
  blackFloorNits: { value: 0.0005, status: 'example - to be measured', source: 'OLED pixels switch off; near-black handling still needs a check' },
  maxRefreshHz: { value: 120, status: 'spec', source: 'Sony A95L specification: HDMI 2.1, 4K 120 Hz' },
  gamut: { value: 'Wide (close to P3); BT.2020 container', status: 'example - to be measured', source: SONY_EXAMPLE },
  potentialHeadroom: null,
  peakCeilingNits: { value: 1300, status: 'example - to be measured', source: SONY_EXAMPLE },
  defaultPaperWhite: 203,
  blooming: 'per-pixel (OLED)',
  simulatedClipNits: 1300,
};

export const DISPLAYS: Record<DisplayProfile['id'], DisplayProfile> = { macbook: MACBOOK, a95l: A95L };

/** All connections shown on the Performance view, including non-targets. */
export function vrrConnections(vrrVerified: boolean): VrrConnection[] {
  return [
    {
      id: 'macbook-promotion',
      label: 'MacBook Pro built-in display',
      connection: 'Built-in (ProMotion)',
      state: 'Not continuous VRR',
      range: '4.17 ms steps, 8.33-41.67 ms',
      note: 'Frame times snap to a 4.17 ms grid (120, 80, 60, 48, 40, 34.3, 30 Hz ...), so 40 and 48 pace evenly and 45 does not. A macOS 27 beta report describes cadence switching between 120 and 60 Hz.',
      gate: 'G6-5 / G6-7',
      role: 'target',
    },
    {
      id: 'a95l-hdmi',
      label: 'Sony A95L',
      connection: 'HDMI 2.1 from the Mac (HDMI 3 or 4, Enhanced format)',
      state: vrrVerified ? 'Verified (simulated)' : 'Unverified',
      range: '48-120 Hz reported; host frame doubling below 48',
      note: vrrVerified
        ? 'Simulated pass of G6-1: the VRR menu row (30, 45, 60) is offered on the A95L.'
        : 'Apple documents conflict on HDMI VRR and no Sony report was found. Until G6-1 passes, the A95L uses the fixed 120 Hz or 60 Hz menu.',
      gate: 'G6-1',
      role: 'target',
    },
    {
      id: 'a95l-adapter',
      label: 'Sony A95L via a USB-C to HDMI 2.0 adapter',
      connection: 'HDMI 2.0 adapter (example)',
      state: 'Not available',
      range: 'fixed refresh only',
      note: 'Example of a connection without VRR: the menu of its fixed refresh rate applies.',
      gate: '-',
      role: 'target',
    },
    {
      id: 'msi-dp',
      label: 'MSI 4K monitor over DisplayPort',
      connection: 'DisplayPort Adaptive-Sync',
      state: 'Unverified',
      range: 'range to be read (example)',
      note: 'Not a target. Useful later as a known-good Adaptive-Sync control case for timed presents.',
      gate: 'G6-9 (optional)',
      role: 'control case',
    },
  ];
}

export const SDR_REFERENCE_WHITE = 203; // BT.2408 HDR reference white, used as the default paper white
export const SDR_REFERENCE_100 = 100; // classic SDR reference (BT.1886 era)
