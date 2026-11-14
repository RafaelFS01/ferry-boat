'use client';

import { useTheme } from '@/hooks/use-theme';

/** Botão grande (alvo de toque ≥ 56 px) para alternar sol forte / navegação noturna. */
export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const night = theme === 'noite';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={night}
      className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-surface-2 px-5 font-display text-lg font-semibold uppercase tracking-wider active:scale-[0.97]"
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        {night ? (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        ) : (
          <>
            <circle cx={12} cy={12} r={4} />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
      </svg>
      {night ? 'Noite' : 'Sol'}
    </button>
  );
}
