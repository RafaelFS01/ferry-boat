import type { Zone } from '@/lib/instruments';
import { ZONE_TEXT } from './tone';

const BAR_COLOR: Record<Zone, string> = { normal: 'bg-accent', warn: 'bg-warn', danger: 'bg-danger' };

interface ReadoutTileProps {
  label: string;
  value: string;
  unit: string;
  zone?: Zone;
  /** 0–100: barra de nível abaixo do valor */
  level?: number;
  caption?: string;
}

/** Leitura numérica grande com barra de nível opcional (temperatura, bateria). */
export function ReadoutTile({ label, value, unit, zone = 'normal', level, caption }: ReadoutTileProps) {
  return (
    <div className="flex flex-col justify-between rounded-xl bg-surface-2 p-4">
      <span className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-muted">{label}</span>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`font-display text-5xl font-semibold leading-none ${ZONE_TEXT[zone]}`}>{value}</span>
        <span className="text-base text-muted">{unit}</span>
      </div>
      {level !== undefined && (
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className={`h-full rounded-full ${BAR_COLOR[zone]} transition-[width] duration-700`} style={{ width: `${level}%` }} />
        </div>
      )}
      {caption && <span className={`mt-2 text-sm ${zone === 'normal' ? 'text-muted' : ZONE_TEXT[zone]}`}>{caption}</span>}
    </div>
  );
}
