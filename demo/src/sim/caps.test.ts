import { describe, expect, it } from 'vitest';
import { NATIVE_CAP_LABEL, capMenu, panelModeAvailable, resolveCap, resolvePanelMode } from './caps';
import type { PanelModeId } from './caps';

const menuFor = (display: 'macbook' | 'a95l', mode: PanelModeId, d2 = true, vrrVerified = false) =>
  capMenu(display, resolvePanelMode(display, mode, vrrVerified), d2);
const fpsOf = (m: ReturnType<typeof menuFor>) => m.map((o) => o.fps);
const opt = (m: ReturnType<typeof menuFor>, fps: number) => m.find((o) => o.fps === fps);

describe('cap menus per display (ADR 0003 §2)', () => {
  it('built-in ProMotion: 30, 40, 48, 60 (experimental), plus 45 with a cadence warning suggesting 40 or 48', () => {
    const m = menuFor('macbook', 'promotion');
    expect(fpsOf(m)).toEqual([30, 40, 45, 48, 60]);
    expect(opt(m, 60)?.label).toBe('60 (experimental)');
    expect(opt(m, 60)?.chip).toBe('Experimental');
    expect(opt(m, 45)?.chip).toBe('Cadence warning');
    expect(opt(m, 45)?.warning).toContain('20.8 / 20.8 / 25.0 ms');
    expect(opt(m, 45)?.suggest).toEqual([40, 48]);
    for (const f of [30, 40, 48, 60]) expect(opt(m, f)?.fit).toBe('even');
    expect(opt(m, 45)?.fit).toBe('uneven');
  });

  it('built-in fixed 60 Hz: 30, 60 (experimental), plus 45 with a (2,1,1) warning suggesting 30', () => {
    const m = menuFor('macbook', 'fixed60');
    expect(fpsOf(m)).toEqual([30, 45, 60]);
    expect(opt(m, 45)?.warning).toContain('2,1,1');
    expect(opt(m, 45)?.suggest).toEqual([30]);
  });

  it('built-in fixed 48 Hz: 48 only', () => {
    const m = menuFor('macbook', 'fixed48');
    expect(fpsOf(m)).toEqual([48]);
    expect(opt(m, 48)?.fit).toBe('even');
  });

  it('A95L fixed 120 Hz: 30, 40, 60 (experimental), plus 45 with a (3,3,2) warning suggesting 40', () => {
    const m = menuFor('a95l', 'fixed120');
    expect(fpsOf(m)).toEqual([30, 40, 45, 60]);
    expect(opt(m, 45)?.warning).toContain('3,3,2');
    expect(opt(m, 45)?.suggest).toEqual([40]);
    expect(opt(m, 60)?.label).toBe('60 (experimental)');
  });

  it('A95L fixed 60 Hz: 30, 60 (experimental), plus 45 with a warning suggesting 30', () => {
    const m = menuFor('a95l', 'fixed60');
    expect(fpsOf(m)).toEqual([30, 45, 60]);
    expect(opt(m, 45)?.suggest).toEqual([30]);
  });

  it('A95L HDMI VRR is offered only after the simulated G6-1 pass', () => {
    expect(panelModeAvailable('a95l', 'vrr', false)).toBe(false);
    expect(resolvePanelMode('a95l', 'vrr', false).id).toBe('fixed120');
    expect(panelModeAvailable('a95l', 'vrr', true)).toBe(true);
    const m = menuFor('a95l', 'vrr', true, true);
    expect(fpsOf(m)).toEqual([30, 45, 60]);
    expect(m.every((o) => o.fit === 'VRR')).toBe(true);
    expect(opt(m, 45)?.warning).toBeNull();
    expect(opt(m, 60)?.label).toBe('60 (experimental)');
  });

  it('the MacBook has no VRR mode', () => {
    expect(panelModeAvailable('macbook', 'vrr', true)).toBe(false);
  });

  it('without the D2 timing patch only "30 (native)" is offered, on every mode', () => {
    for (const [d, mode] of [
      ['macbook', 'promotion'],
      ['macbook', 'fixed60'],
      ['macbook', 'fixed48'],
      ['a95l', 'fixed120'],
      ['a95l', 'fixed60'],
    ] as const) {
      const m = menuFor(d, mode, false);
      expect(m.map((o) => o.label)).toEqual([NATIVE_CAP_LABEL]);
    }
  });

  it('never offers an unlocked or unbounded cap, nor anything above 60', () => {
    for (const [d, mode] of [
      ['macbook', 'promotion'],
      ['macbook', 'fixed60'],
      ['macbook', 'fixed48'],
      ['a95l', 'fixed120'],
      ['a95l', 'fixed60'],
      ['a95l', 'vrr'],
    ] as const) {
      const m = menuFor(d, mode, true, true);
      expect(m.every((o) => o.fps <= 60)).toBe(true);
      expect(m.some((o) => /unlock|unbound/i.test(o.label))).toBe(false);
    }
  });
});

describe('resolving the cap in effect', () => {
  it('keeps a cap the menu offers', () => {
    expect(resolveCap(menuFor('macbook', 'promotion'), 48).fps).toBe(48);
  });

  it('falls back to 40, then 30, then the only option', () => {
    expect(resolveCap(menuFor('a95l', 'fixed120'), 48).fps).toBe(40);
    expect(resolveCap(menuFor('a95l', 'fixed60'), 40).fps).toBe(30);
    expect(resolveCap(menuFor('macbook', 'fixed48'), 40).fps).toBe(48);
    expect(resolveCap(menuFor('macbook', 'promotion', false), 60).label).toBe(NATIVE_CAP_LABEL);
  });
});
