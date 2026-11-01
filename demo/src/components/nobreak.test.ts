import { describe, expect, it } from 'vitest';
import { splitNoBreak } from './nobreak';

const kept = (s: string) => splitNoBreak(s).filter((r) => r.keep).map((r) => r.text);

describe('splitNoBreak', () => {
  it('keeps gate ids whole', () => {
    expect(kept('pending (gate G-AB); see G6-1, G-INP-1 and G-METAL')).toEqual(['G-AB', 'G6-1', 'G-INP-1', 'G-METAL']);
  });

  it('keeps dates and numeric ranges whole', () => {
    expect(kept('deprecated on 2026-10-13, about 85-88 s, 8.33-41.67 ms')).toEqual(['2026-10-13', '85-88', '8.33-41.67']);
  });

  it('returns the text unchanged when joined', () => {
    const s = 'A+B fix built, in-game validation pending (gate G-AB).';
    expect(splitNoBreak(s).map((r) => r.text).join('')).toBe(s);
    expect(splitNoBreak('plain text')).toEqual([{ text: 'plain text', keep: false }]);
  });
});
