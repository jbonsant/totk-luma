import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { useId, useRef } from 'react';
import { splitNoBreak } from './nobreak';

export type Tone = 'neutral' | 'ok' | 'warn' | 'critical' | 'accent' | 'info';

export function Chip({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`chip chip-${tone}`} title={title}>
      {children}
    </span>
  );
}

/** The small "Simulated" tag required on every graph and readout. */
export function SimTag({ label = 'Simulated' }: { label?: string }) {
  return <span className="sim-tag">{label}</span>;
}

/** The three label classes every number carries (ADR 0002 D9, R09). */
export type LabelClass = 'signal' | 'profile' | 'measured';

export const LABEL_CLASS_TEXT: Record<LabelClass, string> = {
  signal: 'signal (computed)',
  profile: 'profile (target)',
  measured: 'measured',
};

export function LabelChip({ kind }: { kind: LabelClass }) {
  return <span className={`label-chip label-${kind}`}>{LABEL_CLASS_TEXT[kind]}</span>;
}

export const SCOPE_TEXT = 'Visual scope demo - simulated gameplay and telemetry - not evidence that HDR or emulation works';

export function ScopeBanner() {
  return (
    <div className="scope-banner" role="note">
      <span className="scope-dot" aria-hidden="true" />
      <span>{SCOPE_TEXT}</span>
    </div>
  );
}

export function Card({
  title,
  tag,
  children,
  className = '',
  actions,
  id,
}: {
  title: ReactNode;
  tag?: ReactNode;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <section className={`card ${className}`} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      <header className="card-head">
        <h3 className="card-title">{title}</h3>
        <div className="card-meta">
          {tag}
          {actions}
        </div>
      </header>
      {children}
    </section>
  );
}

export interface SegOption<T extends string | number> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  hint?: string;
}

export function Segmented<T extends string | number>({
  id,
  label,
  value,
  options,
  onChange,
  size = 'md',
  hideLabel = false,
}: {
  id: string;
  label: string;
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  hideLabel?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const pos = enabled.indexOf(idx);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = enabled[(pos + 1) % enabled.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (next >= 0) {
      e.preventDefault();
      onChange(options[next].value);
      refs.current[next]?.focus();
    }
  };
  return (
    <div className={`field seg-field ${hideLabel ? 'label-hidden' : ''}`}>
      <span className="field-label" id={`${id}-label`}>
        {label}
      </span>
      <div className={`segmented seg-${size}`} role="radiogroup" aria-labelledby={`${id}-label`} id={id}>
        {options.map((o, i) => {
          const checked = o.value === value;
          return (
            <button
              key={String(o.value)}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              id={`${id}-${String(o.value).replace(/[^a-z0-9]+/gi, '-')}`}
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              disabled={o.disabled}
              title={o.hint}
              className={checked ? 'on' : ''}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Slider({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v: number) => String(v),
  hint,
  disabled,
  tag,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: ReactNode;
  disabled?: boolean;
  /** Small chip after the label, for example the look stage. */
  tag?: ReactNode;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="field slider-field">
      <div className="slider-top">
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        {tag}
        <output htmlFor={id} id={`${id}-value`} className="num slider-value">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={format(value)}
        style={{ '--pct': `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

export function Toggle({
  id,
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  id: string;
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const hintId = useId();
  return (
    <div className="field toggle-field">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={hint ? hintId : undefined}
        disabled={disabled}
        className={`switch ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-track" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
        <span className="switch-label">{label}</span>
      </button>
      {hint ? (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  tone,
  sub,
  testId,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: Tone;
  sub?: ReactNode;
  testId?: string;
}) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value num" data-testid={testId}>
        {value}
        {unit ? <span className="stat-unit">{unit}</span> : null}
      </span>
      {sub ? <span className="stat-sub">{sub}</span> : null}
    </div>
  );
}

/** Copy whose gate ids, dates and numeric ranges never wrap at their hyphen. */
export function NoBreak({ text }: { text: string }) {
  return (
    <>
      {splitNoBreak(text).map((r, i) =>
        r.keep ? (
          <span key={i} className="nobr">
            {r.text}
          </span>
        ) : (
          r.text
        ),
      )}
    </>
  );
}

export function fmtNits(n: number): string {
  if (n >= 1000) return `${Math.round(n).toLocaleString('en-US')}`;
  if (n >= 10) return `${Math.round(n)}`;
  if (n >= 1) return n.toFixed(1);
  if (n >= 0.01) return n.toFixed(2);
  return n.toFixed(4);
}

export function fmtPct(f: number): string {
  const p = f * 100;
  if (p === 0) return '0%';
  if (p < 0.1) return '<0.1%';
  return `${p.toFixed(p < 10 ? 1 : 0)}%`;
}
