import { NATIVE_CAP_LABEL } from '../sim/caps';
import { OUTPUT_CONTAINER, OUTPUT_RULES } from '../sim/displays';
import { FALSE_COLOR_STOPS } from '../sim/pipeline';
import { SOURCE_MODE_LABELS, activeStages, simulatedSourceMode } from '../sim/source';
import { useApp } from '../state/context';
import { MEASURED_WINDOWS, headroomInfo, measuredContext } from '../state/store';
import type { Telemetry } from '../state/useTelemetry';
import { CadenceStrip, FrameTimeGraph, HistogramChart, WaveformChart, useScopes } from './charts';
import type { ScopeData } from './charts';
import { Chip, LabelChip, Segmented, SimTag, Stat, Toggle, fmtNits, fmtPct } from './ui';
import type { Tone } from './ui';

function HeadroomCard() {
  const { state } = useApp();
  const hr = headroomInfo(state);
  const d = hr.display;
  const cal = state.calib[state.display];
  const m = cal.measured;
  const readings = (['white', 'peak', 'black'] as const).filter((k) => m[k] !== null);
  const hdr = state.visual.hdr;
  const mac = d.id === 'macbook';
  // ADR 0002 D9: Mac nits appear only as "assumed N nits at EDR 1.0"
  const macAssumed = `assumed ${fmtNits(hr.paperWhite)} nits at EDR 1.0`;
  return (
    <section className="panel" aria-label="Display headroom">
      <header className="panel-head">
        <h3>Display headroom</h3>
        <SimTag />
      </header>
      <div className="kv">
        <span>Active display</span>
        <strong>{d.shortName}</strong>
      </div>
      <div className="sub-block">
        <h4>
          What the renderer sends <LabelChip kind="signal" />
        </h4>
        <div className="stat-grid">
          <Stat
            label={d.potentialHeadroom ? 'EDR headroom now' : 'Headroom over paper white'}
            value={hdr ? `${hr.headroomNow.toFixed(1)}x` : '1.0x'}
            sub={d.potentialHeadroom ? `potential ${hr.headroomPotential.toFixed(1)}x` : 'peak / paper white'}
          />
          <Stat
            label="Peak output"
            value={fmtNits(hdr ? hr.computedPeak : hr.paperWhite)}
            unit="nits"
            tone="accent"
            sub={
              hdr && hr.limitedBy === 'panel'
                ? 'capped at the example panel peak'
                : hdr && hr.limitedBy === 'edr-headroom'
                  ? 'limited by EDR headroom'
                  : mac
                    ? macAssumed
                    : undefined
            }
          />
        </div>
      </div>
      <div className="sub-block">
        <h4>
          Targets <LabelChip kind="profile" />
        </h4>
        <div className="stat-grid">
          <Stat label="Paper white" value={fmtNits(hr.paperWhite)} unit="nits" sub={mac ? macAssumed : 'BT.2408 reference 203'} />
          <Stat label="UI white" testId="ui-white" value={fmtNits(hr.uiWhite)} unit="nits" sub={`paper white x ${cal.uiScale.toFixed(2)}`} />
        </div>
      </div>
      <div className="sub-block measured">
        <h4>
          Meter readings <LabelChip kind="measured" />
        </h4>
        {readings.length ? (
          <ul className="measured-list small num">
            {readings.map((k) => (
              <li key={k}>
                {k === 'white' ? 'Paper white' : k === 'peak' ? 'Peak' : 'Black'} {fmtNits(m[k] as number)} nits, {MEASURED_WINDOWS[k]},{' '}
                {measuredContext(m)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Not measured. Readings entered in Calibrate, step g, show here with window size, date and instrument.</p>
        )}
      </div>
    </section>
  );
}

function PipelinePanel() {
  const { state } = useApp();
  const mode = simulatedSourceMode(state.visual.hdr);
  const looks = activeStages(mode);
  const pad = state.controller;
  const player = !pad.agentPad
    ? `Owner pad, ${pad.connection === 'usb' ? 'USB' : 'Bluetooth'}${pad.connected ? '' : ' (disconnected)'}`
    : pad.agentEstop
      ? 'Agent stopped: you took control (ESTOP)'
      : 'Agent pad; any physical input stops it';
  return (
    <section className="panel pipeline" aria-label="Source and pipeline">
      <header className="panel-head">
        <h3>Source and pipeline</h3>
        <SimTag />
      </header>
      <dl className="kv-list small">
        <div className="kv-source">
          <dt>Source mode</dt>
          <dd>
            <strong data-testid="source-mode">{SOURCE_MODE_LABELS[mode]}</strong> <Chip tone="warn">Simulated</Chip>
          </dd>
        </div>
        <div>
          <dt>Looks</dt>
          <dd data-testid="looks-stage">{looks.label}</dd>
        </div>
        <div>
          <dt>Output</dt>
          <dd>
            {OUTPUT_CONTAINER}, {OUTPUT_RULES}
          </dd>
        </div>
        <div>
          <dt>Backend</dt>
          <dd>MoltenVK 1.4.2-ryujinx.5 (baseline)</dd>
        </div>
        <div>
          <dt>CPU</dt>
          <dd>{state.perf.hypervisor ? 'Hypervisor On + A+B (G-AB pending)' : 'Hypervisor Off'}</dd>
        </div>
        <div>
          <dt>Player 1</dt>
          <dd data-testid="player-owner">{player}</dd>
        </div>
      </dl>
    </section>
  );
}

function fitTone(fit: 'even' | 'uneven' | 'VRR'): Tone {
  return fit === 'uneven' ? 'warn' : 'ok';
}

function ClippingCard({ data }: { data: ScopeData | null }) {
  const { state, update } = useApp();
  const dash = state.dashboard;
  return (
    <section className="panel" aria-label="Clipping">
      <header className="panel-head">
        <h3>Clipping</h3>
        <SimTag />
      </header>
      <div className="stat-grid two">
        <Stat
          label="Above display peak"
          value={data ? fmtPct(data.clip.aboveFraction) : '-'}
          tone={data && data.clip.aboveFraction > 0.01 ? 'critical' : undefined}
          sub={data ? `scene max ${fmtNits(data.sceneMax)} nits` : undefined}
        />
        <Stat
          label="Below black floor"
          value={data ? fmtPct(data.clip.belowFraction) : '-'}
          tone={data && data.clip.belowFraction > 0.05 ? 'warn' : undefined}
          sub={data ? `floor ${fmtNits(data.black)} nits` : undefined}
        />
      </div>
      <p className="muted small">
        {state.visual.hdr
          ? 'Pixels above the peak are rolled off by the selected curve, not hard-clipped (unless the curve is Hard clip).'
          : 'Faithful SDR: everything above paper white clips.'}
      </p>
      <div className="toggle-row">
        <Toggle
          id="dash-zebra"
          label={state.visual.hdr && state.calib[state.display].curve !== 'hardClip' ? 'Zebra above display peak' : 'Zebra on clipped pixels'}
          checked={dash.zebra}
          onChange={(v) => update((s) => ({ ...s, dashboard: { ...s.dashboard, zebra: v } }))}
        />
        <Toggle
          id="dash-falsecolor"
          label="False-colour heatmap"
          checked={dash.falseColor}
          onChange={(v) => update((s) => ({ ...s, dashboard: { ...s.dashboard, falseColor: v } }))}
        />
      </div>
      {dash.zebra ? (
        <p className="legend small">
          <span className="swatch zebra-hi" /> above peak <span className="swatch zebra-lo" /> below black floor
        </p>
      ) : null}
      {dash.falseColor ? (
        <div className="false-legend" aria-label="False-colour legend, output nits">
          {FALSE_COLOR_STOPS.map((s) => (
            <span
              key={s.nits}
              style={{
                background: `rgb(${s.rgb.join(',')})`,
                color: 0.2126 * s.rgb[0] + 0.7152 * s.rgb[1] + 0.0722 * s.rgb[2] < 110 ? '#eef2f8' : '#0b0f16',
              }}
              title={`${s.nits} nits`}
            >
              {s.nits >= 1000 ? `${s.nits / 1000}k` : s.nits}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function FpsBlock({ t }: { t: Telemetry }) {
  const { state } = useApp();
  const s = t.stats;
  const c = t.summary.cadence;
  return (
    <section className="panel" aria-label="Frame rate">
      <header className="panel-head">
        <h3>Frame rate</h3>
        <div className="head-chips">
          <Chip tone={state.perf.coldCache ? 'warn' : 'ok'}>{state.perf.coldCache ? 'Cold shader cache' : 'Warm shader cache'}</Chip>
          <SimTag />
        </div>
      </header>
      <div className="stat-grid four">
        <Stat
          label="Game FPS"
          testId="game-fps"
          value={s.avgFps.toFixed(1)}
          tone="accent"
          sub={t.summary.cap.option.chip === 'Native' ? NATIVE_CAP_LABEL : `cap ${t.summary.cap.option.label}`}
        />
        <Stat label="Presented FPS" value={t.presentedFps.toFixed(0)} sub="incl. repeats" />
        <Stat label="Panel refresh" value={c.panelHz % 1 ? c.panelHz.toFixed(1) : c.panelHz} unit="Hz" sub={t.summary.cap.mode.label} />
        <Stat label="1% low" value={s.low1Fps.toFixed(1)} unit="fps" tone={s.low1Fps < 25 ? 'warn' : undefined} />
        <Stat label="p99 frame time" testId="p99-ms" value={s.p99Ms.toFixed(1)} unit="ms" />
        <Stat label="Stutters" value={s.stuttersPerMin.toFixed(1)} unit="/min" tone={s.stuttersPerMin > 5 ? 'warn' : undefined} />
        <Stat label="Shader compiles" value={s.shaderEvents} sub="last 300 frames" />
        <Stat label="Bound by" value={t.summary.workload.bound} sub={`GPU ${t.summary.workload.gpuMs.toFixed(1)} ms, CPU ${t.summary.workload.cpuMs.toFixed(1)} ms`} />
      </div>
    </section>
  );
}

/** "even", "uneven" or "VRR", plus the evenly paced neighbour when the cap is uneven (ADR 0003 §2). */
function FitLine({ t }: { t: Telemetry }) {
  const c = t.summary.cadence;
  const opt = t.summary.cap.option;
  return (
    <p className="fit-line small" data-testid="cadence-fit">
      <Chip tone={fitTone(c.fit)}>Cadence fit: {c.fit}</Chip>{' '}
      {opt.suggest.length ? (
        <span>Suggested: {opt.suggest.join(' or ')} (even on this panel)</span>
      ) : c.fit === 'uneven' ? (
        <span>Frames miss the cap here; the cadence follows the real frame rate.</span>
      ) : null}
    </p>
  );
}

function PresentationStrip({ t }: { t: Telemetry }) {
  const c = t.summary.cadence;
  return (
    <section className="panel presentation" aria-label="Presentation">
      <header className="panel-head">
        <h3>Presentation</h3>
        <div className="head-chips">
          <SimTag />
        </div>
      </header>
      <p className="presentation-label num" data-testid="presentation-label">
        {c.label}
      </p>
      <CadenceStrip cadence={c} />
      <FitLine t={t} />
    </section>
  );
}

export function Dashboard({ telemetry, onClose }: { telemetry: Telemetry; onClose: () => void }) {
  const { state, update } = useApp();
  const dash = state.dashboard;
  const scopes = useScopes(dash.source, dash.open);
  const capMs = 1000 / telemetry.summary.capFps;
  const setDash = (patch: Partial<typeof dash>) => update((s) => ({ ...s, dashboard: { ...s.dashboard, ...patch } }));

  const header = (
    <div className="dash-bar">
      <div className="dash-title">
        <h2>HDR and performance</h2>
        <SimTag label="Simulated telemetry" />
      </div>
      <div className="dash-controls">
        <Segmented
          id="dash-layout"
          label="Layout"
          hideLabel
          size="sm"
          value={dash.layout}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'full', label: 'Full' },
          ]}
          onChange={(v) => setDash({ layout: v })}
        />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close dashboard (backquote key or DualSense mute button)">
          Close <kbd>`</kbd>
        </button>
      </div>
    </div>
  );

  if (dash.layout === 'compact') {
    const s = telemetry.stats;
    const hr = headroomInfo(state);
    return (
      <div className="dashboard compact" role="region" aria-label="HDR and performance dashboard" id="dashboard">
        <div className="dash-dock dock-right">
          {header}
          <section className="panel" aria-label="Summary">
            <header className="panel-head">
              <h3>Summary</h3>
              <SimTag />
            </header>
            <div className="stat-grid three">
              <Stat label="Game FPS" value={s.avgFps.toFixed(1)} tone="accent" />
              <Stat label="1% low" value={s.low1Fps.toFixed(1)} />
              <Stat label="p99" value={s.p99Ms.toFixed(1)} unit="ms" />
              <Stat label="Headroom" value={state.visual.hdr ? `${hr.headroomNow.toFixed(1)}x` : '1.0x'} />
              <Stat label="Peak out" value={fmtNits(state.visual.hdr ? hr.computedPeak : hr.paperWhite)} unit="nits" />
              <Stat label="Above peak" value={scopes ? fmtPct(scopes.clip.aboveFraction) : '-'} />
            </div>
            <p className="small source-line">
              Source mode: <strong data-testid="source-mode">{SOURCE_MODE_LABELS[simulatedSourceMode(state.visual.hdr)]}</strong>{' '}
              <Chip tone="warn">Simulated</Chip>
            </p>
            <FrameTimeGraph frames={telemetry.frames} height={64} capMs={capMs} />
            <p className="presentation-label num small" data-testid="presentation-label">
              {telemetry.summary.cadence.label}
            </p>
            <CadenceStrip cadence={telemetry.summary.cadence} compact />
            <FitLine t={telemetry} />
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard full" role="region" aria-label="HDR and performance dashboard" id="dashboard">
      <div className="dash-dock dock-top">{header}</div>
      <div className="dash-dock dock-left">
        <HeadroomCard />
        <ClippingCard data={scopes} />
      </div>
      <div className="dash-dock dock-right">
        <section className="panel" aria-label="Luminance histogram">
          <header className="panel-head">
            <h3>Luminance histogram</h3>
            <SimTag />
          </header>
          <div className="panel-sub">
            <span className="axis-note small">{dash.source === 'scene' ? 'Graded scene, before tone map' : 'Sent to the display'}</span>
            <Segmented
              id="dash-source"
              label="Signal"
              hideLabel
              size="sm"
              value={dash.source}
              options={[
                { value: 'scene', label: 'Scene' },
                { value: 'output', label: 'Output' },
              ]}
              onChange={(v) => setDash({ source: v })}
            />
          </div>
          <HistogramChart data={scopes} height={90} />
          <p className="axis-note small">nits, log scale (0.005 to 10,000)</p>
        </section>
        <section className="panel" aria-label="Waveform">
          <header className="panel-head">
            <h3>Waveform</h3>
            <SimTag />
          </header>
          <WaveformChart data={scopes} height={92} />
          <p className="axis-note small">nits on a PQ scale, image columns left to right</p>
        </section>
        <PipelinePanel />
      </div>
      <div className="dash-dock dock-bottom">
        <section className="panel frametime" aria-label="Frame time">
          <header className="panel-head">
            <h3>Frame time</h3>
            <div className="head-chips">
              <span className="legend small">
                <span className="swatch sw-warn" /> &gt;33 ms <span className="swatch sw-crit" /> &gt;50 ms
              </span>
              <SimTag />
            </div>
          </header>
          <FrameTimeGraph frames={telemetry.frames} height={112} capMs={capMs} />
        </section>
        <FpsBlock t={telemetry} />
        <PresentationStrip t={telemetry} />
      </div>
    </div>
  );
}
