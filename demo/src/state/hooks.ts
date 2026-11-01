import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ViewId } from './store';
import { VIEW_IDS } from './store';

function subscribeMedia(query: string) {
  return (cb: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
  };
}

const reducedQuery = '(prefers-reduced-motion: reduce)';
const subscribeReduced = subscribeMedia(reducedQuery);

/** True when the viewer asked for reduced motion, or the URL has ?still. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(reducedQuery).matches || new URLSearchParams(window.location.search).has('still'),
    () => false,
  );
}

const narrowQuery = '(max-width: 760px)';
const subscribeNarrow = subscribeMedia(narrowQuery);

export function useNarrow(): boolean {
  return useSyncExternalStore(subscribeNarrow, () => window.matchMedia(narrowQuery).matches, () => false);
}

export function parseHash(hash: string): ViewId {
  const id = hash.replace(/^#/, '').trim().toLowerCase();
  return (VIEW_IDS as string[]).includes(id) ? (id as ViewId) : 'play';
}

function subscribeHash(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useHashView(): ViewId {
  return useSyncExternalStore(subscribeHash, () => parseHash(window.location.hash), () => 'play' as ViewId);
}

export function navigate(view: ViewId): void {
  const target = `#${view}`;
  if (window.location.hash !== target) window.location.hash = target;
}

/** Calls fn roughly every `ms` while active. */
export function useInterval(fn: () => void, ms: number, active = true): void {
  const saved = useRef(fn);
  useEffect(() => {
    saved.current = fn;
  });
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => saved.current(), ms);
    return () => window.clearInterval(id);
  }, [ms, active]);
}
