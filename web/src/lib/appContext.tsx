import { createContext, useContext } from 'react';
import type { Api } from '../api/client';

export interface AppCtx {
  api: Api;
  /** bump to make pages refetch (after sync, merges, imports …) */
  version: number;
  refresh: () => void;
  toast: (msg: string) => void;
  openSync: () => void;
}

export const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(AppContext);
  if (!c) throw new Error('AppContext missing');
  return c;
}
