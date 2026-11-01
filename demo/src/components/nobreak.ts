/**
 * Splits copy into runs, marking the tokens that must not wrap at their hyphen:
 * gate ids (G-AB, G6-1, G-INP-1), ISO dates (2026-10-13) and numeric ranges
 * (8.33-41.67, 85-88). Browsers break after a hyphen, which turns "gate G-AB"
 * into "gate G-" and "AB" on two lines.
 */
const KEEP = /(G\d*-[A-Z0-9]+(?:-[A-Z0-9]+)*|\d{4}-\d{2}-\d{2}|\d+(?:\.\d+)?-\d+(?:\.\d+)?)/g;

export interface TextRun {
  text: string;
  keep: boolean;
}

export function splitNoBreak(text: string): TextRun[] {
  const out: TextRun[] = [];
  let last = 0;
  for (const m of text.matchAll(KEEP)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), keep: false });
    out.push({ text: m[0], keep: true });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), keep: false });
  return out;
}
