/**
 * Simulated grading and output pipeline:
 * scene nits -> scene-stage looks -> tone map to the display -> display-stage
 * looks (in nits) -> SDR preview -> 8-bit sRGB (ADR 0006: two grading stages).
 *
 * This only drives a browser preview. Nothing here touches a real swapchain.
 * Luminance-only stages (contrast, tone map, SDR preview) run through
 * log-spaced lookup tables so a 480 x 270 frame stays cheap at about 30 Hz.
 */
import { P3_TO_BT709, srgbLut, SRGB_LUT_SIZE } from './color';
import type { Vec3 } from './color';
import type { CurveId } from './tonemap';
import { buildToneLut, lutGain, sdrPreview } from './tonemap';
import type { VisualSettings } from './presets';

export interface OutputTarget {
  peak: number;
  paperWhite: number;
  black: number;
}

export interface PipelineSettings {
  visual: VisualSettings;
  display: OutputTarget;
  curve: CurveId;
  knee: number;
  sourceMax: number;
}

export interface PipelineOverlays {
  zebra: boolean;
  falseColor: boolean;
  /** stripe phase for the zebra animation */
  phase: number;
}

export interface PipelineBuffers {
  rgba: Uint8ClampedArray;
  /** graded scene luminance before the tone map (nits) */
  lumScene: Float32Array;
  /** luminance sent to the display after the tone map (nits) */
  lumOut: Float32Array;
}

export function allocBuffers(w: number, h: number): PipelineBuffers {
  return {
    rgba: new Uint8ClampedArray(w * h * 4),
    lumScene: new Float32Array(w * h),
    lumOut: new Float32Array(w * h),
  };
}

/*
 * Lookup tables are indexed by the bit pattern of the float32 luminance. For
 * positive floats the bit pattern grows monotonically and almost linearly in
 * log2, so this is a log-spaced table without calling Math.log per pixel.
 */
const F32 = new Float32Array(1);
const I32 = new Int32Array(F32.buffer);
function bitsOf(v: number): number {
  F32[0] = v;
  return I32[0];
}
function valueOfBits(b: number): number {
  I32[0] = b;
  return F32[0];
}
const BITS_LO = bitsOf(1e-4);
const BITS_HI = bitsOf(1e5);
const GAIN_N = 4096;
const BITS_STEP = (BITS_HI - BITS_LO) / GAIN_N;

interface Tables {
  /** tone-map gain per scene luminance, null for the SDR path */
  tm: Float32Array | null;
  /** SDR preview gain per display luminance */
  pv: Float32Array;
  /** contrast gain per scene luminance, null when neutral */
  ct: Float32Array | null;
  peak: number;
}

const tableCache = new Map<string, Tables>();

function tables(s: PipelineSettings): Tables {
  const hdr = s.visual.hdr;
  const pw = s.display.paperWhite;
  const peak = hdr ? s.display.peak : pw;
  const key = `${hdr}|${s.curve}|${s.display.peak}|${s.display.black}|${pw}|${s.sourceMax}|${s.knee}|${s.visual.contrast}`;
  const hit = tableCache.get(key);
  if (hit) return hit;
  const lut = hdr ? buildToneLut(s.curve, { peak: s.display.peak, black: s.display.black, sourceMax: s.sourceMax, knee: s.knee }, 768) : null;
  const tm = lut ? new Float32Array(GAIN_N + 1) : null;
  const pv = new Float32Array(GAIN_N + 1);
  const ct = s.visual.contrast !== 1 ? new Float32Array(GAIN_N + 1) : null;
  const pivot = 0.18 * pw;
  for (let i = 0; i <= GAIN_N; i++) {
    const Y = valueOfBits(Math.round(BITS_LO + i * BITS_STEP));
    if (tm && lut) tm[i] = lutGain(lut, Y);
    pv[i] = sdrPreview(Y, pw, peak) / Y;
    if (ct) ct[i] = Math.pow(Y / pivot, s.visual.contrast - 1);
  }
  const t: Tables = { tm, pv, ct, peak };
  if (tableCache.size > 24) tableCache.clear();
  tableCache.set(key, t);
  return t;
}

function gainAt(table: Float32Array, Y: number): number {
  if (!(Y > 1e-4)) return table[0];
  F32[0] = Y;
  const pos = (I32[0] - BITS_LO) / BITS_STEP;
  if (pos >= GAIN_N) return table[GAIN_N];
  const i = pos | 0;
  const f = pos - i;
  return table[i] + (table[i + 1] - table[i]) * f;
}

/** The game's own SDR tone map, simulated: per channel, white at 4x paper white, then clipped. */
export function gameSdrChannel(nits: number, paperWhite: number): number {
  const x = (nits > 0 ? nits : 0) / paperWhite;
  const y = (x * (1 + x / 16)) / (1 + x);
  const v = y * 1.35;
  return (v < 1 ? v : 1) * paperWhite;
}

/** False-colour ramp for log luminance, from deep blue (0.01 nits) to white-hot (4,000+ nits). */
export const FALSE_COLOR_STOPS: { nits: number; rgb: Vec3 }[] = [
  { nits: 0.01, rgb: [12, 16, 40] },
  { nits: 0.1, rgb: [30, 50, 120] },
  { nits: 1, rgb: [30, 110, 170] },
  { nits: 10, rgb: [40, 160, 150] },
  { nits: 100, rgb: [120, 190, 90] },
  { nits: 203, rgb: [200, 205, 90] },
  { nits: 600, rgb: [235, 160, 60] },
  { nits: 1000, rgb: [230, 90, 50] },
  { nits: 2000, rgb: [215, 50, 110] },
  { nits: 4000, rgb: [250, 220, 250] },
];

export function falseColor(nits: number): Vec3 {
  const stops = FALSE_COLOR_STOPS;
  const l = Math.log10(Math.max(nits, 0.01));
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    const lb = Math.log10(b.nits);
    if (l <= lb) {
      const la = Math.log10(a.nits);
      const t = Math.max(0, (l - la) / (lb - la));
      return [a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t, a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t, a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t];
    }
  }
  return stops[stops.length - 1].rgb;
}

const FALSE_LUT = (() => {
  // 512 entries over log10 nits -2 .. 4
  const n = 512;
  const t = new Uint8ClampedArray((n + 1) * 3);
  for (let i = 0; i <= n; i++) {
    const c = falseColor(Math.pow(10, -2 + (6 * i) / n));
    t[i * 3] = c[0];
    t[i * 3 + 1] = c[1];
    t[i * 3 + 2] = c[2];
  }
  return t;
})();

const ZEBRA_HIGH: Vec3 = [255, 64, 96];
const ZEBRA_LOW: Vec3 = [64, 150, 255];

/** Process columns [x0, x1) of every row with one set of settings. */
function processSpan(
  rgb: Float32Array,
  w: number,
  h: number,
  x0: number,
  x1: number,
  airlight: Vec3,
  s: PipelineSettings,
  out: PipelineBuffers,
  ov: PipelineOverlays,
): void {
  const T = tables(s);
  const vs = s.visual;
  const pw = s.display.paperWhite;
  const black = s.display.black;
  const peak = T.peak;
  const exposure = Math.pow(2, vs.exposure);
  const tm = T.tm;
  const pv = T.pv;
  const ct = T.ct;
  const dehaze = vs.hazeReduction;
  const vib = vs.vibrance;
  const hs = vs.highlightSaturation - 1;
  const doVib = vib !== 0;
  const vivid = vs.gamut === 'vivid';
  const m = P3_TO_BT709;
  const A0 = airlight[0] * exposure;
  const A1 = airlight[1] * exposure;
  const A2 = airlight[2] * exposure;
  const aLum = 0.2126 * A0 + 0.7152 * A1 + 0.0722 * A2;
  const lumScene = out.lumScene;
  const lumOut = out.lumOut;
  const px = out.rgba;
  const zebra = ov.zebra;
  const fc = ov.falseColor;

  for (let y = 0; y < h; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      const o = i * 3;
      let r = rgb[o] * exposure;
      let g = rgb[o + 1] * exposure;
      let b = rgb[o + 2] * exposure;

      if (dehaze > 0) {
        // dark-channel style approximation; highlights are protected
        const l0 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        let protect = 1 - (l0 - aLum) / (aLum * 2);
        protect = protect < 0 ? 0 : protect > 1 ? 1 : protect;
        let dark = r / A0;
        const dg = g / A1;
        const db = b / A2;
        if (dg < dark) dark = dg;
        if (db < dark) dark = db;
        if (dark > 1) dark = 1;
        let tEst = 1 - 0.85 * dehaze * dark * protect;
        if (tEst < 0.35) tEst = 0.35;
        r = (r - A0) / tEst + A0;
        g = (g - A1) / tEst + A1;
        b = (b - A2) / tEst + A2;
        if (r < 0) r = 0;
        if (g < 0) g = 0;
        if (b < 0) b = 0;
      }

      let Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      if (ct) {
        const k = gainAt(ct, Y);
        r *= k;
        g *= k;
        b *= k;
        Y *= k;
      }

      // scene stage: vibrance (the Oklab vivid look in the app), on scene-linear values
      if (doVib) {
        const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
        if (mx > 0) {
          const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
          const sk = 1 + vib * (1 - (mx - mn) / mx);
          r = Y + (r - Y) * sk;
          g = Y + (g - Y) * sk;
          b = Y + (b - Y) * sk;
          if (r < 0) r = 0;
          if (g < 0) g = 0;
          if (b < 0) b = 0;
        }
      }

      if (vivid) {
        // expanded look: treat BT.709 values as P3 (approximate), 60% blend
        const r2 = m[0][0] * r + m[0][1] * g + m[0][2] * b;
        const g2 = m[1][0] * r + m[1][1] * g + m[1][2] * b;
        const b2 = m[2][0] * r + m[2][1] * g + m[2][2] * b;
        r += (r2 - r) * 0.6;
        g += (g2 - g) * 0.6;
        b += (b2 - b) * 0.6;
        if (r < 0) r = 0;
        if (g < 0) g = 0;
        if (b < 0) b = 0;
        Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }

      lumScene[i] = Y;

      if (tm) {
        const gain = gainAt(tm, Y);
        r *= gain;
        g *= gain;
        b *= gain;
        const Yo = Y * gain;
        // display stage: highlight-aware chroma, in output nits after the tonemap
        if (hs !== 0 && Yo > pw) {
          let hw = (Yo - pw) / (2 * pw);
          hw = hw > 1 ? 1 : hw;
          const sk = 1 + hs * hw;
          r = Yo + (r - Yo) * sk;
          g = Yo + (g - Yo) * sk;
          b = Yo + (b - Yo) * sk;
          if (r < 0) r = 0;
          if (g < 0) g = 0;
          if (b < 0) b = 0;
        }
        const cm = r > g ? (r > b ? r : b) : g > b ? g : b;
        if (cm > peak) {
          if (Yo < peak) {
            const k = (peak - Yo) / (cm - Yo);
            r = Yo + (r - Yo) * k;
            g = Yo + (g - Yo) * k;
            b = Yo + (b - Yo) * k;
          } else r = g = b = peak;
        }
      } else {
        r = gameSdrChannel(r, pw);
        g = gameSdrChannel(g, pw);
        b = gameSdrChannel(b, pw);
      }
      const Yout = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumOut[i] = Yout;

      const q = i * 4;
      if (fc) {
        let pos = ((Math.log10(Yout > 0.01 ? Yout : 0.01) + 2) / 6) * 512;
        if (pos > 512) pos = 512;
        const j = (pos | 0) * 3;
        px[q] = FALSE_LUT[j];
        px[q + 1] = FALSE_LUT[j + 1];
        px[q + 2] = FALSE_LUT[j + 2];
      } else {
        let pr = 0;
        let pg = 0;
        let pb = 0;
        if (Yout > 0) {
          const k = gainAt(pv, Yout);
          pr = r * k;
          pg = g * k;
          pb = b * k;
          const pm = pr > pg ? (pr > pb ? pr : pb) : pg > pb ? pg : pb;
          if (pm > 1) {
            const Yp = Yout * k;
            if (Yp < 1) {
              const d = (1 - Yp) / (pm - Yp);
              pr = Yp + (pr - Yp) * d;
              pg = Yp + (pg - Yp) * d;
              pb = Yp + (pb - Yp) * d;
            } else pr = pg = pb = 1;
          }
        }
        px[q] = srgbLut[(pr * SRGB_LUT_SIZE) | 0];
        px[q + 1] = srgbLut[(pg * SRGB_LUT_SIZE) | 0];
        px[q + 2] = srgbLut[(pb * SRGB_LUT_SIZE) | 0];
      }
      px[q + 3] = 255;

      if (zebra && (x + y + ov.phase) % 6 < 2) {
        if (Y > peak) {
          px[q] = ZEBRA_HIGH[0];
          px[q + 1] = ZEBRA_HIGH[1];
          px[q + 2] = ZEBRA_HIGH[2];
        } else if (Y < black) {
          px[q] = ZEBRA_LOW[0];
          px[q + 1] = ZEBRA_LOW[1];
          px[q + 2] = ZEBRA_LOW[2];
        }
      }
    }
  }
}

/**
 * Process one frame. `split.x` (0..1) renders columns left of the split with
 * `split.before`, for the before/after comparison.
 */
export function processFrame(
  rgb: Float32Array,
  w: number,
  h: number,
  airlight: Vec3,
  settings: PipelineSettings,
  out: PipelineBuffers,
  overlays: PipelineOverlays,
  split?: { x: number; before: PipelineSettings },
): void {
  const splitCol = split ? Math.min(w, Math.max(0, Math.round(split.x * w))) : 0;
  if (split && splitCol > 0) processSpan(rgb, w, h, 0, splitCol, airlight, split.before, out, overlays);
  if (splitCol < w) processSpan(rgb, w, h, splitCol, w, airlight, settings, out, overlays);

  const right = settings.visual.sharpening;
  const left = split ? split.before.visual.sharpening : right;
  if ((right > 0 || left > 0) && !overlays.falseColor) sharpen(out.rgba, w, h, splitCol, left, right);
}

let scratch: Uint8ClampedArray | null = null;

/** Simple 4-neighbour unsharp mask on the 8-bit preview. */
function sharpen(px: Uint8ClampedArray, w: number, h: number, splitCol: number, left: number, right: number): void {
  if (!scratch || scratch.length !== px.length) scratch = new Uint8ClampedArray(px.length);
  scratch.set(px);
  const src = scratch;
  const stride = w * 4;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const a = x < splitCol ? left : right;
      if (a <= 0) continue;
      const k = a * 0.15;
      const q = y * stride + x * 4;
      for (let c = 0; c < 3; c++) {
        const v = src[q + c];
        px[q + c] = v + (4 * v - src[q + c - 4] - src[q + c + 4] - src[q + c - stride] - src[q + c + stride]) * k;
      }
    }
  }
}
