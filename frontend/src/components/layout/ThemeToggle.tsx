/**
 * ThemeToggle - switches light/dark and remembers the choice.
 * The initial theme is set by the inline script in index.html.
 */

import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import styles from './Header.module.css';

type Theme = 'light' | 'dark';

declare global {
  interface Window {
    __applyTheme?: (theme: Theme) => void;
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  );
  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  const toggle = () => {
    if (window.__applyTheme) window.__applyTheme(next);
    else document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Storage blocked (private mode); the choice just won't be remembered
    }
    setTheme(next);
  };

  return (
    <button
      type="button"
      className={styles.themeToggle}
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </button>
  );
}
