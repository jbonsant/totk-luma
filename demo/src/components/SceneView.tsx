import { useEffect, useRef } from 'react';
import { allocScene, renderScene } from '../sim/scene';
import type { PipelineSettings } from '../sim/pipeline';
import { allocBuffers, processFrame } from '../sim/pipeline';
import { publishFrame } from '../state/frameBus';

export const SCENE_W = 480;
export const SCENE_H = 270;
/** Scene time used when motion is paused (reduced motion, screenshots). */
export const STILL_TIME = 6;

export interface SceneViewProps {
  settings: PipelineSettings;
  haze: number;
  zebra?: boolean;
  falseColor?: boolean;
  split?: { x: number; before: PipelineSettings } | null;
  /** Animate at about 30 Hz; false renders a still frame whenever inputs change. */
  animate: boolean;
  /** Publish luminance buffers to the scopes. */
  publish?: boolean;
  className?: string;
  label: string;
}

interface Runtime {
  rgb: Float32Array;
  buffers: ReturnType<typeof allocBuffers>;
  image: ImageData | null;
  time: number;
  frame: number;
}

/**
 * Renders the original procedural scene at 480 x 270 in scene-linear nits,
 * grades and tone maps it with the simulated pipeline, and lets the browser
 * upscale the canvas (CSS) to its box.
 */
export function SceneView(props: SceneViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  const rt = useRef<Runtime | null>(null);

  useEffect(() => {
    propsRef.current = props;
  });

  const draw = (advance: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!rt.current) {
      rt.current = { rgb: allocScene(SCENE_W, SCENE_H), buffers: allocBuffers(SCENE_W, SCENE_H), image: null, time: STILL_TIME, frame: 0 };
    }
    const r = rt.current;
    const p = propsRef.current;
    r.time += advance;
    r.frame++;
    const frame = renderScene(r.rgb, SCENE_W, SCENE_H, r.time, { haze: p.haze });
    processFrame(
      r.rgb,
      SCENE_W,
      SCENE_H,
      frame.airlight,
      p.settings,
      r.buffers,
      { zebra: !!p.zebra, falseColor: !!p.falseColor, phase: p.animate ? r.frame >> 1 : 0 },
      p.split ?? undefined,
    );
    if (!r.image) r.image = new ImageData(SCENE_W, SCENE_H);
    r.image.data.set(r.buffers.rgba);
    ctx.putImageData(r.image, 0, 0);
    if (p.publish && (!p.animate || r.frame % 3 === 0)) {
      publishFrame({
        width: SCENE_W,
        height: SCENE_H,
        lumScene: r.buffers.lumScene,
        lumOut: r.buffers.lumOut,
        settings: p.settings,
        sceneMaxNits: frame.maxNits,
      });
    }
  };
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  });

  const { animate, settings, haze, zebra, falseColor, split } = props;

  // animation loop at about 30 Hz
  useEffect(() => {
    if (!animate) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 250);
      last = now;
      acc += dt;
      if (acc >= 1000 / 30 - 2) {
        drawRef.current(acc / 1000);
        acc = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate]);

  // still frame whenever the inputs change while paused
  useEffect(() => {
    if (animate) return;
    drawRef.current(0);
  }, [animate, settings, haze, zebra, falseColor, split]);

  return (
    <canvas
      ref={canvasRef}
      className={`scene-canvas ${props.className ?? ''}`}
      width={SCENE_W}
      height={SCENE_H}
      role="img"
      aria-label={props.label}
    />
  );
}
