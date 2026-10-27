import { useSyncExternalStore } from 'react';
import { getState as fetchState, type NexusState } from './api';

export type View = 'dashboard' | 'agents' | 'skills' | 'mcp' | 'files' | 'logs';

export interface LogEntry {
  id: string;
  ts: string;
  msg: string;
  level: 'ok' | 'err' | 'info';
}

type StoredLogEntry = Omit<LogEntry, 'id'> & { id?: string };

export interface StoreState {
  view: View;
  state: NexusState | null;
  logs: LogEntry[];
  loading: boolean;
  error: string | null;
}

const LOG_KEY = 'nexus-logs';
let logSequence = 0;

function loadLogs(): LogEntry[] {
  try {
    const entries = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]') as StoredLogEntry[];
    return entries.map((entry, index) => ({ ...entry, id: entry.id ?? `legacy-${index}-${entry.ts}` }));
  } catch {
    return [];
  }
}

let storeState: StoreState = {
  view: 'dashboard',
  state: null,
  logs: loadLogs(),
  loading: false,
  error: null,
};

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): StoreState {
  return storeState;
}

function update(partial: Partial<StoreState>): void {
  storeState = { ...storeState, ...partial };
  listeners.forEach((listener) => listener());
}

/** 订阅全局面板状态；状态以不可变方式更新，保证 React 正确重渲染。 */
export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setView(view: View): void {
  update({ view });
}

export function log(msg: string, level: LogEntry['level'] = 'info'): void {
  const ts = new Date().toTimeString().slice(0, 8);
  const entry: LogEntry = { id: `log-${Date.now()}-${logSequence++}`, ts, msg, level };
  const logs = [entry, ...storeState.logs].slice(0, 300);
  update({ logs });
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(logs));
  } catch {
    /* 存不下就算了 */
  }
}

export function clearLogs(): void {
  update({ logs: [] });
  localStorage.removeItem(LOG_KEY);
}

export async function refresh(): Promise<void> {
  update({ loading: true });
  try {
    const state = await fetchState();
    update({ state, error: null });
  } catch (e) {
    const error = (e as Error).message || String(e);
    update({ error });
    log(`Failed to load state: ${error}`, 'err');
  } finally {
    update({ loading: false });
  }
}
