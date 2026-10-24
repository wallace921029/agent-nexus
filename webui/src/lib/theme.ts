import { ref } from 'vue';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'nexus-theme';

function loadTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export const theme = ref<Theme>(loadTheme());

export function applyTheme(value: Theme = theme.value): void {
  document.documentElement.dataset.theme = value;
}

export function setTheme(value: Theme): void {
  theme.value = value;
  applyTheme(value);
  try {
    localStorage.setItem(THEME_KEY, value);
  } catch {
    /* 无法持久化时仍保持本次会话内的主题切换 */
  }
}

export function toggleTheme(): void {
  setTheme(theme.value === 'dark' ? 'light' : 'dark');
}
