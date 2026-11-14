import { NavigationStatus, type TelemetryPacket } from '@/lib/edge-api';
import { formatAge, formatNumber } from '@/lib/format';
import { ThemeToggle } from './theme-toggle';

const NAV_STATUS: Record<NavigationStatus, { label: string; className: string }> = {
  [NavigationStatus.Unspecified]: { label: 'Sem status', className: 'bg-surface-2 text-muted' },
  [NavigationStatus.Atracado]: { label: 'Atracado', className: 'bg-surface-2 text-ink' },
  [NavigationStatus.EmTravessia]: { label: 'Em travessia', className: 'bg-accent text-surface' },
  [NavigationStatus.Manobra]: { label: 'Manobra', className: 'bg-warn text-surface' },
  [NavigationStatus.Emergencia]: { label: 'Emergência', className: 'bg-danger text-surface animate-pulse' },
};

interface PanelHeaderProps {
  packet: TelemetryPacket | null;
  now: number;
}

function boatName(boatId: string): string {
  return boatId.replace(/^ferry-/, '').split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export function PanelHeader({ packet, now }: PanelHeaderProps) {
  const status = NAV_STATUS[packet?.navegacao?.status_navegacao ?? NavigationStatus.Unspecified];
  const collectedAt = packet ? Number(packet.timestamp_coleta) : null;
  const stale = collectedAt !== null && now - collectedAt > 15_000;

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-muted">Painel do Capitão · Salvador ⇄ Itaparica</p>
        <h1 className="font-display text-4xl font-bold leading-tight">{packet ? `Ferry ${boatName(packet.boat_id)}` : 'Aguardando telemetria'}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-xl px-4 py-3 font-display text-lg font-semibold uppercase tracking-wider ${status.className}`}>{status.label}</span>
        {packet && (
          <span className="rounded-xl bg-surface px-4 py-3 text-base">
            <strong className="font-display text-lg">{formatNumber(packet.passageiros)}</strong> <span className="text-muted">a bordo</span>
          </span>
        )}
        {collectedAt !== null && (
          <span className={`rounded-xl bg-surface px-4 py-3 text-base ${stale ? 'font-semibold text-danger' : 'text-muted'}`}>
            Leitura {formatAge(collectedAt, now)}
          </span>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
