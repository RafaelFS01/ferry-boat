import { MAX_PASSENGERS } from '@/lib/edge-api';
import { formatNumber } from '@/lib/format';

const STEPS = [-50, -10, 10, 50] as const;

/** Lotação a bordo: contador com passos de embarque e desembarque, e a ocupação em barra. */
export function PassengerCommand({ passengers, onChange }: { passengers: number; onChange: (value: number) => void }) {
  const set = (value: number) => onChange(Math.min(MAX_PASSENGERS, Math.max(0, Math.round(value))));
  const occupancy = passengers / MAX_PASSENGERS;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="engraved">Lotação</span>
        <span className="font-mono text-xs text-muted">capacidade {formatNumber(MAX_PASSENGERS)}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-[2rem] font-semibold leading-none tracking-tight">{formatNumber(passengers)}</span>
        <span className="font-mono text-sm text-muted">a bordo · {formatNumber(occupancy * 100)}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-2"
        role="meter"
        aria-label="Ocupação"
        aria-valuemin={0}
        aria-valuemax={MAX_PASSENGERS}
        aria-valuenow={passengers}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${occupancy >= 0.95 ? 'bg-warn' : 'bg-accent'}`}
          style={{ width: `${occupancy * 100}%` }}
        />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {STEPS.map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => set(passengers + step)}
            disabled={step < 0 ? passengers === 0 : passengers === MAX_PASSENGERS}
            aria-label={step < 0 ? `Desembarcar ${-step}` : `Embarcar ${step}`}
            className="press min-h-12 rounded-xl border border-line bg-surface-2 font-mono text-sm font-medium disabled:opacity-40"
          >
            {step > 0 ? `+${step}` : `−${-step}`}
          </button>
        ))}
      </div>
    </div>
  );
}
