import { useEffect, useRef, useState } from 'react';
import { Card, Chip, Segmented, SimTag, Slider, Toggle } from '../components/ui';
import { useApp } from '../state/context';
import type { ControllerState } from '../state/store';

type Face = 'north' | 'east' | 'south' | 'west';

const FACE_NAMES: Record<Face, string> = { north: 'Triangle (top)', east: 'Circle (right)', south: 'Cross (bottom)', west: 'Square (left)' };

function faceMap(layout: ControllerState['layout']): Record<Face, string> {
  return layout === 'positions' ? { east: 'A', south: 'B', north: 'X', west: 'Y' } : { south: 'A', east: 'B', west: 'X', north: 'Y' };
}

interface Control {
  id: string;
  name: string;
  maps: string;
  note?: string;
}

function controls(c: ControllerState): Control[] {
  const f = faceMap(c.layout);
  const touch =
    c.touchpad === 'capture' ? 'Capture' : c.touchpad === 'halves' ? 'Left half: Minus, right half: Plus' : 'Not mapped';
  return [
    { id: 'l1', name: 'L1', maps: 'L' },
    { id: 'l2', name: 'L2 (trigger)', maps: 'ZL', note: c.aimOnlyZL ? 'Motion aiming is active only while this is held.' : undefined },
    { id: 'r1', name: 'R1', maps: 'R' },
    { id: 'r2', name: 'R2 (trigger)', maps: 'ZR' },
    { id: 'create', name: 'Create', maps: 'Minus (-)' },
    { id: 'options', name: 'Options', maps: 'Plus (+)' },
    {
      id: 'touchpad',
      name: 'Touchpad press',
      maps: touch,
      note: 'Optional dashboard toggle if you choose it; it is then lost as a game input.',
    },
    {
      id: 'ps',
      name: 'PS button',
      maps: 'Not mapped (system button)',
      note: 'The PS button may open Game Overlay, Games or Spotlight. Do not bind it to a game action.',
    },
    {
      id: 'mute',
      name: 'Mute button',
      maps: 'Dashboard toggle',
      note: 'Toggles the HDR and performance dashboard. It has no Switch equivalent and is removed from the game mapping, so nothing leaks to the game.',
    },
    { id: 'lstick', name: 'Left stick', maps: 'Left stick, press = L3' },
    { id: 'rstick', name: 'Right stick', maps: 'Right stick, press = R3' },
    { id: 'dpad', name: 'D-pad', maps: 'D-pad' },
    ...(['north', 'east', 'south', 'west'] as Face[]).map((k) => ({ id: k, name: FACE_NAMES[k], maps: `${f[k]} button` })),
  ];
}

function GamepadDiagram({ active, onActive }: { active: string | null; onActive: (id: string | null) => void }) {
  const { state } = useApp();
  const f = faceMap(state.controller.layout);
  const all = controls(state.controller);
  const label = (id: string) => {
    const c = all.find((x) => x.id === id);
    return c ? `${c.name}: ${c.maps}` : id;
  };
  const hot = (id: string) => ({
    tabIndex: 0,
    role: 'button' as const,
    'aria-label': label(id),
    className: `pad-part ${active === id ? 'on' : ''}`,
    onMouseEnter: () => onActive(id),
    onFocus: () => onActive(id),
    onClick: () => onActive(id),
  });
  const face: [Face, number, number][] = [
    ['north', 372, 104],
    ['east', 400, 132],
    ['south', 372, 160],
    ['west', 344, 132],
  ];
  return (
    <svg viewBox="0 0 480 300" className="pad-svg" role="group" aria-label="Generic gamepad diagram. Focus or hover a control to see its mapping." onMouseLeave={() => onActive(null)}>
      <path
        className="pad-body"
        d="M120 62 C150 50 190 54 240 54 C290 54 330 50 360 62 C410 80 440 150 456 220 C468 272 430 292 404 270 C380 250 360 222 330 214 L150 214 C120 222 100 250 76 270 C50 292 12 272 24 220 C40 150 70 80 120 62 Z"
      />
      <g {...hot('l2')}>
        <rect x={92} y={22} width={74} height={22} rx={10} />
        <text x={129} y={37} textAnchor="middle">L2</text>
      </g>
      <g {...hot('l1')}>
        <rect x={98} y={46} width={62} height={12} rx={6} />
      </g>
      <g {...hot('r2')}>
        <rect x={314} y={22} width={74} height={22} rx={10} />
        <text x={351} y={37} textAnchor="middle">R2</text>
      </g>
      <g {...hot('r1')}>
        <rect x={320} y={46} width={62} height={12} rx={6} />
      </g>
      <g {...hot('touchpad')}>
        <rect x={184} y={66} width={112} height={68} rx={12} />
        <text x={240} y={105} textAnchor="middle">touchpad</text>
      </g>
      <g {...hot('create')}>
        <rect x={160} y={74} width={12} height={22} rx={5} />
      </g>
      <g {...hot('options')}>
        <rect x={308} y={74} width={12} height={22} rx={5} />
      </g>
      <g {...hot('dpad')}>
        <rect x={98} y={104} width={24} height={20} rx={4} />
        <rect x={98} y={140} width={24} height={20} rx={4} />
        <rect x={76} y={122} width={22} height={20} rx={4} />
        <rect x={122} y={122} width={22} height={20} rx={4} />
      </g>
      {face.map(([k, x, y]) => (
        <g key={k} {...hot(k)}>
          <circle cx={x} cy={y} r={14} />
          <text x={x} y={y + 4.5} textAnchor="middle" className="face-letter">
            {f[k]}
          </text>
        </g>
      ))}
      <g {...hot('lstick')}>
        <circle cx={176} cy={176} r={26} />
        <circle cx={176} cy={176} r={14} className="stick-cap" />
      </g>
      <g {...hot('rstick')}>
        <circle cx={304} cy={176} r={26} />
        <circle cx={304} cy={176} r={14} className="stick-cap" />
      </g>
      <g {...hot('ps')}>
        <circle cx={240} cy={176} r={10} />
      </g>
      <g {...hot('mute')}>
        <rect x={230} y={196} width={20} height={8} rx={4} />
      </g>
    </svg>
  );
}

function GyroBox() {
  const { state, reducedMotion } = useApp();
  const c = state.controller;
  const [zl, setZl] = useState(false);
  const dot = useRef<HTMLSpanElement>(null);
  const live = !c.aimOnlyZL || zl;
  useEffect(() => {
    const el = dot.current;
    if (!el) return;
    if (reducedMotion || !live) {
      el.style.transform = 'translate(-50%, -50%)';
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const t = (now - t0) / 1000;
      const amp = 34 * c.gyroSensitivity;
      const x = Math.sin(t * 0.9) * amp + Math.sin(t * 2.3) * amp * 0.15;
      const y = Math.sin(t * 1.3 + 0.7) * amp * 0.55;
      el.style.transform = `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px))`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion, live, c.gyroSensitivity]);
  return (
    <div className="gyro-wrap">
      <div className="gyro-box" role="img" aria-label={live ? 'Simulated gyro aim dot, moving' : 'Simulated gyro aim dot, held at centre'}>
        <span className="gyro-cross" aria-hidden="true" />
        <span className={`gyro-dot ${live ? 'live' : ''}`} ref={dot} />
        <span className="pattern-tag">Simulated gyro</span>
      </div>
      <div className="gyro-side">
        <p className="small muted">
          {live
            ? `The dot follows simulated controller tilt at ${c.gyroSensitivity.toFixed(2)}x sensitivity.`
            : 'Aiming is idle: the dot stays centred until ZL is held.'}
        </p>
        {c.aimOnlyZL ? (
          <button
            type="button"
            className={`btn btn-ghost btn-sm ${zl ? 'pressed' : ''}`}
            aria-pressed={zl}
            id="hold-zl"
            onClick={() => setZl((x) => !x)}
          >
            {zl ? 'ZL held (simulated)' : 'Hold ZL (simulated)'}
          </button>
        ) : (
          <p className="small muted">Motion aiming is always on.</p>
        )}
      </div>
    </div>
  );
}

function RumbleTest() {
  const { state } = useApp();
  const [run, setRun] = useState(0);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!run) return;
    const id = window.setTimeout(() => setOn(false), 1400);
    return () => window.clearTimeout(id);
  }, [run]);
  const level = state.controller.rumble;
  return (
    <div className="rumble">
      <div className={`rumble-bars ${on ? 'on' : ''}`} aria-hidden="true">
        {Array.from({ length: 16 }, (_, i) => (
          <span key={i} style={{ animationDelay: `${(i % 8) * 60}ms`, height: on ? `${20 + level * 70 * (i < 8 ? 1 : 0.6)}%` : '8%' }} />
        ))}
      </div>
      <div className="rumble-legend small muted">
        <span>left motor (strong)</span>
        <span>right motor (light)</span>
      </div>
      <p className="small muted rumble-state" aria-hidden="true">
        {on ? `Playing a 1.4 s pulse at ${Math.round(level * 100)}% strength (simulated bars, no real motors).` : 'Press Test rumble to see the motor levels.'}
      </p>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        id="rumble-test"
        onClick={() => {
          setOn(true);
          setRun((n) => n + 1);
        }}
      >
        Test rumble (simulated)
      </button>
      <span className="sr-only" aria-live="polite">
        {on ? 'Simulated rumble playing' : ''}
      </span>
    </div>
  );
}

export function ControllerView() {
  const { state, update } = useApp();
  const c = state.controller;
  const set = (patch: Partial<ControllerState>) => update((s) => ({ ...s, controller: { ...s.controller, ...patch } }));
  const [active, setActive] = useState<string | null>('mute');
  const all = controls(c);
  const current = all.find((x) => x.id === active);

  return (
    <div className="view controller">
      <div className="grid-2">
        <Card title="DualSense" tag={<><Chip tone="info">SDL3 HIDAPI (v1)</Chip><SimTag /></>}>
          <div className="status-row">
            <Chip tone={c.connected ? 'ok' : 'critical'}>{c.connected ? 'Connected' : 'Disconnected'}</Chip>
            <Chip tone="neutral">{c.connection === 'usb' ? 'USB' : 'Bluetooth'}</Chip>
            <Chip tone="neutral">Battery 72% (simulated)</Chip>
          </div>
          <Segmented
            id="pad-connection"
            label="Bus (simulated)"
            value={c.connection}
            options={[
              { value: 'usb', label: 'USB' },
              { value: 'bluetooth', label: 'Bluetooth' },
            ]}
            onChange={(v) => set({ connection: v })}
          />
          <ul className="fact-list small" data-testid="pad-facts">
            <li>Driver: SDL3 HIDAPI, as Ryubing ships it, plus small tested patches (lightbar, player LEDs, rumble sides).</li>
            <li>
              USB is recommended for measurement sessions. Bluetooth is fine for play (third-party test: 17-28 ms button maximum, against
              1.1-3.6 ms jitter on USB).
            </li>
            <li>
              USB and Bluetooth have different device ids, so this profile binds both:{' '}
              <span className="num">USB id bound, Bluetooth id bound</span>. Switching bus keeps the same profile.
            </li>
            <li>Dashboard toggle: the mute button (fallback if it does not reach SDL, gate G-INP-1: Create + Options held 0.5 s).</li>
          </ul>
          <p className="small muted">
            Reconnect: a drop shows a toast, never the controller dialog (ignore_applet). On reconnect, on the same bus or the other, the profile
            rebinds by id. No input is replayed.
          </p>
          <Toggle
            id="pause-on-disconnect"
            label="Pause while the pad is disconnected (proposed owner option)"
            checked={c.pauseOnDisconnect}
            onChange={(v) => set({ pauseOnDisconnect: v })}
            hint="Not decided by any ADR. Off: the game keeps running and a toast shows the disconnect."
          />
          <div className="btn-row">
            {c.connected ? (
              <button type="button" className="btn btn-ghost btn-sm" id="simulate-disconnect" onClick={() => set({ connected: false })}>
                Simulate disconnect
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" id="simulate-reconnect" onClick={() => set({ connected: true })}>
                Simulate reconnect
              </button>
            )}
            <span className="small muted" aria-live="polite" data-testid="pad-status">
              {c.connected
                ? `Controller connected (${c.connection === 'usb' ? 'USB' : 'Bluetooth'}), simulated.`
                : `Controller disconnected (${c.connection === 'usb' ? 'USB' : 'Bluetooth'}): toast only, ${c.pauseOnDisconnect ? 'game paused' : 'game keeps running'} (simulated).`}
            </span>
          </div>
        </Card>

        <Card title="Automation" tag={<><Chip tone="neutral">Off by default</Chip><SimTag /></>}>
          <Toggle
            id="agent-pad"
            label={`Virtual agent pad: ${c.agentPad ? 'on (simulated)' : 'off'}`}
            checked={c.agentPad}
            onChange={(v) => set({ agentPad: v, agentEstop: false })}
          />
          <div className="status-row" data-testid="agent-owner">
            {!c.agentPad ? (
              <Chip tone="neutral">Player 1: your pad</Chip>
            ) : c.agentEstop ? (
              <Chip tone="warn">Agent stopped: you took control</Chip>
            ) : (
              <Chip tone="accent">Agent controls Player 1</Chip>
            )}
          </div>
          <div className="callout small owner-wins">
            <strong>Owner wins.</strong> Any physical input on Player 1 (a button, a stick outside its deadzone, a trigger past its threshold)
            pauses the agent pad at once: the stop (ESTOP) latches and the virtual pad goes neutral until an explicit resume.
          </div>
          {c.agentPad ? (
            <div className="btn-row">
              {c.agentEstop ? (
                <button type="button" className="btn btn-primary btn-sm" id="agent-resume" onClick={() => set({ agentEstop: false })}>
                  Resume agent (explicit)
                </button>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" id="simulate-owner-input" onClick={() => set({ agentEstop: true })}>
                  Simulate a press on your pad
                </button>
              )}
            </div>
          ) : null}
          <ul className="fact-list small">
            <li>Uses its own local socket, separate from the DualSense. Rumble is never routed to your pad.</li>
            <li>Never sends keyboard or mouse events and never takes window focus.</li>
            <li>Performance measurements run without it, or with it idle or disconnected.</li>
            <li>Unattended agent sessions wait for the live owner-wins replay (gate G-INP-6).</li>
          </ul>
        </Card>
      </div>

      <Card title="Button mapping" tag={<SimTag label="Generic diagram" />}>
        <div className="mapping">
          <GamepadDiagram active={active} onActive={(id) => setActive(id ?? active)} />
          <div className="mapping-side">
            <div className="mapping-info" aria-live="polite">
              {current ? (
                <>
                  <span className="muted small">{current.name}</span>
                  <strong className="mapping-target">{current.maps}</strong>
                  {current.note ? <span className="small">{current.note}</span> : null}
                </>
              ) : (
                <span className="muted">Hover or focus a control.</span>
              )}
            </div>
            <Segmented
              id="pad-layout"
              label="Face buttons"
              value={c.layout}
              options={[
                { value: 'positions', label: 'Nintendo positions' },
                { value: 'labels', label: 'Labels (bottom = A)' },
              ]}
              onChange={(v) => set({ layout: v })}
            />
            <p className="small muted">
              Nintendo positions keeps the Switch layout under your thumb (right = A, bottom = B). Labels puts confirm on the bottom button.
            </p>
            <Segmented
              id="touchpad-mode"
              label="Touchpad"
              value={c.touchpad}
              options={[
                { value: 'capture', label: 'Press = Capture' },
                { value: 'halves', label: 'Halves = - / +' },
                { value: 'off', label: 'Off' },
              ]}
              onChange={(v) => set({ touchpad: v })}
              size="sm"
            />
            <details className="all-mappings">
              <summary>Show all mappings</summary>
              <table className="data-table compact">
                <tbody>
                  {all.map((x) => (
                    <tr key={x.id}>
                      <th scope="row">{x.name}</th>
                      <td>{x.maps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Motion aiming" tag={<SimTag />}>
          <Slider
            id="gyro-sensitivity"
            label="Sensitivity"
            value={c.gyroSensitivity}
            min={0.2}
            max={2}
            step={0.05}
            format={(v) => `${v.toFixed(2)}x`}
            onChange={(v) => set({ gyroSensitivity: v })}
          />
          <Toggle id="aim-only-zl" label="Aim only while ZL is held" checked={c.aimOnlyZL} onChange={(v) => set({ aimOnlyZL: v })} />
          <GyroBox />
        </Card>
        <Card title="Rumble" tag={<SimTag />}>
          <Slider id="rumble-strength" label="Strength" value={c.rumble} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ rumble: v })} />
          <RumbleTest />
          <div className="callout small">
            <strong>Haptics and adaptive triggers: not available, separate track.</strong>
            <p>
              Standard rumble is in v1. Voice-coil haptics, Bluetooth haptics and adaptive triggers are a separate feasibility track (P5), each
              with its own go/no-go.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
