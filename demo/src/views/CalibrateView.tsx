import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Card, Chip, LabelChip, Segmented, SimTag, Slider, fmtNits } from '../components/ui';
import type { LabelClass } from '../components/ui';
import type { Tone } from '../components/ui';
import { BT2020, BT709, P3_D65, srgbEncode } from '../sim/color';
import type { Primaries } from '../sim/color';
import { DISPLAYS, DOLBY_VISION_STATEMENT, OUTPUT_CONTAINER, OUTPUT_CONTAINER_LONG, OUTPUT_RULES, UI_SCALE_MAX, UI_SCALE_MIN } from '../sim/displays';
import type { DisplayProfile, ValueStatus } from '../sim/displays';
import { CURVE_LABELS, bt2390KneeNits, toneMap } from '../sim/tonemap';
import type { CurveId, ToneParams } from '../sim/tonemap';
import { useApp } from '../state/context';
import { MEASURED_WINDOWS, headroomInfo, measuredContext } from '../state/store';
import type { AppState, Calibration, DisplayId } from '../state/store';

const STEPS = [
  { id: 'mode', label: 'Display and mode' },
  { id: 'paper', label: 'Paper white' },
  { id: 'peak', label: 'Peak luminance' },
  { id: 'black', label: 'Black level' },
  { id: 'rolloff', label: 'Highlight roll-off' },
  { id: 'gamut', label: 'Gamut' },
  { id: 'measured', label: 'Measured values' },
  { id: 'summary', label: 'Summary and save' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

function useCalibration() {
  const { state, update } = useApp();
  const cal = state.calib[state.display];
  const setCal = (patch: Partial<Calibration>) =>
    update((s) => ({ ...s, calib: { ...s.calib, [s.display]: { ...s.calib[s.display], ...patch, savedAt: patch.savedAt ?? null } } }));
  return { state, update, cal, setCal, display: DISPLAYS[state.display] };
}

function statusTone(s: ValueStatus | string): Tone {
  if (s === 'spec') return 'info';
  if (s.startsWith('example')) return 'warn';
  if (s.startsWith('unknown') || s.startsWith('unverified') || s === 'Unverified') return 'neutral';
  return 'neutral';
}

// --- profile picker -------------------------------------------------------------

function ProfilePicker() {
  const { state, update } = useApp();
  const ids: DisplayId[] = ['macbook', 'a95l'];
  return (
    <div className="profile-grid" role="radiogroup" aria-label="Display profile">
      {ids.map((id) => {
        const d = DISPLAYS[id];
        const on = state.display === id;
        const saved = state.calib[id].savedAt;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            id={`profile-${id}`}
            className={`profile-card ${on ? 'on' : ''}`}
            onClick={() => update((s) => ({ ...s, display: id }))}
          >
            <span className="profile-name">{d.name}</span>
            <span className="profile-chips">
              <Chip tone="neutral">{OUTPUT_CONTAINER}</Chip>
              <Chip tone="neutral">{d.panel}</Chip>
              {saved ? <Chip tone="ok">Saved (simulated)</Chip> : <Chip tone="warn">Not calibrated</Chip>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// --- step a: display and mode ------------------------------------------------------

function modeRows(d: DisplayProfile, state: AppState): { k: string; v: string; status: string }[] {
  const hr = headroomInfo(state);
  if (d.id === 'macbook') {
    return [
      { k: 'Connection', v: 'Built-in', status: 'Detected (simulated)' },
      { k: 'Refresh', v: 'ProMotion: 4.17 ms steps (120, 80, 60, 48, 40, 34.3, 30 Hz ...)', status: 'spec' },
      { k: 'EDR (extended dynamic range)', v: 'Available', status: 'Detected (simulated)' },
      { k: 'Output', v: `${OUTPUT_CONTAINER_LONG}; ${OUTPUT_RULES}`, status: 'Planned (ADR 0002)' },
      { k: 'Potential EDR headroom', v: `${d.potentialHeadroom?.value ?? '-'}x`, status: d.potentialHeadroom?.status ?? 'unknown - to verify' },
      { k: 'EDR headroom right now', v: `${hr.headroomNow.toFixed(1)}x at ${hr.paperWhite} nits paper white`, status: 'Changes with brightness' },
      { k: 'Peak / sustained', v: `${fmtNits(d.peakNits.value)} / ${fmtNits(d.sustainedFullScreenNits.value)} nits`, status: 'spec' },
      { k: 'Swapchain format', v: d.bitDepth.value, status: 'Unknown - to verify' },
      { k: 'Variable refresh', v: 'Not continuous VRR: discrete 4.17 ms steps', status: 'Unverified' },
      { k: 'Dolby Vision', v: DOLBY_VISION_STATEMENT, status: 'Not supported' },
    ];
  }
  return [
    { k: 'Connection', v: 'HDMI 2.1 port (HDMI 3 or 4) with Enhanced format for that input', status: 'Unknown - to verify' },
    { k: 'Signal', v: '3840 x 2160 at 120 Hz', status: 'Unknown - to verify' },
    { k: 'macOS "High Dynamic Range" for this display', v: 'Must be on (System Settings > Displays)', status: 'Unknown - to verify' },
    { k: 'Output', v: `${OUTPUT_CONTAINER_LONG}; macOS sends HDR10 over HDMI; ${OUTPUT_RULES}`, status: 'Planned (ADR 0002)' },
    { k: 'TV picture mode', v: 'Game; HDR Tone Mapping Off while you calibrate (HGIG-style), then A/B with Gradation', status: 'Unknown - set on the TV' },
    { k: 'Peak (10% window)', v: `about ${fmtNits(d.peakNits.value)} nits`, status: d.peakNits.status },
    { k: 'Full-field brightness', v: `about ${fmtNits(d.sustainedFullScreenNits.value)} nits`, status: d.sustainedFullScreenNits.status },
    { k: 'Bit depth', v: d.bitDepth.value, status: 'Unknown - to verify' },
    { k: 'Variable refresh', v: 'HDMI VRR, 48-120 Hz reported', status: 'Unverified (gate G6-1)' },
    { k: 'TV signal badge', v: 'Reads HDR10, not Dolby Vision', status: 'Unknown - check on the TV' },
    { k: 'Dolby Vision', v: DOLBY_VISION_STATEMENT, status: 'Not supported' },
  ];
}

function StepMode() {
  const { state, display } = useCalibration();
  const rows = modeRows(display, state);
  return (
    <div className="step-body">
      <p>
        The real app would read these from macOS when you pick a profile. Here every value is <strong>simulated</strong>. Anything the
        app cannot prove stays marked as unknown until you check it.
      </p>
      <table className="data-table stack-sm">
        <caption className="sr-only">Simulated detected capabilities</caption>
        <thead>
          <tr>
            <th scope="col">Capability</th>
            <th scope="col">Value</th>
            <th scope="col">State</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <th scope="row">{r.k}</th>
              <td className="num">{r.v}</td>
              <td>
                <Chip tone={statusTone(r.status)}>{r.status}</Chip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- step b: paper white -------------------------------------------------------------

function StepPaper() {
  const { state, cal, setCal, display } = useCalibration();
  const hr = headroomInfo(state);
  const max = Math.max(hr.computedPeak, 1600);
  const pos = (n: number) => `${Math.min(100, Math.max(0, (Math.log10(n) / Math.log10(max)) * 100))}%`;
  // a decade tick too close to the end label would collide with it
  const scaleTicks = [1, 10, 100, 1000].filter((t) => Math.log10(max / t) > 0.3);
  return (
    <div className="step-body">
      <Slider
        id="paper-white"
        label="Paper white (UI and diffuse white)"
        value={cal.paperWhite}
        min={80}
        max={500}
        step={1}
        format={(v) => `${v} nits`}
        onChange={(v) => setCal({ paperWhite: v })}
        hint="Game diffuse white. 203 nits is the BT.2408 reference."
      />
      <Slider
        id="ui-scale"
        label="UI scale (UI white = paper white x scale)"
        value={cal.uiScale}
        min={UI_SCALE_MIN}
        max={UI_SCALE_MAX}
        step={0.01}
        format={(v) => `x ${v.toFixed(2)}`}
        onChange={(v) => setCal({ uiScale: v })}
        hint="Menus, text and the dashboard are drawn at UI white or below, so they never glare (SDR-safe UI). Default 0.85, range 0.6-1.0."
      />
      <p className="ui-white-line" data-testid="ui-white-line">
        UI white: <strong className="num">{fmtNits(hr.uiWhite)} nits</strong> = paper white {cal.paperWhite} x {cal.uiScale.toFixed(2)}{' '}
        <LabelChip kind="profile" />
      </p>
      <div
        className="headroom-bar"
        role="img"
        aria-label={`Paper white ${cal.paperWhite} nits and peak ${fmtNits(hr.computedPeak)} nits on a log scale from 1 to ${max.toLocaleString('en-US')} nits`}
      >
        <div className="hb-track">
          <span className="hb-fill" style={{ width: pos(cal.paperWhite) }} />
          <span className="hb-mark ui" style={{ left: pos(hr.uiWhite) }} aria-hidden="true" />
          <span className="hb-mark pw" style={{ left: pos(cal.paperWhite) }}>
            <em>paper white {cal.paperWhite}</em>
          </span>
          <span className="hb-mark pk" style={{ left: pos(hr.computedPeak) }}>
            <em>peak {fmtNits(hr.computedPeak)}</em>
          </span>
        </div>
        <div className="hb-scale num small" aria-hidden="true">
          {scaleTicks.map((t) => (
            <span key={t} className="hb-tick" style={{ left: pos(t) }}>
              {t >= 1000 ? `${t / 1000}k` : t}
            </span>
          ))}
          <span className="hb-tick end" style={{ left: '100%' }}>
            {(max / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k
          </span>
        </div>
      </div>
      <div className="callout">
        <div className="callout-row">
          <strong>Headroom now: {hr.headroomNow.toFixed(1)}x</strong>
          <SimTag />
        </div>
        {display.id === 'macbook' ? (
          <p>
            On the MacBook, paper white follows the macOS brightness slider, and HDR highlights can only go as far as the panel allows,
            so raising brightness shrinks the EDR headroom. macOS can also change the headroom while you play (ambient light, battery,
            heat), so the app would re-read it every frame and re-fit the roll-off.
          </p>
        ) : (
          <p>
            Over HDMI, macOS converts the EDR output to HDR10 (PQ), where values are absolute nits, so changing paper white here does not
            move the peak ({fmtNits(hr.computedPeak)} nits). The TV tone-maps anything above its own peak unless HDR Tone Mapping is Off
            (HGIG-style), which is why the peak test matters for the A95L.
          </p>
        )}
      </div>
    </div>
  );
}

// --- step c: peak luminance -----------------------------------------------------------

function patternGrey(nits: number, clip: number): string {
  const lo = Math.log10(200);
  const hi = Math.log10(clip);
  const t = Math.min(Math.max((Math.log10(Math.max(nits, 1)) - lo) / (hi - lo), 0), 1);
  const v = Math.round(srgbEncode(0.03 + 0.8 * t * t) * 255);
  return `rgb(${v},${v},${v})`;
}

function StepPeak() {
  const { cal, setCal, display } = useCalibration();
  const clip = display.simulatedClipNits;
  const shown = (signal: number) => Math.min(signal, clip);
  const gone = cal.peak >= clip;
  return (
    <div className="step-body two-col">
      <div>
        <div
          className="peak-pattern"
          role="img"
          aria-label={gone ? 'Peak pattern: the inner square has disappeared' : 'Peak pattern: the inner square is still visible'}
          style={{ background: patternGrey(shown(10000), clip) }}
        >
          <div className="peak-inner" style={{ background: patternGrey(shown(cal.peak), clip) }} />
          <span className="pattern-tag">Simulated panel</span>
        </div>
        <p className="muted small">
          Outer area: a 10,000-nit signal, so the panel shows its maximum. Inner square: the value you set. The pattern covers about 10% of
          the screen. Greys are stretched so differences near the clip point are visible in this SDR preview.
        </p>
      </div>
      <div>
        <Slider
          id="peak-nits"
          label="Peak luminance"
          value={cal.peak}
          min={400}
          max={4000}
          step={10}
          format={(v) => `${v.toLocaleString('en-US')} nits`}
          onChange={(v) => setCal({ peak: v, peakTested: true })}
          hint="Raise the value until the inner square disappears. Use the lowest value where it is gone."
        />
        <div className={`callout ${gone ? 'ok' : ''}`} aria-live="polite">
          <div className="callout-row">
            <strong>{gone ? 'Inner square gone' : 'Inner square visible - keep raising'}</strong>
            <Chip tone={gone ? 'ok' : 'neutral'}>{gone ? 'Peak found' : 'Searching'}</Chip>
          </div>
          <p className="small">
            The simulated panel clips at {clip.toLocaleString('en-US')} nits.{' '}
            {display.peakNits.status === 'spec'
              ? 'This is the spec-sheet peak; your own display decides the real value.'
              : 'This is an example from third-party reviews, to be measured by the owner.'}
          </p>
          {cal.peak > display.peakCeilingNits.value ? (
            <p className="small">
              The renderer will not request more than {display.peakCeilingNits.value.toLocaleString('en-US')} nits on this profile (
              {display.peakCeilingNits.status === 'spec' ? 'spec-sheet peak' : 'example panel peak, to be measured'}).
            </p>
          ) : null}
          {gone && cal.peak > clip + 40 ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCal({ peak: clip, peakTested: true })}>
              Lower to {clip.toLocaleString('en-US')} nits (lowest value where it disappears)
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// --- step d: black level ----------------------------------------------------------------

const BLACK_STEPS = [0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1];

function blackGrey(nits: number): string {
  // exaggerated: 0.0005 -> very dark, 0.1 -> dark grey
  const t = (Math.log10(nits) - Math.log10(0.0002)) / (Math.log10(0.1) - Math.log10(0.0002));
  const v = Math.round(srgbEncode(0.0006 + 0.03 * t * t) * 255);
  return `rgb(${v},${v},${v})`;
}

function StepBlack() {
  const { cal, setCal, display } = useCalibration();
  return (
    <div className="step-body">
      <p>Pick the first patch you can tell apart from the black background. Values below it count as black (the black floor).</p>
      <div className="black-steps" role="radiogroup" aria-label="First visible near-black step">
        {BLACK_STEPS.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={cal.black === n}
            className={`black-step ${cal.black === n ? 'on' : ''}`}
            onClick={() => setCal({ black: n })}
            id={`black-${String(n).replace('.', '_')}`}
          >
            <span className="black-patch" style={{ background: blackGrey(n) }} />
            <span className="num small">{n} nits</span>
          </button>
        ))}
      </div>
      <p className="muted small">Patches are exaggerated for this SDR preview. Selected floor: {cal.black} nits.</p>
      <div className="blooming-compare">
        <figure>
          <div className="bloom-box oled" aria-hidden="true">
            <span className="bloom-dot" />
          </div>
          <figcaption>
            <strong>OLED (A95L)</strong>
            <span className="small muted">Each pixel makes its own light, so a highlight next to black stays clean. Near-black handling is the thing to check.</span>
          </figcaption>
        </figure>
        <figure>
          <div className="bloom-box miniled" aria-hidden="true">
            <span className="bloom-halo" />
            <span className="bloom-dot" />
          </div>
          <figcaption>
            <strong>Mini-LED (MacBook XDR)</strong>
            <span className="small muted">Dimming zones are larger than pixels, so a small highlight on black can show a faint halo (blooming).</span>
          </figcaption>
        </figure>
      </div>
      <p className="muted small">Active profile: {display.shortName} ({display.blooming}).</p>
    </div>
  );
}

// --- step e: roll-off curve editor --------------------------------------------------------

const PLOT = { w: 480, h: 380, l: 50, r: 14, t: 14, b: 40 };
const LOG_MIN = -1; // 0.1 nits
const LOG_MAX = 4; // 10,000 nits

function px(n: number): number {
  const t = (Math.log10(Math.max(n, 0.1)) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  return PLOT.l + t * (PLOT.w - PLOT.l - PLOT.r);
}
function py(n: number): number {
  const t = (Math.log10(Math.max(n, 0.1)) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  return PLOT.h - PLOT.b - t * (PLOT.h - PLOT.t - PLOT.b);
}
function nitsAtX(x: number): number {
  const t = (x - PLOT.l) / (PLOT.w - PLOT.l - PLOT.r);
  return Math.pow(10, LOG_MIN + t * (LOG_MAX - LOG_MIN));
}

function curvePath(curve: CurveId, p: ToneParams): string {
  const pts: string[] = [];
  for (let i = 0; i <= 160; i++) {
    const n = Math.pow(10, LOG_MIN + ((LOG_MAX - LOG_MIN) * i) / 160);
    const y = toneMap(curve, n, p);
    pts.push(`${i ? 'L' : 'M'}${px(n).toFixed(1)},${py(y).toFixed(1)}`);
  }
  return pts.join('');
}

function RolloffEditor() {
  const { state, cal, setCal } = useCalibration();
  const hr = headroomInfo(state);
  const params: ToneParams = { peak: hr.computedPeak, black: cal.black, sourceMax: cal.sourceMax, knee: cal.knee };
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<'knee' | 'src' | null>(null);
  const kneeNits = cal.curve === 'bt2390' ? bt2390KneeNits(params) : cal.knee * hr.computedPeak;

  const toLocalX = (e: ReactPointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const r = svg.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * PLOT.w;
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const n = nitsAtX(toLocalX(e));
    if (drag === 'knee') setCal({ knee: Math.round(Math.min(0.95, Math.max(0.3, n / hr.computedPeak)) * 100) / 100 });
    else setCal({ sourceMax: Math.round(Math.min(10000, Math.max(Math.max(1000, hr.computedPeak * 1.1), n)) / 50) * 50 });
  };
  const keyKnee = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 0.01 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.01 : 0;
    if (!d) return;
    e.preventDefault();
    setCal({ knee: Math.round(Math.min(0.95, Math.max(0.3, cal.knee + d)) * 100) / 100 });
  };
  const keySrc = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 250 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -250 : 0;
    if (!d) return;
    e.preventDefault();
    setCal({ sourceMax: Math.min(10000, Math.max(1000, cal.sourceMax + d)) });
  };
  const ticks = [0.1, 1, 10, 100, 1000, 10000];
  const curves: CurveId[] = ['hardClip', 'reinhard', 'bt2390', 'lumaKnee'];

  return (
    <div className="rolloff">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${PLOT.w} ${PLOT.h}`}
        className="curve-plot"
        role="group"
        aria-label="Simulated roll-off curve: scene nits across, output nits up, both on log scales"
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={px(t)} x2={px(t)} y1={PLOT.t} y2={PLOT.h - PLOT.b} className="grid" />
            <line x1={PLOT.l} x2={PLOT.w - PLOT.r} y1={py(t)} y2={py(t)} className="grid" />
            <text x={px(t)} y={PLOT.h - PLOT.b + 14} className="tick" textAnchor="middle">
              {t >= 1000 ? `${t / 1000}k` : t}
            </text>
            <text x={PLOT.l - 6} y={py(t) + 3} className="tick" textAnchor="end">
              {t >= 1000 ? `${t / 1000}k` : t}
            </text>
          </g>
        ))}
        <text x={(PLOT.l + PLOT.w) / 2} y={PLOT.h - 4} className="axis-label" textAnchor="middle">
          scene nits
        </text>
        <text x={12} y={(PLOT.t + PLOT.h - PLOT.b) / 2} className="axis-label" textAnchor="middle" transform={`rotate(-90 12 ${(PLOT.t + PLOT.h - PLOT.b) / 2})`}>
          output nits
        </text>
        <line x1={px(0.1)} y1={py(0.1)} x2={px(10000)} y2={py(10000)} className="identity" />
        <line x1={PLOT.l} x2={PLOT.w - PLOT.r} y1={py(hr.computedPeak)} y2={py(hr.computedPeak)} className="peak-line" />
        <text x={PLOT.l + 4} y={py(hr.computedPeak) - 5} className="peak-text">
          display peak {fmtNits(hr.computedPeak)}
        </text>
        <line x1={px(cal.paperWhite)} x2={px(cal.paperWhite)} y1={PLOT.t} y2={PLOT.h - PLOT.b} className="pw-line" />
        <text x={px(cal.paperWhite) + 4} y={PLOT.h - PLOT.b - 6} className="pw-text">
          paper white
        </text>
        {curves
          .filter((c) => c !== cal.curve)
          .map((c) => (
            <path key={c} d={curvePath(c, params)} className="curve faint" />
          ))}
        <path d={curvePath(cal.curve, params)} className="curve main" />
        {cal.curve !== 'hardClip' ? (
          <circle
            cx={px(kneeNits)}
            cy={py(toneMap(cal.curve, kneeNits, params))}
            r={7}
            className={`handle ${cal.curve === 'lumaKnee' ? '' : 'fixed'}`}
            tabIndex={cal.curve === 'lumaKnee' ? 0 : -1}
            role="slider"
            aria-label="Knee start"
            aria-valuemin={30}
            aria-valuemax={95}
            aria-valuenow={Math.round(cal.knee * 100)}
            aria-valuetext={`${Math.round(kneeNits)} nits`}
            aria-disabled={cal.curve !== 'lumaKnee'}
            onPointerDown={(e) => {
              if (cal.curve !== 'lumaKnee') return;
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDrag('knee');
            }}
            onKeyDown={cal.curve === 'lumaKnee' ? keyKnee : undefined}
          />
        ) : null}
        {cal.curve !== 'hardClip' ? (
          <circle
            cx={px(cal.sourceMax)}
            cy={py(hr.computedPeak)}
            r={7}
            className="handle src"
            tabIndex={0}
            role="slider"
            aria-label="Scene value that reaches the display peak"
            aria-valuemin={1000}
            aria-valuemax={10000}
            aria-valuenow={cal.sourceMax}
            aria-valuetext={`${cal.sourceMax} nits`}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDrag('src');
            }}
            onKeyDown={keySrc}
          />
        ) : null}
      </svg>
      <div className="rolloff-side">
        <Segmented
          id="rolloff-curve"
          label="Curve preset"
          value={cal.curve}
          options={curves.map((c) => ({ value: c, label: CURVE_LABELS[c] }))}
          onChange={(v) => setCal({ curve: v })}
          size="sm"
        />
        <Slider
          id="knee-start"
          label="Knee start (Luma soft knee)"
          value={Math.round(cal.knee * 100)}
          min={30}
          max={95}
          format={(v) => `${v}% of peak (${Math.round((v / 100) * hr.computedPeak)} nits)`}
          onChange={(v) => setCal({ knee: v / 100 })}
          disabled={cal.curve !== 'lumaKnee'}
          hint={cal.curve !== 'lumaKnee' ? 'Only used by the Luma soft knee.' : undefined}
        />
        <Slider
          id="source-max"
          label="Scene value that lands on the peak"
          value={cal.sourceMax}
          min={1000}
          max={10000}
          step={50}
          format={(v) => `${v.toLocaleString('en-US')} nits`}
          onChange={(v) => setCal({ sourceMax: v })}
          disabled={cal.curve === 'hardClip'}
          hint={cal.curve === 'hardClip' ? 'Not used by Hard clip.' : undefined}
        />
        <ul className="curve-notes small">
          <li>
            <strong>Hard clip</strong>: exact up to the peak, then flat. Highlights lose all detail.
          </li>
          <li>
            <strong>BT.2390 EETF</strong>: the ITU reference roll-off in PQ space; identity below its knee ({fmtNits(bt2390KneeNits(params))} nits here).
          </li>
          <li>
            <strong>Luma soft knee</strong>: identity up to the knee, then a smooth shoulder that lands on the peak at the chosen scene value.
          </li>
        </ul>
      </div>
      <RampPreview params={params} curve={cal.curve} />
    </div>
  );
}

/** Scene values shown as bands in the highlight ramp (nits). */
const RAMP_BANDS = [500, 800, 1000, 1300, 1600, 3000, 10000];
const RAMP_LO = 400;

/**
 * Grey for one ramp band. Only the range from 400 nits to the display peak
 * is stretched over the grey scale, so the difference between curves is
 * visible in this SDR preview. It shows structure, not brightness.
 */
function rampGrey(outNits: number, peak: number): number {
  const t = Math.min(Math.max(Math.log(Math.max(outNits, 1) / RAMP_LO) / Math.log(peak / RAMP_LO), 0), 1);
  return srgbEncode(0.015 + 0.985 * t * t);
}

function shortNits(n: number): string {
  return n >= 1000 ? `${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k` : String(Math.round(n));
}

function RampPreview({ params, curve }: { params: ToneParams; curve: CurveId }) {
  const rows: { label: string; c: CurveId }[] = [{ label: CURVE_LABELS[curve], c: curve }];
  if (curve !== 'hardClip') rows.push({ label: 'Hard clip', c: 'hardClip' });
  return (
    <figure className="ramp" aria-label="Simulated highlight bands from 500 to 10,000 scene nits, with the output nits each curve sends">
      <div className="ramp-grid" role="table" aria-label="Output nits per scene band">
        <div className="ramp-row ramp-head" role="row">
          <span className="ramp-rowname" role="columnheader">
            scene nits
          </span>
          {RAMP_BANDS.map((b) => (
            <span key={b} className={`ramp-cell-head num ${b >= params.peak ? 'over' : ''}`} role="columnheader">
              {shortNits(b)}
            </span>
          ))}
        </div>
        {rows.map((row) => (
          <div className="ramp-row" role="row" key={row.c}>
            <span className="ramp-rowname" role="rowheader">
              {row.label}
            </span>
            {RAMP_BANDS.map((b) => {
              const out = toneMap(row.c, b, params);
              const v = Math.round(rampGrey(out, params.peak) * 255);
              const atPeak = out >= params.peak - 0.5;
              return (
                <span
                  key={b}
                  role="cell"
                  className={`ramp-cell num ${atPeak ? 'at-peak' : ''}`}
                  style={{ background: `rgb(${v},${Math.round(v * 0.97)},${Math.round(v * 0.9)})`, color: v > 150 ? 'var(--text-inverse)' : 'var(--text-1)' }}
                  title={`${b.toLocaleString('en-US')} scene nits -> ${Math.round(out).toLocaleString('en-US')} output nits`}
                >
                  {shortNits(out)}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <figcaption className="small muted">
        Each band is one scene brightness; the number inside is the output nits the curve requests. Greys are stretched from 400 nits to the
        display peak ({fmtNits(params.peak)} nits) so the SDR preview can show the difference. Outlined bands sit exactly at the peak: with a
        hard clip every band from {shortNits(params.peak)} up merges into one flat white, while a roll-off keeps them apart.
      </figcaption>
    </figure>
  );
}

// --- step f: gamut ------------------------------------------------------------------------

// Approximate CIE 1931 spectral locus (selected wavelengths, rounded).
const LOCUS: [number, number][] = [
  [0.1741, 0.005], [0.1666, 0.0089], [0.144, 0.0297], [0.1241, 0.0578], [0.0913, 0.1327], [0.0454, 0.295], [0.0082, 0.5384],
  [0.0139, 0.7502], [0.0743, 0.8338], [0.1547, 0.8059], [0.2296, 0.7543], [0.3016, 0.6923], [0.3731, 0.6245], [0.4441, 0.5547],
  [0.5125, 0.4866], [0.5752, 0.4242], [0.627, 0.3725], [0.6658, 0.334], [0.6915, 0.3083], [0.714, 0.2859], [0.7347, 0.2653],
];

function GamutDiagram() {
  const W = 330;
  const H = 320;
  const sx = (x: number) => 34 + x * 330;
  const sy = (y: number) => H - 28 - y * 330;
  const tri = (p: Primaries) => [p.r, p.g, p.b].map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ');
  const locus = LOCUS.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ');
  return (
    <figure className="gamut-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="gamut-svg" role="img" aria-label="Approximate CIE 1931 chromaticity diagram with the BT.709, Display P3 and BT.2020 triangles">
        {[0, 0.2, 0.4, 0.6, 0.8].map((v) => (
          <g key={v}>
            <line x1={sx(v)} x2={sx(v)} y1={sy(0)} y2={sy(0.85)} className="grid" />
            <line x1={sx(0)} x2={sx(0.8)} y1={sy(v)} y2={sy(v)} className="grid" />
            <text x={sx(v)} y={sy(0) + 14} className="tick" textAnchor="middle">
              {v}
            </text>
            <text x={sx(0) - 5} y={sy(v) + 3} className="tick" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <polygon points={locus} className="locus" />
        <polygon points={tri(BT2020)} className="tri t2020" />
        <polygon points={tri(P3_D65)} className="tri tp3" />
        <polygon points={tri(BT709)} className="tri t709" />
        <circle cx={sx(0.3127)} cy={sy(0.329)} r={2.5} className="white-pt" />
        <text x={sx(0.708) + 3} y={sy(0.292) + 12} className="tri-label l2020">
          2020
        </text>
        <text x={sx(0.265) - 4} y={sy(0.69) - 4} className="tri-label lp3" textAnchor="end">
          P3
        </text>
        <text x={sx(0.3) + 5} y={sy(0.6) + 12} className="tri-label l709">
          709
        </text>
        <text x={sx(0.3127) + 5} y={sy(0.329) + 3} className="tick">
          D65
        </text>
      </svg>
      <figcaption className="small muted">Approximate diagram: x/y chromaticity, spectral locus simplified. For orientation only.</figcaption>
    </figure>
  );
}

function StepGamut() {
  const { state, update } = useApp();
  return (
    <div className="step-body two-col">
      <div>
        <Segmented
          id="gamut-mode"
          label="Colour"
          value={state.visual.gamut}
          options={[
            { value: 'bt709', label: 'BT.709 faithful' },
            { value: 'vivid', label: 'Expanded vivid' },
          ]}
          onChange={(v) => update((s) => ({ ...s, preset: 'custom', visual: { ...s.visual, gamut: v } }))}
        />
        <div className="callout">
          {state.visual.gamut === 'bt709' ? (
            <p>
              <strong>BT.709 faithful</strong>: the game was graded for BT.709. Colours are placed exactly inside the wider P3 or BT.2020
              output, so nothing looks oversaturated.
            </p>
          ) : (
            <p>
              <strong>Expanded vivid</strong>: stretches BT.709 colours towards P3. It looks richer but is not the original grade. The browser
              preview can only approximate it in sRGB.
            </p>
          )}
        </div>
        <ul className="legend-list small">
          <li>
            <span className="swatch l709" /> BT.709 / sRGB (the game's colour space)
          </li>
          <li>
            <span className="swatch lp3" /> Display P3 (MacBook panel, close to the A95L)
          </li>
          <li>
            <span className="swatch l2020" /> BT.2020 (HDR10 container)
          </li>
        </ul>
      </div>
      <GamutDiagram />
    </div>
  );
}

// --- step g: measured values -------------------------------------------------------------

function deltaTone(pct: number): Tone {
  const a = Math.abs(pct);
  return a <= 5 ? 'ok' : a <= 15 ? 'warn' : 'critical';
}

function StepMeasured() {
  const { state, cal, setCal } = useCalibration();
  const hr = headroomInfo(state);
  const rows: { key: 'white' | 'peak' | 'black'; label: string; computed: number }[] = [
    { key: 'white', label: 'Paper white patch', computed: cal.paperWhite },
    { key: 'peak', label: 'Peak', computed: hr.computedPeak },
    { key: 'black', label: 'Black', computed: cal.black },
  ];
  return (
    <div className="step-body">
      <p>
        Optional. If you own a colorimeter, enter what it reads for each test patch. Readings are labelled <em>measured</em> and kept apart
        from the computed <em>signal</em>; every reading carries its window size, date and instrument.
      </p>
      <div className="measured-context">
        <div className="field date-field">
          <label className="field-label" htmlFor="measured-date">
            Date of the readings
          </label>
          <input
            id="measured-date"
            className="num-input"
            type="date"
            value={cal.measured.date ?? ''}
            onChange={(e) => setCal({ measured: { ...cal.measured, date: e.target.value || null } })}
          />
        </div>
        <div className="field instrument-field">
          <label className="field-label" htmlFor="measured-instrument">
            Instrument
          </label>
          <input
            id="measured-instrument"
            className="text-input"
            type="text"
            maxLength={80}
            placeholder="meter model and correction"
            value={cal.measured.instrument ?? ''}
            onChange={(e) => setCal({ measured: { ...cal.measured, instrument: e.target.value || null } })}
          />
        </div>
      </div>
      <p className="small label-key">
        Computed values are <LabelChip kind="signal" />; your readings are <LabelChip kind="measured" />.
      </p>
      <table className="data-table measured-table">
        <thead>
          <tr>
            <th scope="col">Patch and window</th>
            <th scope="col">Computed</th>
            <th scope="col">Reading (nits)</th>
            <th scope="col">Diff</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const m = cal.measured[r.key];
            const pct = m !== null && r.computed > 0 ? ((m - r.computed) / r.computed) * 100 : null;
            return (
              <tr key={r.key}>
                <th scope="row">
                  <label htmlFor={`measured-${r.key}`}>{r.label}</label>
                  <span className="small muted window-note">{MEASURED_WINDOWS[r.key]}</span>
                </th>
                <td className="num">{fmtNits(r.computed)} nits</td>
                <td>
                  <input
                    id={`measured-${r.key}`}
                    className="num-input"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    placeholder="not measured"
                    value={m ?? ''}
                    onChange={(e) => {
                      const v = e.target.value === '' ? null : Number(e.target.value);
                      setCal({ measured: { ...cal.measured, [r.key]: v !== null && Number.isFinite(v) ? v : null } });
                    }}
                  />
                </td>
                <td>{pct === null ? <span className="muted">-</span> : <Chip tone={deltaTone(pct)}>{`${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}</Chip>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">Within 5% shows green, within 15% amber. Measurements are never invented by the app; empty fields read "not measured".</p>
    </div>
  );
}

// --- step h: summary ----------------------------------------------------------------------

function StepSummary() {
  const { state, cal, setCal, display } = useCalibration();
  const hr = headroomInfo(state);
  const m = cal.measured;
  const measuredText = (['white', 'peak', 'black'] as const)
    .filter((k) => m[k] !== null)
    .map((k) => `${k === 'white' ? 'paper white' : k} ${fmtNits(m[k] as number)} nits (${MEASURED_WINDOWS[k]})`)
    .join(', ');
  const rows: [string, string, LabelClass | null][] = [
    ['Display profile', display.name, null],
    ['Output', `${OUTPUT_CONTAINER}, ${OUTPUT_RULES}; ${display.signalPath}`, null],
    ['Paper white', display.id === 'macbook' ? `assumed ${cal.paperWhite} nits at EDR 1.0` : `${cal.paperWhite} nits`, 'profile'],
    ['UI white', `${fmtNits(hr.uiWhite)} nits (paper white x ${cal.uiScale.toFixed(2)})`, 'profile'],
    [
      cal.peakTested ? 'Peak (from the pattern)' : 'Peak (profile default)',
      cal.peakTested
        ? `${cal.peak.toLocaleString('en-US')} nits`
        : `${cal.peak.toLocaleString('en-US')} nits - ${display.peakNits.status === 'spec' ? 'spec default' : 'example value'}, peak test not run`,
      'profile',
    ],
    ['Peak the renderer requests', `${hr.computedPeak.toLocaleString('en-US')} nits (headroom ${hr.headroomNow.toFixed(1)}x over paper white)`, 'signal'],
    ['Black floor', `${cal.black} nits`, 'profile'],
    [
      'Roll-off',
      `${CURVE_LABELS[cal.curve]}${cal.curve === 'lumaKnee' ? `, knee ${Math.round(cal.knee * 100)}%` : ''}, lands on peak at ${cal.sourceMax.toLocaleString('en-US')} nits`,
      'profile',
    ],
    ['Colour', state.visual.gamut === 'bt709' ? 'BT.709 faithful' : 'Expanded vivid', 'profile'],
    ['Meter readings', measuredText ? `${measuredText}; ${measuredContext(m)}` : 'Not measured', 'measured'],
  ];
  const limitNote =
    hr.limitedBy === 'panel'
      ? `The peak from the pattern (${cal.peak.toLocaleString('en-US')} nits) is above this profile's ${
          display.peakCeilingNits.status === 'spec' ? 'spec-sheet' : 'example'
        } panel peak, so the renderer request is capped at ${display.peakCeilingNits.value.toLocaleString('en-US')} nits${
          display.peakCeilingNits.status === 'spec' ? '' : ' (example - to be measured)'
        }.`
      : hr.limitedBy === 'edr-headroom'
        ? `At ${cal.paperWhite} nits paper white, the EDR headroom (${hr.headroomPotential}x) limits the request to ${hr.computedPeak.toLocaleString('en-US')} nits.`
        : null;
  return (
    <div className="step-body">
      <div className="summary-chips">
        {cal.peakTested ? <Chip tone="ok">Peak test run</Chip> : <Chip tone="warn">Peak test not run - {display.peakNits.status === 'spec' ? 'spec' : 'example'} default</Chip>}
        {hr.limitedBy === 'panel' ? <Chip tone="warn">Peak capped at the panel ceiling</Chip> : null}
      </div>
      {limitNote ? (
        <p className="callout warn small" data-testid="peak-limit-note">
          {limitNote}
        </p>
      ) : null}
      <table className="data-table stack-sm">
        <tbody>
          {rows.map(([k, v, c]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{v}</td>
              <td>{c ? <LabelChip kind={c} /> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="save-row">
        <button type="button" className="btn btn-primary" id="save-profile" onClick={() => setCal({ savedAt: new Date().toISOString() })}>
          Save profile (simulated)
        </button>
        <span className="muted small" aria-live="polite">
          {cal.savedAt
            ? `Saved ${new Date(cal.savedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} - stored in this browser only, nothing was sent to a display.`
            : 'Not saved yet.'}
        </span>
      </div>
    </div>
  );
}

// --- view ---------------------------------------------------------------------------------

export function CalibrateView() {
  const [step, setStep] = useState<StepId>('mode');
  const { display } = useCalibration();
  const idx = STEPS.findIndex((s) => s.id === step);
  const body = useMemo(() => {
    switch (step) {
      case 'mode':
        return <StepMode />;
      case 'paper':
        return <StepPaper />;
      case 'peak':
        return <StepPeak />;
      case 'black':
        return <StepBlack />;
      case 'rolloff':
        return <RolloffEditor />;
      case 'gamut':
        return <StepGamut />;
      case 'measured':
        return <StepMeasured />;
      case 'summary':
        return <StepSummary />;
    }
  }, [step]);

  return (
    <div className="view calibrate">
      <ProfilePicker />
      <nav className="stepper" aria-label="Calibration steps">
        <ol>
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                id={`step-${s.id}`}
                className={`step-btn ${s.id === step ? 'on' : ''} ${i < idx ? 'done' : ''}`}
                aria-current={s.id === step ? 'step' : undefined}
                onClick={() => setStep(s.id)}
              >
                <span className="step-num">{String.fromCharCode(97 + i)}</span>
                <span className="step-label">{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <Card
        title={`${String.fromCharCode(97 + idx)}. ${STEPS[idx].label}`}
        tag={<SimTag />}
        actions={<Chip tone="neutral">{display.shortName}</Chip>}
        className="step-card"
      >
        {body}
        <div className="step-nav">
          <button type="button" className="btn btn-ghost" disabled={idx === 0} onClick={() => setStep(STEPS[Math.max(0, idx - 1)].id)}>
            Back
          </button>
          <span className="muted small num">
            Step {idx + 1} of {STEPS.length}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={idx === STEPS.length - 1}
            onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, idx + 1)].id)}
          >
            Next
          </button>
        </div>
      </Card>
    </div>
  );
}
