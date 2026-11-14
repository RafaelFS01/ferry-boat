import { NavigationStatus } from '@/lib/edge-api';

const POSITIONS = [
  { status: NavigationStatus.Atracado, label: 'Atracado' },
  { status: NavigationStatus.EmTravessia, label: 'Travessia' },
  { status: NavigationStatus.Manobra, label: 'Manobra' },
  { status: NavigationStatus.Emergencia, label: 'Emergência' },
] as const;

const LIT: Record<NavigationStatus, string> = {
  [NavigationStatus.Unspecified]: '',
  [NavigationStatus.Atracado]: 'bg-ink text-surface',
  [NavigationStatus.EmTravessia]: 'bg-accent text-accent-ink',
  [NavigationStatus.Manobra]: 'bg-warn text-surface',
  [NavigationStatus.Emergencia]: 'bg-danger text-white',
};

/** Seletor de modo da embarcação: as quatro posições sempre à vista, só a atual acesa. */
export function NavStatusSelector({ status }: { status: NavigationStatus }) {
  return (
    <ol className="grid grid-cols-4 gap-1 rounded-xl border border-line bg-surface-2 p-1" aria-label="Estado de navegação">
      {POSITIONS.map((position) => {
        const active = position.status === status;
        return (
          <li
            key={position.status}
            aria-current={active ? 'step' : undefined}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-lg px-1 font-mono text-[0.625rem] font-medium uppercase tracking-[0.04em] transition-colors duration-500 sm:px-3 sm:text-xs sm:tracking-[0.12em] ${
              active ? `${LIT[status]} shadow-sm` : 'text-muted'
            }`}
          >
            <span className={`hidden size-1.5 rounded-full sm:block ${active ? 'bg-current' : 'bg-muted/40'}`} aria-hidden />
            {position.label}
          </li>
        );
      })}
    </ol>
  );
}
