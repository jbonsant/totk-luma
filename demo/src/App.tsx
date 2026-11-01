import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { SceneView } from './components/SceneView';
import { AppContext } from './state/context';
import type { AppApi } from './state/context';
import { navigate, useHashView, useReducedMotion } from './state/hooks';
import { loadState, pipelineFrom, readFlag, saveState, writeFlag } from './state/store';
import type { AppState, MenuViewId } from './state/store';
import { useTelemetry } from './state/useTelemetry';
import { Menu } from './views/Menu';

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t instanceof HTMLTextAreaElement) return true;
  if (t instanceof HTMLInputElement) return !['range', 'checkbox', 'radio', 'button'].includes(t.type);
  return false;
}

export default function App() {
  const [state, setState] = useState<AppState>(loadState);
  const reducedMotion = useReducedMotion();
  const view = useHashView();
  const lastMenu = useRef<MenuViewId>('calibrate');
  const [toast, setToast] = useState(() => !readFlag('toast-dismissed'));
  const [chrome, setChrome] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);

  const update = useCallback((fn: (s: AppState) => AppState) => setState(fn), []);
  const api: AppApi = useMemo(() => ({ state, update, reducedMotion }), [state, update, reducedMotion]);

  // persist (debounced); storage failures are ignored inside saveState
  useEffect(() => {
    const id = window.setTimeout(() => saveState(state), 300);
    return () => window.clearTimeout(id);
  }, [state]);

  useEffect(() => {
    if (view !== 'play') lastMenu.current = view;
  }, [view]);

  const toggleDashboard = useCallback(() => {
    setState((s) => ({ ...s, dashboard: { ...s.dashboard, open: !s.dashboard.open } }));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '`' || e.code === 'Backquote') {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        if (view !== 'play') {
          setState((s) => ({ ...s, dashboard: { ...s.dashboard, open: true } }));
          navigate('play');
        } else toggleDashboard();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (view === 'play') navigate(lastMenu.current);
        else navigate('play');
      }
    };
    window.addEventListener('keydown', onKey);
    // lets automated tests know the keyboard shortcuts are live
    document.documentElement.dataset.ready = '1';
    return () => window.removeEventListener('keydown', onKey);
  }, [view, toggleDashboard]);

  const revealChrome = useCallback(() => {
    setChrome(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChrome(false), 2500);
  }, []);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  const { display, calib, visual } = state;
  const settings = useMemo(() => pipelineFrom(display, calib, visual), [display, calib, visual]);
  const perf = state.perf;
  const playing = view === 'play';
  const pad = state.controller;
  // ADR 0004: a disconnect shows a toast, never the controller-applet dialog; pausing is only a proposed owner option
  const paused = !pad.connected && pad.pauseOnDisconnect;
  const telemetry = useTelemetry(perf, display, playing && state.dashboard.open && !reducedMotion && !paused);

  const dismissToast = () => {
    setToast(false);
    writeFlag('toast-dismissed', true);
  };

  return (
    <AppContext.Provider value={api}>
      <div className={`app ${playing ? 'is-playing' : 'is-menu'}`}>
        <div
          className={`play-layer ${chrome ? 'show-chrome' : ''} ${state.dashboard.open ? 'dash-open' : ''}`}
          onPointerMove={playing ? revealChrome : undefined}
          onPointerDown={playing ? revealChrome : undefined}
          aria-hidden={!playing}
          inert={!playing}
        >
          <SceneView
            settings={settings}
            haze={state.haze}
            zebra={state.dashboard.open && state.dashboard.zebra}
            falseColor={state.dashboard.open && state.dashboard.falseColor}
            animate={playing && !reducedMotion && !paused}
            publish
            className="scene-full"
            label="Simulated game view: an original procedural scene of floating rock islands over the sea at golden hour"
          />
          <div className="sim-badge" data-testid="sim-badge" role="status">
            <strong>SIMULATED</strong>
            <span className="badge-long">SDR preview of simulated HDR values</span>
            <span className="badge-short">SDR preview</span>
          </div>

          <div className="hover-controls" onFocus={() => setChrome(true)}>
            <button type="button" className="btn btn-glass btn-sm" id="btn-dashboard" aria-pressed={state.dashboard.open} onClick={toggleDashboard}>
              Dashboard <kbd>`</kbd>
            </button>
            <button type="button" className="btn btn-glass btn-sm" id="btn-menu" onClick={() => navigate(lastMenu.current)}>
              Menu <kbd>Esc</kbd>
            </button>
          </div>

          {paused ? (
            <div className="pause-overlay" role="alert">
              <div className="pause-card">
                <h2>Controller disconnected</h2>
                <p>
                  The game is paused because the proposed owner option &quot;Pause while the pad is disconnected&quot; is on. It resumes when
                  the DualSense reconnects on USB or Bluetooth. (Simulated.)
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => update((s) => ({ ...s, controller: { ...s.controller, connected: true } }))}
                >
                  Simulate reconnect
                </button>
              </div>
            </div>
          ) : null}

          {!pad.connected && !paused ? (
            <div className="toast toast-pad" role="status" aria-live="polite" id="pad-toast">
              <div>
                <strong>Controller disconnected ({pad.connection === 'usb' ? 'USB' : 'Bluetooth'})</strong>
                <p>No controller dialog appears (ignore_applet). The game keeps running; reconnect on either bus and the same profile applies.</p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => update((s) => ({ ...s, controller: { ...s.controller, connected: true } }))}
              >
                Simulate reconnect
              </button>
            </div>
          ) : null}

          {playing && state.dashboard.open ? (
            <Dashboard telemetry={telemetry} onClose={toggleDashboard} />
          ) : null}

          {playing && toast ? (
            <div className="toast" role="status" aria-live="polite" id="intro-toast">
              <div>
                <strong>This is a simulated scope demo.</strong>
                <p>
                  Gameplay, HDR values and telemetry are simulated. Press <kbd>`</kbd> (backquote) or the DualSense mute button to toggle
                  the HDR and performance dashboard, and <kbd>Esc</kbd> for the menu. Move the mouse or tap the scene to show the Dashboard
                  and Menu buttons.
                </p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={dismissToast} aria-label="Dismiss introduction">
                Got it
              </button>
            </div>
          ) : null}
        </div>

        {view !== 'play' ? <Menu view={view} telemetry={telemetry} /> : null}
      </div>
    </AppContext.Provider>
  );
}
