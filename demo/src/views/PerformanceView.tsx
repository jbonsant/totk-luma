import { useEffect, useMemo, useRef, useState } from 'react';
import { CadenceStrip, FrameTimeGraph } from '../components/charts';
import { Card, Chip, NoBreak, Segmented, SimTag, Stat, Toggle } from '../components/ui';
import type { Tone } from '../components/ui';
import { panelModeAvailable, panelModes } from '../sim/caps';
import type { CapFps, CapOption, PanelModeId } from '../sim/caps';
import { vrrConnections } from '../sim/displays';
import type { VrrState } from '../sim/displays';
import type { Cadence } from '../sim/pacing';
import { PROMOTION_STEP_MS, cadenceDurationsMs } from '../sim/pacing';
import { RESOLUTIONS, summarisePerf } from '../sim/telemetry';
import type { PerfSettings, ResolutionScale } from '../sim/telemetry';
import { useApp } from '../state/context';
import type { DisplayId } from '../state/store';
import type { Telemetry } from '../state/useTelemetry';

function vrrTone(s: VrrState): Tone {
  return s === 'Verified (simulated)' ? 'ok' : s === 'Unverified' ? 'warn' : 'neutral';
}

function capChipTone(o: CapOption): Tone {
  return o.chip === 'Cadence warning' || o.chip === 'Experimental' ? 'warn' : o.chip === 'VRR' ? 'ok' : 'neutral';
}

/** ADR 0001 D2: the backend track, as text (only the baseline runs in this bundle). */
const BACKENDS: { id: string; name: string; status: string; tone: Tone; text: string; gate: string }[] = [
  {
    id: 'moltenvk',
    name: 'Vulkan via MoltenVK 1.4.2-ryujinx.5',
    status: 'Current baseline',
    tone: 'ok',
    text: 'Vulkan via MoltenVK 1.4.2-ryujinx.5: current baseline (Khronos deprecated MoltenVK on 2026-10-13)',
    gate: 'Every measurement and v1 use it.',
  },
  {
    id: 'kosmickrisp',
    name: 'KosmicKrisp',
    status: 'Gated variant',
    tone: 'warn',
    text: 'KosmicKrisp: gated variant, separate bundle, needs owner approval',
    gate: 'Phase P5, gate G-KK. Never switched inside this bundle.',
  },
  {
    id: 'metal',
    name: 'Native Metal backend',
    status: 'Not planned',
    tone: 'neutral',
    text: 'Native Metal backend: not planned (reverted upstream in Ryubing #701)',
    gate: 'Reopened only through gate G-METAL.',
  },
];

/** Width of an element in CSS pixels (0 until measured). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setW(Math.round(r.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

/**
 * Refresh ticks against frame presents. The SVG is drawn at its real pixel
 * width so the text stays at a fixed size; narrow screens show a shorter span
 * (50 ms at phone width) instead of shrinking everything.
 */
function CadenceTimeline({ cadence }: { cadence: Cadence }) {
  const { ref, w } = useWidth<HTMLElement>();
  const W = w > 0 ? w : 640;
  const H = 96;
  const spanMs = W >= 560 ? 100 : W >= 440 ? 75 : 50;
  const scale = (W - 20) / spanMs;
  const tickMs = 1000 / cadence.tickHz;
  const grid = cadence.mode === 'promotion';
  const ticks: number[] = [];
  for (let t = 0; t <= spanMs + 0.01; t += tickMs) ticks.push(t);
  const pat = cadence.pattern.filter((d) => d > 0);
  const frames: { start: number; dur: number; n: number }[] = [];
  let t = 0;
  let k = 0;
  while (t < spanMs && pat.length) {
    const dur = pat[k % pat.length] * tickMs;
    frames.push({ start: t, dur: Math.min(dur, spanMs - t), n: k });
    t += dur;
    k++;
  }
  const durations = cadenceDurationsMs(cadence)
    .filter((d) => d > 0)
    .map((d) => d.toFixed(1));
  return (
    <figure className="timeline" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="timeline-svg" role="img" aria-label={`Simulated cadence timeline: ${cadence.label}`}>
        <text x={10} y={14} className="tick">
          {grid
            ? `ProMotion timing grid (${PROMOTION_STEP_MS.toFixed(2)} ms steps)`
            : `display refresh (${cadence.tickHz % 1 ? cadence.tickHz.toFixed(1) : cadence.tickHz} Hz)`}
        </text>
        {ticks.map((tk, i) => (
          <line key={i} x1={10 + tk * scale} x2={10 + tk * scale} y1={20} y2={34} className="refresh-tick" />
        ))}
        <text x={10} y={52} className="tick">
          game frames on screen
        </text>
        {frames.map((f) => (
          <g key={f.n}>
            <rect
              x={10 + f.start * scale + 1}
              y={58}
              width={Math.max(f.dur * scale - 2, 1)}
              height={22}
              rx={3}
              className={`frame-block ${f.n % 2 ? 'b' : 'a'} ${!cadence.even && pat[f.n % pat.length] > Math.min(...pat) ? 'long' : ''}`}
            />
            {f.dur * scale > 40 ? (
              <text x={10 + (f.start + f.dur / 2) * scale} y={73} className="frame-text" textAnchor="middle">
                {((pat[f.n % pat.length] * 1000) / cadence.tickHz).toFixed(1)}
              </text>
            ) : null}
          </g>
        ))}
        <text x={10} y={94} className="tick">
          0
        </text>
        <text x={W - 10} y={94} className="tick" textAnchor="end">
          {spanMs} ms
        </text>
      </svg>
      <figcaption className="small">
        <Chip tone={cadence.even ? 'ok' : 'warn'}>
          {cadence.fit === 'VRR' ? 'VRR - no judder' : cadence.even ? 'Even - no judder' : 'Uneven - judder'}
        </Chip>{' '}
        <span className="muted num">frame on screen: {durations.join(' / ')} ms</span>
      </figcaption>
    </figure>
  );
}

export function PerformanceView({ telemetry }: { telemetry: Telemetry }) {
  const { state, update } = useApp();
  const perf = state.perf;
  const set = (patch: Partial<PerfSettings>) => update((s) => ({ ...s, perf: { ...s.perf, ...patch } }));
  const summary = useMemo(() => summarisePerf(perf, state.display), [perf, state.display]);
  const w = summary.workload;
  const { mode, menu, option } = summary.cap;
  const cadence = summary.cadence;
  const connections = vrrConnections(perf.vrrVerified);
  const setMode = (id: PanelModeId) => set({ panelMode: { ...perf.panelMode, [state.display]: id } });

  return (
    <div className="view performance">
      <div className="grid-2">
        <Card title="Frame cap and presentation" tag={<SimTag />}>
          <Segmented<DisplayId>
            id="perf-display"
            label="Display (simulated)"
            value={state.display}
            options={[
              { value: 'macbook', label: 'MacBook XDR' },
              { value: 'a95l', label: 'Sony A95L' },
            ]}
            onChange={(v) => update((s) => ({ ...s, display: v }))}
          />
          <Segmented<PanelModeId>
            id="panel-mode"
            label="Panel mode (fullscreen)"
            value={mode.id}
            options={panelModes(state.display).map((m) => ({
              value: m.id,
              label: m.label,
              disabled: !panelModeAvailable(state.display, m.id, perf.vrrVerified),
              hint: m.id === 'vrr' && !perf.vrrVerified ? 'Offered only after gate G6-1 verifies HDMI VRR' : undefined,
            }))}
            onChange={setMode}
          />
          {state.display === 'a95l' ? (
            <Toggle
              id="vrr-verified"
              label="VRR verified (gate G6-1), simulated"
              checked={perf.vrrVerified}
              onChange={(v) =>
                update((s) => ({
                  ...s,
                  perf: { ...s.perf, vrrVerified: v, panelMode: { ...s.perf.panelMode, a95l: v ? 'vrr' : s.perf.panelMode.a95l === 'vrr' ? 'fixed120' : s.perf.panelMode.a95l } },
                }))
              }
              hint="Off by default: HDMI VRR from macOS to the A95L is unverified. Only a passed G6-1 adds the VRR menu row."
            />
          ) : null}
          <Segmented<CapFps>
            id="frame-cap"
            label="Frame cap"
            value={option.fps}
            options={menu.map((o) => ({ value: o.fps, label: o.label, hint: o.warning ?? undefined }))}
            onChange={(v) => set({ cap: v })}
          />
          <div className="cap-chips" data-testid="cap-chips">
            {menu.map((o) =>
              o.chip ? (
                <Chip key={o.fps} tone={capChipTone(o)}>
                  {o.chip === 'Native' ? '30 (native)' : `${o.fps}: ${o.chip === 'VRR' ? 'VRR, smooth' : o.chip.toLowerCase()}`}
                </Chip>
              ) : null,
            )}
          </div>
          {option.warning ? (
            <div className="callout warn small" data-testid="cap-warning" role="status">
              <p>{option.warning}</p>
              <div className="btn-row">
                {option.suggest.map((f) => (
                  <button key={f} type="button" className="btn btn-ghost btn-sm" id={`use-cap-${f}`} onClick={() => set({ cap: f })}>
                    Use {f}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {option.fps === 60 ? (
            <p className="callout small" data-testid="cap-60-note">
              60 is experimental until gate G-60. With D2 at 1.2x, prior runs reached 44.8-50.9 FPS on Great Sky Island and 60 only in menus
              [E].
            </p>
          ) : null}
          {!perf.timingPatch ? (
            <p className="callout warn small" data-testid="d2-missing">
              Timing patch missing: 30 (native) only.
            </p>
          ) : null}
          <div className="presentation-box">
            <p className="presentation-label num" data-testid="perf-presentation-label" aria-live="polite">
              {cadence.label}
            </p>
            <CadenceStrip cadence={cadence} />
            <p className="small fit-line" data-testid="perf-cadence-fit">
              <Chip tone={cadence.fit === 'uneven' ? 'warn' : 'ok'}>Cadence fit: {cadence.fit}</Chip>{' '}
              {option.suggest.length ? <span>Suggested: {option.suggest.join(' or ')}</span> : null}
            </p>
            {cadence.mode === 'vrr-lfc' ? (
              <p className="small muted" data-testid="panel-rate-note">
                Host frame doubling: each game frame is shown {cadence.pattern[0]} times, so the panel runs at {cadence.panelHz} Hz, above the
                reported 48 Hz VRR floor.
              </p>
            ) : null}
            {mode.id === 'promotion' ? (
              <p className="small muted">
                ProMotion is not continuous VRR: frame times snap to {PROMOTION_STEP_MS.toFixed(2)} ms steps (120, 80, 60, 48, 40, 34.3, 30 Hz
                ...). VRR needs fullscreen; windowed play uses the fixed panel rate.
              </p>
            ) : null}
          </div>
        </Card>

        <Card title="Cadence timeline" tag={<SimTag />}>
          <CadenceTimeline cadence={cadence} />
          <p className="muted small">
            {mode.id === 'promotion' ? 'Grey ticks are the 4.17 ms steps a ProMotion frame can last. ' : 'Grey ticks are display refreshes. '}
            Each block is one game frame and how long it stays on screen. Unequal blocks are judder, even at a steady FPS counter.
          </p>
          <h3 className="sub-head">Frame time</h3>
          <FrameTimeGraph frames={telemetry.frames} height={130} capMs={1000 / summary.capFps} />
          <p className="muted small">
            Simulated frame times for the last 300 frames at the current settings ({telemetry.stats.avgFps.toFixed(1)} FPS average, p99{' '}
            {telemetry.stats.p99Ms.toFixed(1)} ms).
          </p>
        </Card>
      </div>

      <Card title="Variable refresh by connection" tag={<SimTag label="Example states" />}>
        <ul className="vrr-list">
          {connections.map((c) => (
            <li key={c.id} className="vrr-row" data-testid={`vrr-${c.id}`}>
              <div>
                <strong>{c.label}</strong>
                <span className="muted small"> - {c.connection}</span>
                {c.role === 'control case' ? <Chip tone="neutral">Control case, not a target</Chip> : null}
                <p className="small muted">{c.note}</p>
              </div>
              <div className="vrr-state">
                <Chip tone={vrrTone(c.state)}>{c.state}</Chip>
                <span className="num small muted">
                  <NoBreak text={c.range} />
                </span>
                <span className="small muted">
                  Gate: <NoBreak text={c.gate} />
                </span>
              </div>
            </li>
          ))}
        </ul>
        <p className="legend small">
          <Chip tone="ok">Verified</Chip> passed its gate <Chip tone="warn">Unverified</Chip> supported on paper, not yet tested{' '}
          <Chip tone="neutral">Not available</Chip> the link cannot carry VRR. A connection without verified VRR uses the menu of its fixed refresh
          rate.
        </p>
      </Card>

      <div className="grid-2">
        <Card title="D2 timing patch" tag={<><Chip tone="warn">Experimental</Chip><SimTag /></>}>
          <Toggle
            id="timing-patch"
            label="D2 timing patch: owner-supplied, experimental"
            checked={perf.timingPatch}
            onChange={(v) => set({ timingPatch: v })}
            hint="Steps game time from measured frame time (clamped to 15-60 FPS). It lives in your private title pack and is checked by checksum; it is never in a public repository."
          />
          <ul className="fact-list small">
            <li>Without it, only 30 (native) is offered: vanilla game speed is tied to the frame interval.</li>
            <li>With it, Unbounded, turbo and caps above 60 are refused: frames shorter than 16.7 ms would run the game fast.</li>
            <li>Walk test only: audio, movies and long-session physics are not validated (gate G6-4). Movies may run fast until G6-3.</li>
          </ul>
          <div className="kv">
            <span>Game logic runs at</span>
            <strong className="num">{option.chip === 'Native' ? '30 (native)' : `${summary.capFps} FPS cap`}</strong>
          </div>
        </Card>

        <Card title="Internal resolution" tag={<SimTag label="Simulated estimate" />}>
          <Segmented<ResolutionScale>
            id="internal-res"
            label="Scale"
            value={perf.resolution}
            options={RESOLUTIONS.map((r) => ({ value: r.scale, label: r.label, hint: r.pixels }))}
            onChange={(v) => set({ resolution: v })}
          />
          <p className="small muted">{RESOLUTIONS.find((r) => r.scale === perf.resolution)?.pixels}</p>
          <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={w.gpuLoadPct} aria-label="Simulated GPU load">
            <span style={{ width: `${w.gpuLoadPct}%` }} className={w.gpuLoadPct > 90 ? 'hot' : ''} />
          </div>
          <div className="stat-grid three">
            <Stat label="GPU load" value={w.gpuLoadPct} unit="%" />
            <Stat label="GPU / CPU" value={`${w.gpuMs.toFixed(1)} / ${w.cpuMs.toFixed(1)}`} unit="ms" />
            <Stat label="Expected" value={summary.expectedFps.toFixed(0)} unit="fps" tone="accent" sub={`${w.bound}-bound`} />
          </div>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Graphics backend" tag={<SimTag />}>
          <ul className="backend-list" aria-label="Graphics backend track">
            {BACKENDS.map((b) => (
              <li key={b.id} className={`backend-row ${b.id === 'moltenvk' ? 'on' : ''}`} id={`backend-${b.id}`}>
                <span className="rc-top">
                  <strong>{b.name}</strong>
                  <Chip tone={b.tone}>{b.status}</Chip>
                </span>
                <span className="small">
                  <NoBreak text={b.text} />
                </span>
                <span className="small muted">
                  <NoBreak text={b.gate} />
                </span>
              </li>
            ))}
          </ul>
          <p className="small muted">All Luma graphics code is Vulkan-only, so a later switch to KosmicKrisp needs no Luma rework.</p>
        </Card>

        <Card title="Shader cache and hypervisor" tag={<SimTag />}>
          <Segmented
            id="shader-cache"
            label="Shader cache"
            value={perf.coldCache ? 'cold' : 'warm'}
            options={[
              { value: 'warm', label: 'Warm' },
              { value: 'cold', label: 'Cold' },
            ]}
            onChange={(v) => set({ coldCache: v === 'cold' })}
          />
          <p className="small muted">A new build always starts cold: about 85-88 s to rebuild about 1,017 shaders [E]. Compiles show up as frame-time spikes.</p>
          <Toggle
            id="hypervisor"
            label="Hypervisor On + A+B fix"
            checked={perf.hypervisor}
            onChange={(v) => set({ hypervisor: v })}
            hint="Default is Hypervisor Off at 1.2x until gate G-AB passes."
          />
          <p className="small">
            <Chip tone="warn">A+B fix built, in-game validation pending (gate G-AB)</Chip>
          </p>
          <p className={`callout ${perf.hypervisor ? 'critical' : 'warn'} small`} role={perf.hypervisor ? 'alert' : undefined} data-testid="hypervisor-warning">
            Known artifact: black or tiled flashing frames with the hypervisor on (10 flashes in 850 s before the fix [E]). G-AB runs at least 900 s
            per scene against that rate.
          </p>
        </Card>
      </div>
    </div>
  );
}
