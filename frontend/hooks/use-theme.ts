'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { THEME_STORAGE_KEY, type Theme } from '@/lib/theme';

function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'noite' ? 'noite' : 'sol';
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/** Tema aplicado em <html data-theme>; o script em layout.tsx evita piscar no carregamento. */
export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'sol' as Theme);

  const toggle = useCallback(() => {
    const next: Theme = readTheme() === 'noite' ? 'sol' : 'noite';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Armazenamento indisponível: o tema vale só para esta sessão
    }
  }, []);

  return [theme, toggle];
}
