import { MAX_COMMANDED_KNOTS } from '@/lib/edge-api';
import { formatNumber } from '@/lib/format';

interface SpeedCommandProps {
  /** `null` = automático */
  target: number | null;
  onChange: (target: number | null) => void;
}

const MANUAL_START_KNOTS = 10;

/** Telégrafo de velocidade: automático (o simulador decide) ou velocidade alvo manual. */
export function SpeedCommand({ target, onChange }: SpeedCommandProps) {
  const manual = target !== null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="engraved">Velocidade alvo</span>
        <span className="font-mono text-xs text-muted">0–{MAX_COMMANDED_KNOTS} nós</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="grid min-h-14 flex-1 grid-cols-2 gap-1 rounded-xl border border-line bg-surface-2 p-1 font-mono text-xs font-medium uppercase tracking-[0.12em]">
          <button
            type="button"
            aria-pressed={!manual}
            onClick={() => onChange(null)}
            className={`press rounded-lg ${manual ? 'text-muted' : 'bg-ink text-surface shadow-sm'}`}
          >
            Automático
          </button>
          <button
            type="button"
            aria-pressed={manual}
            onClick={() => onChange(target ?? MANUAL_START_KNOTS)}
            className={`press rounded-lg ${manual ? 'bg-accent text-accent-ink shadow-sm' : 'text-muted'}`}
          >
            Manual
          </button>
        </div>
        <div className="flex w-28 items-baseline justify-end gap-1.5">
          <span className="font-mono text-[2rem] font-semibold leading-none tracking-tight">
            {manual ? formatNumber(target, 1) : 'auto'}
          </span>
          {manual && <span className="font-mono text-sm text-muted">nós</span>}
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={MAX_COMMANDED_KNOTS}
        step={0.5}
        value={target ?? MANUAL_START_KNOTS}
        disabled={!manual}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label="Velocidade alvo em nós"
        className="h-10 w-full cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-40"
      />
    </div>
  );
}
