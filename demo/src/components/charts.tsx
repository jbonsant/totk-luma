import { useEffect, useState } from 'react';
import { pqEncode } from '../sim/color';
import type { Cadence, SimFrame } from '../sim/pacing';
import type { ClipStats, Histogram, Waveform } from '../sim/scopes';
import { HIST_MAX_NITS, HIST_MIN_NITS, WAVEFORM_TICKS, clipStats, logAxisPos, logHistogram, spreadLabels, waveform } from '../sim/scopes';
import { subscribeFrames } from '../state/frameBus';
import type { FrameSnapshot } from '../state/frameBus';
import { MONO, cssVar, prepareCanvas, useSizedCanvas } from './canvas';

export interface ScopeData {
  hist: Histogram;
  wf: Waveform;
  clip: ClipStats;
  peak: number;
  paperWhite: number;
  black: number;
  sceneMax: number;
}

const SCOPE_INTERVAL_MS = 180;

/**
 * Subscribes to the scene and computes scopes at most about 5 times a second.
 * A frame that arrives inside the interval is not lost: it is processed when
 * the interval ends (important with reduced motion, where the scene only
 * redraws when a setting changes).
 */
export function useScopes(source: 'scene' | 'output', active: boolean): ScopeData | null {
  const [data, setData] = useState<ScopeData | null>(null);
  useEffect(() => {
    if (!active) return;
    let last = Number.NEGATIVE_INFINITY;
    let timer: number | undefined;
    let pending: FrameSnapshot | null = null;
    const compute = (f: FrameSnapshot) => {
      last = performance.now();
      pending = null;
      const lum = source === 'scene' ? f.lumScene : f.lumOut;
      const peak = f.settings.visual.hdr ? f.settings.display.peak : f.settings.display.paperWhite;
      setData({
        hist: logHistogram(lum, 90),
        wf: waveform(lum, f.width, f.height, 160, 80, 1),
        clip: clipStats(f.lumScene, peak, f.settings.display.black),
        peak,
        paperWhite: f.settings.display.paperWhite,
        black: f.settings.display.black,
        sceneMax: f.sceneMaxNits,
      });
    };
    const unsubscribe = subscribeFrames((f) => {
      const wait = last + SCOPE_INTERVAL_MS - performance.now();
      if (wait <= 0) {
        compute(f);
        return;
      }
      // the buffers are reused, so by the time the timer fires they hold this frame or a newer one
      pending = f;
      if (timer === undefined) {
        timer = window.setTimeout(() => {
          timer = undefined;
          if (pending) compute(pending);
        }, wait);
      }
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [source, active]);
  return data;
}

const HIST_TICKS = [0.01, 0.1, 1, 10, 100, 1000, 10000];

function tickLabel(n: number): string {
  if (n >= 1000) return `${n / 1000}k`;
  return String(n);
}

export function HistogramChart({ data, height = 120 }: { data: ScopeData | null; height?: number }) {
  const { ref, size } = useSizedCanvas();
  useEffect(() => {
    const ctx = prepareCanvas(ref.current, size.w, size.h);
    if (!ctx) return;
    const W = size.w;
    const H = size.h;
    const padB = 16;
    const plotH = H - padB - 4;
    const grid = cssVar('--chart-grid');
    const axis = cssVar('--text-3');
    ctx.font = MONO;
    ctx.textBaseline = 'top';
    // grid + ticks
    for (const t of HIST_TICKS) {
      const x = Math.round(logAxisPos(t) * (W - 1)) + 0.5;
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 4);
      ctx.lineTo(x, 4 + plotH);
      ctx.stroke();
      ctx.fillStyle = axis;
      ctx.textAlign = t === 10000 ? 'right' : t === 0.01 ? 'left' : 'center';
      ctx.fillText(tickLabel(t), Math.min(Math.max(x, 1), W - 1), H - padB + 3);
    }
    if (!data) return;
    const bins = data.hist.bins;
    let max = 1;
    for (let i = 0; i < bins.length; i++) if (bins[i] > max) max = bins[i];
    const bw = W / bins.length;
    ctx.fillStyle = cssVar('--chart-fill');
    ctx.strokeStyle = cssVar('--chart-line');
    ctx.beginPath();
    ctx.moveTo(0, 4 + plotH);
    for (let i = 0; i < bins.length; i++) {
      const hgt = Math.sqrt(bins[i] / max) * (plotH - 2);
      ctx.lineTo(i * bw, 4 + plotH - hgt);
      ctx.lineTo((i + 1) * bw, 4 + plotH - hgt);
    }
    ctx.lineTo(W, 4 + plotH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // markers
    const marker = (nits: number, color: string, label: string, dash: number[], row: number) => {
      const x = Math.round(logAxisPos(nits) * (W - 1)) + 0.5;
      ctx.strokeStyle = color;
      ctx.setLineDash(dash);
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(x, 4);
      ctx.lineTo(x, 4 + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      // label on a dark plate, stacked by row so markers never overlap
      const tw = ctx.measureText(label).width;
      const right = x > W - tw - 12;
      const lx = right ? x - tw - 8 : x + 4;
      const ly = 6 + row * 14;
      ctx.fillStyle = cssVar('--plate');
      ctx.fillRect(lx - 2, ly - 1, tw + 6, 13);
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.fillText(label, lx + 1, ly + 1);
    };
    marker(100, cssVar('--text-3'), 'SDR ref 100', [2, 3], 2);
    marker(data.paperWhite, cssVar('--text-2'), `paper white ${Math.round(data.paperWhite)}`, [4, 3], 1);
    marker(data.peak, cssVar('--accent'), `display peak ${Math.round(data.peak)}`, [], 0);
  }, [data, size, ref]);
  return (
    <canvas
      ref={ref}
      className="chart"
      style={{ height }}
      role="img"
      aria-label={`Simulated luminance histogram on a log axis from ${HIST_MIN_NITS} to ${HIST_MAX_NITS.toLocaleString('en-US')} nits, with paper white, display peak and SDR reference markers`}
    />
  );
}

export function WaveformChart({ data, height = 150 }: { data: ScopeData | null; height?: number }) {
  const { ref, size } = useSizedCanvas();
  useEffect(() => {
    const ctx = prepareCanvas(ref.current, size.w, size.h);
    if (!ctx) return;
    const W = size.w;
    const H = size.h;
    const padL = 38;
    const plotW = W - padL - 2;
    const plotH = H - 8;
    const y0 = 4;
    const yOf = (nits: number) => y0 + plotH - pqEncode(nits) * plotH;
    ctx.font = MONO;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    // labels for close ticks (100 and 203) are pushed apart so they never touch
    // 10k and 0.1 sit at the edges: keep every label half a text line (6 px) inside the canvas,
    // 11 px apart (10 px text), so none is cut off at the dashboard's 92 px height
    const labelY = spreadLabels(
      WAVEFORM_TICKS.map((t) => yOf(t)),
      11,
      6,
      H - 6,
    );
    WAVEFORM_TICKS.forEach((t, i) => {
      const y = Math.round(yOf(t)) + 0.5;
      ctx.strokeStyle = cssVar('--chart-grid');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.fillStyle = t === 203 ? cssVar('--text-2') : cssVar('--text-3');
      ctx.fillText(t >= 1000 ? `${t / 1000}k` : String(t), padL - 5, labelY[i]);
    });
    if (!data) return;
    const wf = data.wf;
    const img = ctx.createImageData(wf.columns, wf.rows);
    const logMax = Math.log1p(wf.maxCount);
    for (let r = 0; r < wf.rows; r++) {
      for (let c = 0; c < wf.columns; c++) {
        const n = wf.data[r * wf.columns + c];
        if (!n) continue;
        const a = Math.log1p(n) / logMax;
        const q = ((wf.rows - 1 - r) * wf.columns + c) * 4;
        img.data[q] = 120 + 135 * a;
        img.data[q + 1] = 170 + 85 * a;
        img.data[q + 2] = 210 + 45 * a;
        img.data[q + 3] = 40 + 215 * a;
      }
    }
    // draw the density map scaled into the plot area
    const tmp = document.createElement('canvas');
    tmp.width = wf.columns;
    tmp.height = wf.rows;
    tmp.getContext('2d')?.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, padL, y0, plotW, plotH);
    // peak line
    const py = Math.round(yOf(data.peak)) + 0.5;
    ctx.strokeStyle = cssVar('--accent');
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(padL, py);
    ctx.lineTo(W, py);
    ctx.stroke();
    ctx.fillStyle = cssVar('--accent');
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`peak ${Math.round(data.peak)}`, W - 4, py - 2);
  }, [data, size, ref]);
  return (
    <canvas
      ref={ref}
      className="chart"
      style={{ height }}
      role="img"
      aria-label="Simulated waveform: image columns across, luminance up on a PQ-scaled axis with ticks at 0.1, 1, 10, 100, 203, 1000, 4000 and 10000 nits"
    />
  );
}

const GUIDES = [
  { ms: 1000 / 60, label: '16.7 ms (60)' },
  { ms: 1000 / 40, label: '25.0 ms (40)' },
  { ms: 1000 / 30, label: '33.3 ms (30)' },
];

/** Fixed guides, plus the cap interval (for example 20.8 ms at 48 or 22.2 ms at 45) when it is not one of them. */
function guidesFor(capMs: number): { ms: number; label: string; right?: boolean }[] {
  if (GUIDES.some((g) => Math.abs(g.ms - capMs) < 0.5)) return GUIDES;
  return [...GUIDES, { ms: capMs, label: `${capMs.toFixed(1)} ms (cap ${Math.round(1000 / capMs)})`, right: true }];
}

export function FrameTimeGraph({ frames, height = 120, capMs }: { frames: SimFrame[]; height?: number; capMs: number }) {
  const { ref, size } = useSizedCanvas();
  useEffect(() => {
    const ctx = prepareCanvas(ref.current, size.w, size.h);
    if (!ctx) return;
    const W = size.w;
    const H = size.h;
    const maxMs = 45;
    const padR = 4;
    const plotW = W - padR;
    const y = (ms: number) => 4 + (H - 8) * (1 - Math.min(ms, maxMs) / maxMs);
    ctx.font = MONO;
    // a short graph labels only the cap guide, so close guides never overlap
    const labelAll = H >= 90;
    for (const g of guidesFor(capMs)) {
      const gy = Math.round(y(g.ms)) + 0.5;
      const isCap = Math.abs(capMs - g.ms) < 0.5;
      ctx.strokeStyle = isCap ? cssVar('--accent-dim') : cssVar('--chart-grid');
      ctx.setLineDash(isCap ? [] : [3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(W, gy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = isCap ? cssVar('--accent') : cssVar('--text-3');
      ctx.textAlign = 'left';
      // 16.7 sits below its line, the others above; the extra cap guide is labelled further right
      // and below its line, so close guides never collide
      const below = g.ms < 17 || g.right === true;
      ctx.textBaseline = below ? 'top' : 'bottom';
      if (labelAll || isCap) ctx.fillText(g.label, g.right ? 104 : 4, below ? gy + 2 : gy - 2);
    }
    if (frames.length < 2) return;
    const n = frames.length;
    const dx = plotW / (300 - 1);
    const x0 = plotW - (n - 1) * dx;
    ctx.strokeStyle = cssVar('--chart-line');
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    frames.forEach((f, i) => {
      const px = x0 + i * dx;
      if (i === 0) ctx.moveTo(px, y(f.ms));
      else ctx.lineTo(px, y(f.ms));
    });
    ctx.stroke();
    // spikes
    frames.forEach((f, i) => {
      if (f.ms <= 1000 / 30 + 1) return;
      const px = x0 + i * dx;
      ctx.fillStyle = f.ms > 50 ? cssVar('--critical') : cssVar('--warn');
      ctx.fillRect(px - 1.5, y(f.ms), 3, H - 4 - y(f.ms));
      if (f.ms > maxMs) {
        ctx.beginPath();
        ctx.moveTo(px - 4, 9);
        ctx.lineTo(px + 4, 9);
        ctx.lineTo(px, 3);
        ctx.closePath();
        ctx.fill();
      }
    });
    // name the tallest spike that runs off the chart
    let worst = -1;
    frames.forEach((f, i) => {
      if (f.ms > maxMs && (worst < 0 || f.ms > frames[worst].ms)) worst = i;
    });
    if (worst >= 0) {
      const wx = x0 + worst * dx;
      const text = `${frames[worst].ms.toFixed(0)} ms`;
      const tw = ctx.measureText(text).width;
      const lx = Math.min(Math.max(wx + 7, 2), plotW - tw - 6);
      ctx.fillStyle = cssVar('--plate');
      ctx.fillRect(lx - 3, 1, tw + 6, 13);
      ctx.fillStyle = cssVar('--critical');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(text, lx, 3);
    }
    // latest point emphasised
    const last = frames[n - 1];
    const lx = x0 + (n - 1) * dx;
    ctx.fillStyle = cssVar('--text-1');
    ctx.beginPath();
    ctx.arc(lx - 2, y(last.ms), 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${last.ms.toFixed(1)} ms`, lx - 8, Math.max(14, y(last.ms) - 4));
  }, [frames, size, ref, capMs]);
  return (
    <canvas
      ref={ref}
      className="chart"
      style={{ height }}
      role="img"
      aria-label="Simulated frame-time graph of the last 300 frames, with guide lines at 16.7, 25.0 and 33.3 milliseconds and at the cap interval; spikes are coloured"
    />
  );
}

/** Small cadence visual: refresh ticks with the game frame each one shows. */
export function CadenceStrip({ cadence, ticks = 24, compact = false }: { cadence: Cadence; ticks?: number; compact?: boolean }) {
  const cells: { frame: number; first: boolean }[] = [];
  let frame = 0;
  let k = 0;
  const pat = cadence.pattern.filter((d) => d > 0);
  while (cells.length < ticks && pat.length) {
    const d = pat[k % pat.length];
    for (let j = 0; j < d && cells.length < ticks; j++) cells.push({ frame, first: j === 0 });
    frame++;
    k++;
  }
  const W = 240;
  const H = compact ? 14 : 22;
  const cw = W / ticks;
  return (
    <svg className="cadence-strip" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Simulated cadence: ${cadence.label}`}>
      {cells.map((c, i) => (
        <rect
          key={i}
          x={i * cw + 0.5}
          y={1}
          width={cw - 1}
          height={H - 2}
          rx={1.5}
          className={c.frame % 2 ? 'cad-b' : 'cad-a'}
          opacity={c.first ? 1 : 0.55}
        />
      ))}
    </svg>
  );
}
