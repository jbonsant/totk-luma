/**
 * Frame pacing model: how game frames land on display refreshes, plus
 * simulated frame times and their statistics.
 */

export interface VrrRange {
  min: number;
  max: number;
  /** Host low framerate compensation: repeat frames to stay inside the range. */
  lfc: boolean;
}

/**
 * ProMotion on the built-in display is not continuous VRR. Frame durations
 * snap to a 4.17 ms grid (1/240 s) between 8.33 and 41.67 ms, so the rates it
 * can hold evenly are 120, 80, 60, 48, 40, 34.3, 30, 26.7 and 24 Hz
 * (ADR 0003, probe [M] and Apple's rule [D]).
 */
export const PROMOTION_GRID_HZ = 240;
export const PROMOTION_MIN_STEPS = 2;
export const PROMOTION_MAX_STEPS = 10;
export const PROMOTION_STEP_MS = 1000 / PROMOTION_GRID_HZ;

/** Rates ProMotion can hold with every frame the same length, highest first. */
export function promotionRates(): number[] {
  const out: number[] = [];
  for (let n = PROMOTION_MIN_STEPS; n <= PROMOTION_MAX_STEPS; n++) out.push(PROMOTION_GRID_HZ / n);
  return out;
}

/** How presents can land on the panel. */
export type PanelTiming =
  | { kind: 'fixed'; hz: number; name: string }
  | { kind: 'promotion'; name: string }
  | { kind: 'vrr'; range: VrrRange; name: string };

export type CadenceMode = 'fixed' | 'promotion' | 'vrr-native' | 'vrr-lfc' | 'vrr-outside';

/** The cadence fit shown in the dashboard (ADR 0003 §2). */
export type CadenceFit = 'even' | 'uneven' | 'VRR';

export interface Cadence {
  mode: CadenceMode;
  fit: CadenceFit;
  /**
   * The time grid presents land on (Hz): the refresh rate on a fixed panel or
   * under VRR, and the 4.17 ms step grid (240 per second) on ProMotion.
   */
  tickHz: number;
  /** Refreshes the panel shows per second, on average. */
  panelHz: number;
  /** Grid ticks each game frame stays on screen, for one repeating cycle. */
  pattern: number[];
  /** True when every frame is on screen for the same time. */
  even: boolean;
  /** Frames dropped per cycle (cap above refresh on a fixed display). */
  dropped: number;
  label: string;
  short: string;
}

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

/**
 * Refresh ticks per frame on a fixed-refresh display. A frame finished at
 * time i/fps appears on the next refresh (vsync on, no tearing).
 */
export function fixedCadencePattern(fps: number, refreshHz: number, maxFrames = 24): number[] {
  const isInt = Number.isInteger(fps) && Number.isInteger(refreshHz);
  const n = isInt ? Math.min(fps / gcd(fps, refreshHz), maxFrames) : maxFrames;
  const tick = (i: number) => (isInt ? Math.ceil((i * refreshHz) / fps) : Math.ceil((i * refreshHz) / fps - 1e-9));
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(tick(i + 1) - tick(i));
  return out;
}

/**
 * Grid steps per frame on ProMotion: the shortest cycle of 4.17 ms steps whose
 * average matches the frame rate. Rotated so the long frame comes last, which
 * reads as "20.8 / 20.8 / 25.0 ms" for 45 FPS.
 */
export function promotionPattern(fps: number): number[] {
  const p = fixedCadencePattern(fps, PROMOTION_GRID_HZ).map((d) => Math.min(Math.max(d, PROMOTION_MIN_STEPS), PROMOTION_MAX_STEPS));
  const longest = Math.max(...p);
  const at = p.indexOf(longest);
  const rotated = p.slice(at + 1).concat(p.slice(0, at + 1));
  // keep any run of long frames together at the end
  while (rotated.length > 1 && rotated[0] === longest && rotated[rotated.length - 1] === longest) rotated.push(rotated.shift() as number);
  return rotated;
}

function summarise(pattern: number[]): string {
  const visible = pattern.filter((d) => d > 0);
  if (visible.length === 0) return '';
  const uniq = new Set(visible);
  // an even cadence still reads as a ratio ("2:2"), never a bare number
  if (uniq.size === 1) return `${visible[0]}:${visible[0]}`;
  return visible.slice(0, 6).join(':');
}

function msList(pattern: number[], tickHz: number): string {
  return pattern
    .slice(0, 6)
    .map((d) => ((d * 1000) / tickHz).toFixed(1))
    .join(' / ');
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function hzText(x: number): string {
  return `${round1(x)}\u00a0Hz`;
}

export function computeCadence(fps: number, panel: PanelTiming, capLabel: string): Cadence {
  if (panel.kind === 'vrr') {
    const vrr = panel.range;
    if (fps >= vrr.min && fps <= vrr.max) {
      return {
        mode: 'vrr-native',
        fit: 'VRR',
        tickHz: fps,
        panelHz: fps,
        pattern: [1],
        even: true,
        dropped: 0,
        label: `${panel.name} - ${capLabel} - VRR, panel at ${hzText(fps)}`,
        short: `VRR ${round1(fps)} Hz`,
      };
    }
    if (fps < vrr.min && vrr.lfc) {
      const m = Math.ceil(vrr.min / fps);
      if (fps * m <= vrr.max) {
        return {
          mode: 'vrr-lfc',
          fit: 'VRR',
          tickHz: fps * m,
          panelHz: fps * m,
          pattern: [m],
          even: true,
          dropped: 0,
          // non-breaking spaces keep "panel at 90 Hz" and "doubling x2" from wrapping apart
          label: `${panel.name} - ${capLabel} - VRR, panel at ${hzText(fps * m)} (host frame doubling\u00a0x${m})`,
          short: `VRR ${round1(fps * m)} Hz, each frame x${m}`,
        };
      }
    }
    const hz = fps > vrr.max ? vrr.max : vrr.min;
    const p = fixedCadencePattern(fps, hz);
    const even = new Set(p).size === 1 && p[0] > 0;
    return {
      mode: 'vrr-outside',
      fit: even ? 'even' : 'uneven',
      tickHz: hz,
      panelHz: hz,
      pattern: p,
      even,
      dropped: p.filter((d) => d === 0).length,
      label: `${panel.name} - ${capLabel} - outside the VRR range, ${even ? 'even' : 'uneven'} cadence ${summarise(p)}`,
      short: `outside range, ${hz} Hz`,
    };
  }
  if (panel.kind === 'promotion') {
    const p = promotionPattern(fps);
    const even = new Set(p).size === 1;
    const panelHz = (PROMOTION_GRID_HZ * p.length) / p.reduce((a, b) => a + b, 0);
    return {
      mode: 'promotion',
      fit: even ? 'even' : 'uneven',
      tickHz: PROMOTION_GRID_HZ,
      panelHz,
      pattern: p,
      even,
      dropped: 0,
      label: even
        ? `${panel.name} - ${capLabel} - even cadence, ${msList(p, PROMOTION_GRID_HZ)}\u00a0ms per frame (panel at ${hzText(PROMOTION_GRID_HZ / p[0])})`
        : `${panel.name} - ${capLabel} - uneven cadence ${msList(p, PROMOTION_GRID_HZ)}\u00a0ms`,
      short: even ? `${round1(PROMOTION_GRID_HZ / p[0])} Hz, even` : `uneven ${msList(p, PROMOTION_GRID_HZ)} ms`,
    };
  }
  const p = fixedCadencePattern(fps, panel.hz);
  const even = new Set(p).size === 1 && p[0] > 0;
  const dropped = p.filter((d) => d === 0).length;
  return {
    mode: 'fixed',
    fit: even ? 'even' : 'uneven',
    tickHz: panel.hz,
    panelHz: panel.hz,
    pattern: p,
    even,
    dropped,
    label: `${panel.name} - ${capLabel} - ${even ? 'even' : 'uneven'} cadence ${summarise(p)}${dropped ? ' (frames dropped)' : ''}`,
    short: even ? `each frame x${p[0]}` : `uneven ${summarise(p)}`,
  };
}

/** Display time of each frame in milliseconds for a cadence (one cycle). */
export function cadenceDurationsMs(c: Cadence): number[] {
  return c.pattern.map((d) => (d * 1000) / c.tickHz);
}

// --- simulated frame times -----------------------------------------------------

/** Deterministic hash-based random in [0, 1) for (seed, index). */
export function seededRandom(seed: number, index: number): number {
  let t = (seed * 0x9e3779b1 + index * 0x85ebca77) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export interface FrameSimInput {
  seed: number;
  /** Cap in FPS (a cap is always set: Unbounded is refused while D2 is active). */
  capFps: number;
  /** Unconstrained cost of a frame (max of CPU and GPU time), in ms. */
  workloadMs: number;
  /** Relative noise, e.g. 0.06 for +-6%. */
  jitter: number;
  coldCache: boolean;
}

export interface SimFrame {
  ms: number;
  /** True when this frame includes a simulated shader compile. */
  shader: boolean;
}

export function simulateFrame(input: FrameSimInput, index: number): SimFrame {
  const r1 = seededRandom(input.seed, index * 3);
  const r2 = seededRandom(input.seed, index * 3 + 1);
  const r3 = seededRandom(input.seed, index * 3 + 2);
  // slow wander (scene complexity) plus per-frame noise
  const wander = Math.sin(index / 37) * 0.04 + Math.sin(index / 113 + input.seed) * 0.05;
  let work = input.workloadMs * (1 + wander + (r1 - 0.5) * 2 * input.jitter);
  let shader = false;
  const spikeChance = input.coldCache ? 0.018 : 0.0015;
  if (r2 < spikeChance) {
    shader = input.coldCache;
    work += input.coldCache ? 30 + r3 * 110 : 8 + r3 * 14;
  }
  const floor = 1000 / input.capFps;
  // a frame limiter holds fast frames to the cap with a little timer noise
  const ms = Math.max(work, floor + (r3 - 0.5) * 0.3);
  return { ms, shader };
}

export function simulateFrames(input: FrameSimInput, count: number, start = 0): SimFrame[] {
  const out: SimFrame[] = [];
  for (let i = 0; i < count; i++) out.push(simulateFrame(input, start + i));
  return out;
}

export interface FrameStats {
  avgFps: number;
  low1Fps: number;
  p99Ms: number;
  medianMs: number;
  stutters: number;
  stuttersPerMin: number;
  shaderEvents: number;
}

/**
 * avgFps: frames / total time. low1Fps: 1000 / mean of the slowest 1% of frames.
 * p99Ms: 99th percentile frame time (nearest rank). Stutter: a frame longer than
 * twice the median and at least 25 ms.
 */
export function frameStats(times: number[], shaderFlags?: boolean[]): FrameStats {
  const n = times.length;
  if (n === 0) return { avgFps: 0, low1Fps: 0, p99Ms: 0, medianMs: 0, stutters: 0, stuttersPerMin: 0, shaderEvents: 0 };
  const sum = times.reduce((a, b) => a + b, 0);
  const sorted = [...times].sort((a, b) => a - b);
  const p99 = sorted[Math.min(n - 1, Math.max(0, Math.ceil(0.99 * n) - 1))];
  const median = sorted[Math.floor(n / 2)];
  const worstCount = Math.max(1, Math.floor(n * 0.01));
  let worstSum = 0;
  for (let i = n - worstCount; i < n; i++) worstSum += sorted[i];
  const threshold = Math.max(2 * median, 25);
  const stutters = times.filter((t) => t > threshold).length;
  return {
    avgFps: (1000 * n) / sum,
    low1Fps: 1000 / (worstSum / worstCount),
    p99Ms: p99,
    medianMs: median,
    stutters,
    stuttersPerMin: stutters / (sum / 60000),
    shaderEvents: shaderFlags ? shaderFlags.filter(Boolean).length : 0,
  };
}
