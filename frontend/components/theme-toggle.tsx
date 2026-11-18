'use client';

import { useTheme } from '@/hooks/use-theme';

const OPTIONS = [
  { theme: 'sol', label: 'Sol' },
  { theme: 'noite', label: 'Noite' },
] as const;

/** Chave de duas posições (alvo de toque ≥ 56 px) entre sol forte e navegação noturna. */
export function ThemeToggle() {
  const [theme, toggle] = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Iluminação: ${theme === 'noite' ? 'noite' : 'sol'}. Tocar para alternar`}
      className="press relative grid min-h-14 grid-cols-2 items-center rounded-xl border border-line bg-surface-2 p-1 font-mono text-xs font-medium uppercase tracking-[0.14em]"
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-ink transition-transform duration-300 ease-out"
        style={{ transform: theme === 'noite' ? 'translateX(100%)' : 'none' }}
      />
      {OPTIONS.map((option) => (
        <span key={option.theme} className={`relative z-10 px-4 transition-colors duration-300 ${theme === option.theme ? 'text-surface' : 'text-muted'}`}>
          {option.label}
        </span>
      ))}
    </button>
  );
}
