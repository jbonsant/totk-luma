import { createContext, useContext } from 'react';
import type { AppState } from './store';

export interface AppApi {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  reducedMotion: boolean;
}

export const AppContext = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const api = useContext(AppContext);
  if (!api) throw new Error('useApp must be used inside AppContext');
  return api;
}
