import { NavigationStatus, type TelemetryPacket } from '@/lib/edge-api';
import { formatAge, formatClock, formatNumber } from '@/lib/format';
import { NavStatusSelector } from './nav-status-selector';
import { ThemeToggle } from './theme-toggle';

interface ConsoleHeaderProps {
  packet: TelemetryPacket | null;
  now: number;
}

function vesselName(boatId: string): string {
  return boatId.replace(/^ferry-/, '').split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export function ConsoleHeader({ packet, now }: ConsoleHeaderProps) {
  const collectedAt = packet ? Number(packet.timestamp_coleta) : null;
  const stale = collectedAt !== null && now - collectedAt > 15_000;

  return (
    <header className="grid items-center gap-x-8 gap-y-4 lg:grid-cols-[1fr_auto_1fr]">
      <div className="min-w-0">
        <p className="engraved">Ferry · Salvador ⇄ Itaparica</p>
        <h1 className="truncate text-4xl font-medium tracking-[-0.03em] sm:text-5xl">
          {packet ? vesselName(packet.boat_id) : 'Aguardando telemetria'}
        </h1>
      </div>

      <NavStatusSelector status={packet?.navegacao?.status_navegacao ?? NavigationStatus.Unspecified} />

      <div className="flex items-center gap-5 lg:justify-end">
        <div className="flex flex-col items-end">
          <span className="font-mono text-2xl font-medium leading-none" suppressHydrationWarning>
            {formatClock(now)}
          </span>
          <span className={`mt-1 font-mono text-xs ${stale ? 'font-semibold text-danger' : 'text-muted'}`}>
            {collectedAt === null ? 'sem leitura' : `leitura ${formatAge(collectedAt, now)}`}
          </span>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
