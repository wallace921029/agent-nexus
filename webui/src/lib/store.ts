import { reactive } from 'vue';
import { getState, type NexusState } from './api';

export type View = 'dashboard' | 'agents' | 'skills' | 'mcp' | 'files' | 'logs';

export interface LogEntry {
  ts: string;
  msg: string;
  level: 'ok' | 'err' | 'info';
}

const LOG_KEY = 'nexus-logs';

function loadLogs(): LogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export const store = reactive<{
  view: View;
  state: NexusState | null;
  logs: LogEntry[];
  loading: boolean;
  error: string | null;
}>({
  view: 'dashboard',
  state: null,
  logs: loadLogs(),
  loading: false,
  error: null,
});

export function log(msg: string, level: LogEntry['level'] = 'info'): void {
  const ts = new Date().toTimeString().slice(0, 8);
  store.logs.unshift({ ts, msg, level });
  if (store.logs.length > 300) store.logs.length = 300;
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(store.logs));
  } catch {
    /* 存不下就算了 */
  }
}

export function clearLogs(): void {
  store.logs = [];
  localStorage.removeItem(LOG_KEY);
}

export async function refresh(): Promise<void> {
  store.loading = true;
  try {
    store.state = await getState();
    store.error = null;
  } catch (e) {
    store.error = (e as Error).message || String(e);
    log(`Failed to load state: ${store.error}`, 'err');
  } finally {
    store.loading = false;
  }
}
