import { useEffect, useMemo, useRef, useState } from 'react';
import type { DisplayProfile } from '../sim/displays';
import type { FrameSimInput, SimFrame } from '../sim/pacing';
import { frameStats, simulateFrame, simulateFrames } from '../sim/pacing';
import type { PerfSettings } from '../sim/telemetry';
import { summarisePerf } from '../sim/telemetry';
import { useInterval } from './hooks';

export const FRAME_WINDOW = 300;

export interface Telemetry {
  frames: SimFrame[];
  stats: ReturnType<typeof frameStats>;
  summary: ReturnType<typeof summarisePerf>;
  presentedFps: number;
  gameFps: number;
}

type DisplayId = DisplayProfile['id'];

function inputFor(perf: PerfSettings, display: DisplayId): FrameSimInput {
  const s = summarisePerf(perf, display);
  return {
    seed: 11,
    capFps: s.capFps,
    workloadMs: Math.max(s.workload.cpuMs, s.workload.gpuMs),
    jitter: 0.05,
    coldCache: perf.coldCache,
  };
}

/** Frames simulated live after the base window, tagged with the input that produced them. */
interface LiveFrames {
  input: FrameSimInput;
  frames: SimFrame[];
}

/**
 * Rolling simulated frame times.
 *
 * Whenever a setting changes, the whole 300-frame window is rebuilt at once
 * from the new input, so every readout matches the settings immediately
 * (also with reduced motion, in menu views and while paused). While `live` is
 * true, new frames are appended in real time purely for animation.
 */
export function useTelemetry(perf: PerfSettings, display: DisplayId, live: boolean): Telemetry {
  const summary = useMemo(() => summarisePerf(perf, display), [perf, display]);
  const input = useMemo(() => inputFor(perf, display), [perf, display]);
  const base = useMemo(() => simulateFrames(input, FRAME_WINDOW, 0), [input]);
  const [liveFrames, setLiveFrames] = useState<LiveFrames>(() => ({ input, frames: [] }));
  const current = useRef(input);
  const gen = useRef({ input, next: FRAME_WINDOW, debt: 0 });
  useEffect(() => {
    current.current = input;
  }, [input]);

  useInterval(
    () => {
      const inp = current.current;
      // frames simulated for older settings are dropped, never mixed in
      if (gen.current.input !== inp) gen.current = { input: inp, next: FRAME_WINDOW, debt: 0 };
      const g = gen.current;
      g.debt += 100;
      const fresh: SimFrame[] = [];
      while (g.debt > 0 && fresh.length < 60) {
        const f = simulateFrame(inp, g.next++);
        g.debt -= f.ms;
        fresh.push(f);
      }
      if (!fresh.length) return;
      setLiveFrames((prev) => ({ input: inp, frames: (prev.input === inp ? prev.frames : []).concat(fresh).slice(-FRAME_WINDOW) }));
    },
    100,
    live,
  );

  const extra = liveFrames.input === input ? liveFrames.frames : null;
  const frames = useMemo(() => (extra && extra.length ? base.concat(extra).slice(-FRAME_WINDOW) : base), [base, extra]);

  const stats = useMemo(
    () =>
      frameStats(
        frames.map((f) => f.ms),
        frames.map((f) => f.shader),
      ),
    [frames],
  );
  const gameFps = stats.avgFps;
  // refreshes the panel shows per second, including repeated frames
  const presentedFps = summary.cadence.panelHz;
  return { frames, stats, summary, presentedFps, gameFps };
}
