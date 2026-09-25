import { useCallback, useState } from 'react';
import { safeSet } from './storage.js';

export type Theme = 'light' | 'dark';

// En sync con public/theme-init.js, que aplica el tema guardado antes de que cargue React.
export const THEME_STORAGE_KEY = 'hidro:theme';
const THEME_COLOR: Record<Theme, string> = { light: '#F7F5EE', dark: '#0E1411' };

function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    safeSet(THEME_STORAGE_KEY, next);
    setTheme(next);
  }, []);
  return { theme, toggle };
}
