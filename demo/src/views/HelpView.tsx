import { useMemo, useState } from 'react';
import { Card, Chip, NoBreak, SimTag } from '../components/ui';
import { DISPLAYS } from '../sim/displays';
import { SOURCE_MODE_LABELS, simulatedSourceMode } from '../sim/source';
import { summarisePerf } from '../sim/telemetry';
import { useApp } from '../state/context';
import { headroomInfo } from '../state/store';

const ISSUES: { id: string; title: string; tone: 'warn' | 'critical' | 'neutral'; checks: string[] }[] = [
  {
    id: 'dull',
    title: 'HDR looks dull or grey',
    tone: 'warn',
    checks: [
      'macOS: System Settings > Displays > High Dynamic Range must be on for the A95L (the built-in display uses EDR automatically).',
      'Check the source mode in the dashboard: SDR and Expanded SDR are not scene HDR.',
      'Paper white too low makes the whole image flat: rerun Calibrate, step b.',
    ],
  },
  {
    id: 'a95l',
    title: 'A95L: no HDR, or no 120 Hz',
    tone: 'warn',
    checks: [
      'Use the TV HDMI 2.1 port (HDMI 3 or 4) and set Enhanced format for that input.',
      'Picture mode Game, HDR Tone Mapping Off while you calibrate (HGIG-style: the TV must not tone-map a second time). Afterwards A/B Off against Gradation.',
      'macOS "High Dynamic Range" on for this display. HDR at 4K 120 Hz may hit a HiDPI framebuffer limit (unverified, gate G6-2).',
    ],
  },
  {
    id: 'dv',
    title: 'The TV says "Dolby Vision"',
    tone: 'neutral',
    checks: [
      'Dolby Vision: not supported (no macOS signalling path; licensed SDK). HDR10 / EDR only.',
      'Do not set the Mac input to a Dolby Vision signal format; the TV badge should read HDR10. The dashboard flags an unexpected Dolby Vision mode.',
    ],
  },
  {
    id: 'judder',
    title: 'Judder at 45 FPS',
    tone: 'warn',
    checks: [
      '45 does not divide 120 or 60 Hz (3,3,2 and 2,1,1), and on ProMotion it alternates 20.8 / 20.8 / 25.0 ms.',
      'Switch to 40 or 48 on ProMotion, 40 on the A95L at 120 Hz, or 30 at 60 Hz. 45 is smooth only with verified HDMI VRR (gate G6-1).',
    ],
  },
  {
    id: 'clip',
    title: 'Highlights clip or look flat',
    tone: 'warn',
    checks: [
      'Rerun the peak test (Calibrate, step c) and use the lowest value where the inner square disappears.',
      'Pick a roll-off (BT.2390 or Luma soft knee) instead of Hard clip.',
    ],
  },
  {
    id: 'stutter',
    title: 'Stutter after a new build or on first visit',
    tone: 'neutral',
    checks: [
      'Cold shader cache: a new build recompiles about 1,017 shaders, about 85-88 s of rebuild [E]. It settles as the cache warms.',
      'The dashboard shows the cache state and shader compiles next to the frame-time spikes.',
    ],
  },
  {
    id: 'flash',
    title: 'Black or tiled flashing frames',
    tone: 'critical',
    checks: [
      'Known hypervisor flash issue: 10 flashes in 850 s with Hypervisor On [E]. Use Hypervisor Off (the default).',
      'A+B fix built, in-game validation pending (gate G-AB).',
    ],
  },
  {
    id: 'speed',
    title: 'Game speed feels off above 30 FPS',
    tone: 'warn',
    checks: [
      'Above 30 the D2 timing patch must be present and match its checksum; without it only 30 (native) is offered.',
      'D2 is experimental (walk test only). Movies may run fast until gate G6-3; report audio drift or physics oddities.',
    ],
  },
  {
    id: 'pad',
    title: 'Controller disconnects or changes bus',
    tone: 'neutral',
    checks: [
      'A toast shows the disconnect; no controller dialog opens (ignore_applet). The game keeps running unless you turned on the pause option.',
      'USB and Bluetooth give different device ids; the profile binds both, so switching bus keeps your settings.',
      'Prefer USB for measurement sessions.',
    ],
  },
  {
    id: 'agent',
    title: 'Agent stopped unexpectedly',
    tone: 'neutral',
    checks: ['Owner wins: any physical input on Player 1 latches the agent stop (ESTOP).', 'Resume the agent explicitly from the Controller view.'],
  },
];

export function HelpView() {
  const { state } = useApp();
  const [diag, setDiag] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const buildDiagnostics = () => {
    const hr = headroomInfo(state);
    const perf = summarisePerf(state.perf, state.display);
    return JSON.stringify(
      {
        note: 'SIMULATED diagnostics from the TOTK Luma visual scope demo. No real hardware, emulator or game data.',
        generated: new Date().toISOString(),
        display: {
          profile: DISPLAYS[state.display].name,
          paperWhiteNits: hr.paperWhite,
          uiWhiteNits: Math.round(hr.uiWhite),
          computedPeakNits: hr.computedPeak,
          edrHeadroomNow: Number(hr.headroomNow.toFixed(2)),
        },
        sourceMode: SOURCE_MODE_LABELS[simulatedSourceMode(state.visual.hdr)],
        calibration: state.calib[state.display],
        visuals: { preset: state.preset, ...state.visual },
        performance: {
          ...state.perf,
          panelMode: perf.cap.mode.label,
          capInEffect: perf.cap.option.label,
          cadenceFit: perf.cadence.fit,
          presentation: perf.cadence.label,
          backend: 'MoltenVK 1.4.2-ryujinx.5',
          expectedFps: Number(perf.expectedFps.toFixed(1)),
        },
        controller: { ...state.controller, battery: '72% (simulated)' },
      },
      null,
      2,
    );
  };

  const downloadHref = useMemo(() => (diag ? `data:application/json;charset=utf-8,${encodeURIComponent(diag)}` : undefined), [diag]);

  return (
    <div className="view help">
      <div className="help-grid">
        {ISSUES.map((i) => (
          <Card key={i.id} title={i.title} tag={<Chip tone={i.tone}>{i.tone === 'critical' ? 'Known issue' : i.tone === 'warn' ? 'Check' : 'Info'}</Chip>} id={`help-${i.id}`}>
            <ul className="check-list">
              {i.checks.map((c) => (
                <li key={c}>
                  <NoBreak text={c} />
                </li>
              ))}
            </ul>
          </Card>
        ))}
        <Card title="Export diagnostics" tag={<SimTag />} id="help-export">
          <p className="small">Collects the current (simulated) settings into a JSON report you could attach to a bug report.</p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              id="export-diagnostics"
              onClick={() => {
                setDiag(buildDiagnostics());
                setCopied(false);
              }}
            >
              Export diagnostics (simulated)
            </button>
            {diag && downloadHref ? (
              <>
                <a className="btn btn-ghost btn-sm" href={downloadHref} download="totk-luma-diagnostics-simulated.json">
                  Download .json
                </a>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(diag).then(
                      () => setCopied(true),
                      () => setCopied(false),
                    );
                  }}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </>
            ) : null}
          </div>
          {diag ? (
            <pre className="diag" tabIndex={0} aria-label="Simulated diagnostics report">
              {diag}
            </pre>
          ) : null}
        </Card>
      </div>

      <Card title="About this demo" className="about" id="about">
        <div className="about-grid">
          <div>
            <h4>What it is for</h4>
            <p>
              A visual scope check for the TOTK Luma Mac app: it shows what the app would look like and what it would let you do, so the scope
              can be approved before any emulator work. It is not evidence that HDR or emulation works.
            </p>
          </div>
          <div>
            <h4>What is simulated</h4>
            <ul className="fact-list">
              <li>The game view: an original procedural scene, not the game.</li>
              <li>All HDR values, shown as an SDR preview in the browser.</li>
              <li>All telemetry: FPS, frame times, cadence, GPU load and cost estimates.</li>
              <li>Display detection, VRR states, controller state, battery and rumble.</li>
              <li>Saving, which only writes to this browser's local storage.</li>
            </ul>
          </div>
          <div>
            <h4>Where the real plan lives</h4>
            <p>
              See <code>docs/</code> in the repository for the overview, requirements, decisions and research notes, and{' '}
              <code>docs/evidence/</code> for the bounded prior measurements. The demo source is in <code>demo/</code>; its simulation models are in{' '}
              <code>demo/src/sim/</code>.
            </p>
            <p className="small muted">No game content, logos, fonts, sounds or controller artwork are used. Names appear as text only.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
