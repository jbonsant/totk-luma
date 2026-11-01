/**
 * Tiny publish/subscribe channel for the latest simulated frame, so scopes can
 * read luminance buffers without going through React state.
 * Listeners must read the buffers synchronously; they are reused next frame.
 */
import type { PipelineSettings } from '../sim/pipeline';

export interface FrameSnapshot {
  width: number;
  height: number;
  lumScene: Float32Array;
  lumOut: Float32Array;
  settings: PipelineSettings;
  sceneMaxNits: number;
}

type Listener = (f: FrameSnapshot) => void;

const listeners = new Set<Listener>();
let latest: FrameSnapshot | null = null;

export function publishFrame(f: FrameSnapshot): void {
  latest = f;
  for (const l of listeners) l(f);
}

export function subscribeFrames(l: Listener): () => void {
  listeners.add(l);
  if (latest) l(latest);
  return () => {
    listeners.delete(l);
  };
}
