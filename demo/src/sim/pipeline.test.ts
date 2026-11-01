import { describe, expect, it } from 'vitest';
import { allocBuffers, processFrame } from './pipeline';
import type { PipelineSettings } from './pipeline';
import { NEUTRAL } from './presets';

/** A saturated pixel below paper white and a pale one above it, in scene nits (the preview does not clip either). */
const scene = new Float32Array([60, 30, 20, 400, 330, 300]);
const base: PipelineSettings = { visual: { ...NEUTRAL }, display: { peak: 1000, paperWhite: 203, black: 0.005 }, curve: 'bt2390', knee: 0.6, sourceMax: 10000 };
const overlays = { zebra: false, falseColor: false, phase: 0 };

function render(patch: Partial<PipelineSettings['visual']>) {
  const out = allocBuffers(2, 1);
  processFrame(scene, 2, 1, [1, 1, 1], { ...base, visual: { ...base.visual, ...patch } }, out, overlays);
  return Array.from(out.rgba);
}

describe('look stages (ADR 0006)', () => {
  it('highlight chroma is a display stage: it leaves output below paper white untouched', () => {
    const neutral = render({});
    const boosted = render({ highlightSaturation: 1.5 });
    expect(boosted.slice(0, 4)).toEqual(neutral.slice(0, 4));
    expect(boosted.slice(4, 8)).not.toEqual(neutral.slice(4, 8));
  });

  it('vibrance is a scene stage: it changes mid-tones too', () => {
    expect(render({ vibrance: 0.8 }).slice(0, 4)).not.toEqual(render({}).slice(0, 4));
  });
});
