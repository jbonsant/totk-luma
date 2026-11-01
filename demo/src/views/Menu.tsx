import { useEffect, useRef } from 'react';
import { ScopeBanner } from '../components/ui';
import { navigate } from '../state/hooks';
import { MENU_VIEWS } from '../state/store';
import type { MenuViewId } from '../state/store';
import type { Telemetry } from '../state/useTelemetry';
import { CalibrateView } from './CalibrateView';
import { ControllerView } from './ControllerView';
import { HelpView } from './HelpView';
import { PerformanceView } from './PerformanceView';
import { VisualsView } from './VisualsView';

const ICONS: Record<MenuViewId, string> = {
  calibrate: 'M4 18h16M6 14l3-6 3 4 2-3 4 5',
  performance: 'M4 17l4-5 4 3 6-8M4 20h16',
  visuals: 'M12 4a8 8 0 100 16V4z M12 4a8 8 0 010 16',
  controller: 'M7 9h10a4 4 0 014 4v1a3 3 0 01-5.2 2L14 14h-4l-1.8 2A3 3 0 013 14v-1a4 4 0 014-4z',
  help: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17h.01',
};

function RailIcon({ id }: { id: MenuViewId }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="rail-icon">
      <path d={ICONS[id]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Menu({ view, telemetry }: { view: MenuViewId; telemetry: Telemetry }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const meta = MENU_VIEWS.find((v) => v.id === view) ?? MENU_VIEWS[0];

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    document.querySelector('.menu-main')?.scrollTo({ top: 0 });
  }, [view]);

  return (
    <div className="menu" role="dialog" aria-modal="false" aria-label="TOTK Luma menu">
      <nav className="rail" aria-label="Menu views">
        <div className="rail-brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">TOTK Luma</span>
        </div>
        <button type="button" className="rail-item rail-resume" onClick={() => navigate('play')} id="nav-play">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="rail-icon">
            <path d="M8 5l11 7-11 7z" fill="currentColor" />
          </svg>
          <span>Resume</span>
        </button>
        {MENU_VIEWS.map((v) => (
          <a
            key={v.id}
            href={`#${v.id}`}
            id={`nav-${v.id}`}
            className={`rail-item ${v.id === view ? 'on' : ''}`}
            aria-current={v.id === view ? 'page' : undefined}
          >
            <RailIcon id={v.id} />
            <span>{v.label}</span>
          </a>
        ))}
        <p className="rail-foot small">
          <kbd>Esc</kbd> resume
          <br />
          <kbd>`</kbd> or mute: dashboard
        </p>
      </nav>
      <main className="menu-main" id={`view-${view}`}>
        <ScopeBanner />
        <header className="view-head">
          <h1 ref={headingRef} tabIndex={-1}>
            {meta.label}
          </h1>
          <p className="muted">{meta.hint}</p>
        </header>
        {view === 'calibrate' ? <CalibrateView /> : null}
        {view === 'performance' ? <PerformanceView telemetry={telemetry} /> : null}
        {view === 'visuals' ? <VisualsView /> : null}
        {view === 'controller' ? <ControllerView /> : null}
        {view === 'help' ? <HelpView /> : null}
      </main>
    </div>
  );
}
