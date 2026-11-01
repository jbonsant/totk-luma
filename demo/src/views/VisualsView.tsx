import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { SceneView } from '../components/SceneView';
import { Card, Chip, SimTag, Slider, Toggle } from '../components/ui';
import { PRESETS, presetById, simulatedCostMs } from '../sim/presets';
import { STAGE_LABELS, STAGE_SHORT, activeStages, simulatedSourceMode } from '../sim/source';
import type { LookStage } from '../sim/source';
import type { PresetId, VisualSettings } from '../sim/presets';
import { useApp } from '../state/context';
import { pipelineFrom } from '../state/store';

function SplitPreview() {
  const { state, reducedMotion } = useApp();
  const [split, setSplit] = useState(0.5);
  const [dragging, setDragging] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const { display, calib, visual } = state;
  const after = useMemo(() => pipelineFrom(display, calib, visual), [display, calib, visual]);
  const before = useMemo(() => pipelineFrom(display, calib, { ...presetById('faithful').settings }), [display, calib]);
  const splitProp = useMemo(() => ({ x: split, before }), [split, before]);

  const fromPointer = (e: ReactPointerEvent) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    setSplit(Math.min(0.98, Math.max(0.02, (e.clientX - r.left) / r.width)));
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowLeft') setSplit((s) => Math.max(0.02, s - step));
    else if (e.key === 'ArrowRight') setSplit((s) => Math.min(0.98, s + step));
    else if (e.key === 'Home') setSplit(0.02);
    else if (e.key === 'End') setSplit(0.98);
    else return;
    e.preventDefault();
  };
  const presetName = PRESETS.find((p) => p.id === state.preset)?.name ?? 'Custom';

  return (
    <div
      className={`split-preview ${dragging ? 'dragging' : ''}`}
      ref={boxRef}
      onPointerDown={(e) => {
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        setDragging(true);
        fromPointer(e);
      }}
      onPointerMove={(e) => {
        if (dragging) fromPointer(e);
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      <SceneView
        settings={after}
        split={splitProp}
        haze={state.haze}
        animate={!reducedMotion}
        label={`Simulated before and after comparison: Faithful SDR on the left, ${presetName} on the right`}
        className="scene-split"
      />
      <div className="split-line" style={{ left: `${split * 100}%` }}>
        <button
          type="button"
          className="split-knob"
          role="slider"
          id="split-handle"
          aria-label="Before and after split position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(split * 100)}
          aria-valuetext={`${Math.round(split * 100)}% Faithful SDR`}
          onKeyDown={onKey}
        >
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
            <path d="M7 5l-4 5 4 5M13 5l4 5-4 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <span className="split-tag left">Before - Faithful SDR</span>
      <span className="split-tag right">After - {presetName}</span>
      <span className="sim-badge small-badge">
        <strong>SIMULATED</strong>
        <span className="badge-long">SDR preview of simulated HDR values</span>
        <span className="badge-short">SDR preview</span>
      </span>
    </div>
  );
}

function StageTag({ stage, id }: { stage: LookStage; id: string }) {
  return (
    <span className={`stage-tag stage-${stage}`} title={STAGE_LABELS[stage]} data-testid={`stage-${id}`}>
      {STAGE_SHORT[stage]}
    </span>
  );
}

export function VisualsView() {
  const { state, update } = useApp();
  const v = state.visual;
  const setVisual = (patch: Partial<VisualSettings>) => update((s) => ({ ...s, preset: 'custom', visual: { ...s.visual, ...patch } }));
  const choose = (id: PresetId) =>
    update((s) => ({ ...s, preset: id, visual: id === 'custom' ? { ...s.visual } : { ...presetById(id).settings } }));
  const costs = simulatedCostMs(v, state.perf.resolution);
  const total = costs.reduce((a, c) => a + c.ms, 0);
  const stages = activeStages(simulatedSourceMode(v.hdr));

  return (
    <div className="view visuals">
      <div className="preset-grid" role="radiogroup" aria-label="Visual preset">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={state.preset === p.id}
            id={`preset-${p.id}`}
            className={`preset-card ${state.preset === p.id ? 'on' : ''}`}
            onClick={() => choose(p.id)}
          >
            <span className={`preset-swatch sw-${p.id}`} aria-hidden="true" />
            <strong>{p.name}</strong>
            <span className="small muted">{p.summary}</span>
            {p.note ? <span className="small note">{p.note}</span> : null}
          </button>
        ))}
      </div>

      <div className="visuals-main">
        <Card title="Before / after" tag={<SimTag />} className="split-card">
          <SplitPreview />
          <p className="small split-caption" data-testid="split-caption">
            Both halves use the same SDR preview mapping: paper white is held at about 81% grey so the right side has room for highlights.
            Real SDR on an SDR screen looks brighter than the left half, so this split overstates the HDR gain.
          </p>
          <p className="muted small">Drag the handle, or focus it and use the arrow keys. The left side always shows Faithful SDR.</p>
        </Card>

        <Card title="Adjust" tag={<Chip tone={state.preset === 'custom' ? 'accent' : 'neutral'}>{state.preset === 'custom' ? 'Custom' : 'Preset values'}</Chip>}>
          <div className="stage-legend small" data-testid="stage-legend">
            <p>
              <StageTag stage="scene" id="legend-scene" /> scene-linear, before the tonemap (inside the replaced tonemap, planned P3).
            </p>
            <p>
              <StageTag stage="display" id="legend-display" /> in nits, after the tonemap (inside the output stage).
            </p>
            <p className="muted">
              Active here: {stages.label}. Until scene capture exists (before P3) the app runs the display stage only and labels looks
              &quot;approximate&quot;.
            </p>
          </div>
          <Toggle id="hdr-output" label="HDR output" checked={v.hdr} onChange={(x) => setVisual({ hdr: x })} hint="Off gives the faithful SDR image, clipped at paper white." />
          <Slider
            id="exposure"
            label="Exposure"
            tag={<StageTag stage="scene" id="exposure" />}
            value={v.exposure}
            min={-2}
            max={2}
            step={0.1}
            format={(x) => `${x > 0 ? '+' : ''}${x.toFixed(1)} EV`}
            onChange={(x) => setVisual({ exposure: x })}
          />
          <Slider
            id="highlight-saturation"
            label="Highlight chroma"
            tag={<StageTag stage="display" id="highlight-saturation" />}
            value={v.highlightSaturation}
            min={0}
            max={1.5}
            step={0.05}
            format={(x) => `${Math.round(x * 100)}%`}
            onChange={(x) => setVisual({ highlightSaturation: x })}
          />
          <Slider id="vibrance" label="Vibrance" tag={<StageTag stage="scene" id="vibrance" />} value={v.vibrance} min={-0.5} max={1} step={0.05} format={(x) => `${x > 0 ? '+' : ''}${Math.round(x * 100)}`} onChange={(x) => setVisual({ vibrance: x })} />
          <Slider id="contrast" label="Contrast" tag={<StageTag stage="scene" id="contrast" />} value={v.contrast} min={0.7} max={1.4} step={0.01} format={(x) => x.toFixed(2)} onChange={(x) => setVisual({ contrast: x })} />
          <Slider
            id="haze-reduction"
            label="Defog (built-in)"
            tag={<StageTag stage={stages.approximate ? 'display' : 'scene'} id="haze-reduction" />}
            value={v.hazeReduction}
            min={0}
            max={1}
            step={0.05}
            format={(x) => `${Math.round(x * 100)}%`}
            onChange={(x) => setVisual({ hazeReduction: x })}
            hint="Built-in defog: scene-stage airlight subtraction from P3; before that a display-stage approximation. Clear Air prefers the Serfrost mod you install yourself."
          />
          <Slider id="sharpening" label="Sharpening" tag={<StageTag stage="display" id="sharpening" />} value={v.sharpening} min={0} max={1} step={0.05} format={(x) => `${Math.round(x * 100)}%`} onChange={(x) => setVisual({ sharpening: x })} />
          <Slider
            id="scene-haze"
            label="Scene haze (simulated weather)"
            value={state.haze}
            min={0}
            max={1}
            step={0.05}
            format={(x) => `${Math.round(x * 100)}%`}
            onChange={(x) => update((s) => ({ ...s, haze: x }))}
            hint="Changes the demo scene itself, so you can judge haze reduction."
          />
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Cost estimate" tag={<SimTag label="Simulated estimate" />}>
          <table className="data-table compact">
            <tbody>
              {costs.map((c) => (
                <tr key={c.label} className={c.ms === 0 ? 'off' : ''}>
                  <th scope="row">{c.label}</th>
                  <td className="num right">{c.ms === 0 ? 'off' : `${c.ms.toFixed(2)} ms`}</td>
                </tr>
              ))}
              <tr className="total">
                <th scope="row">Total per frame at {state.perf.resolution}x</th>
                <td className="num right">{total.toFixed(2)} ms</td>
              </tr>
            </tbody>
          </table>
          <p className="muted small">Invented numbers to show where the cost readout would live. A 45 FPS frame budget is 22.2 ms.</p>
        </Card>
        <div className="stack">
          <Card title="Clear Air defog" tag={<Chip tone="neutral">Not bundled</Chip>} id="clear-air">
            <ul className="fact-list small">
              <li>
                Preferred: the Serfrost Base Defogger v2.4 mod, installed by you, checked by checksum and judged in a same-framing A/B (gate
                G-LOOK-1). Luma never bundles or redistributes it (licence CC BY-NC-ND).
              </li>
              <li>Otherwise: the built-in defog, a display-stage approximation until scene capture exists (P3).</li>
            </ul>
            <p className="small">
              <Chip tone="neutral">Serfrost mod: not detected (simulated)</Chip> <span className="muted">Install it yourself to use it.</span>
            </p>
          </Card>
          <Card title="ReShade FX effects - later gated phase" tag={<Chip tone="neutral">Later phase</Chip>} id="reshade-fx">
            <ul className="placeholder-list small">
              <li>ReShade FX through the embedded reshadefx compiler (BSD-3), on the emulator&apos;s own Vulkan device</li>
              <li>Runs in the output stage, after the tonemap, on float (rgba16f) values</li>
              <li>Starts only after P4, and only if you name effects the built-in looks cannot provide (gate G-FX)</li>
              <li>librashader is not adopted: it runs RetroArch slang presets, not ReShade FX</li>
            </ul>
            <p className="muted small">Placeholder only. Nothing here loads or runs shader code.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
