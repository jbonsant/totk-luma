import { useEffect, useRef, useState } from 'react';

const varCache = new Map<string, string>();

/** Read a colour token from :root (cached). */
export function cssVar(name: string): string {
  const hit = varCache.get(name);
  if (hit) return hit;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  varCache.set(name, v);
  return v;
}

/** Tracks the CSS size of a canvas and returns a DPR-scaled 2D context getter. */
export function useSizedCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

export function prepareCanvas(canvas: HTMLCanvasElement | null, w: number, h: number): CanvasRenderingContext2D | null {
  if (!canvas || w <= 0 || h <= 0) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.round(w * dpr);
  const H = Math.round(h * dpr);
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

export const MONO = '10px ui-monospace, "SF Mono", Menlo, monospace';
