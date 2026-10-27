import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'nexus-theme';

function loadTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

let currentTheme: Theme = loadTheme();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Theme {
  return currentTheme;
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function applyTheme(value: Theme = currentTheme): void {
  document.documentElement.dataset.theme = value;
}

export function setTheme(value: Theme): void {
  currentTheme = value;
  applyTheme(value);
  try {
    localStorage.setItem(THEME_KEY, value);
  } catch {
    /* 无法持久化时仍保持本次会话内的主题切换 */
  }
  listeners.forEach((listener) => listener());
}

export function toggleTheme(): void {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}
