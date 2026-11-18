import { formatNumber } from '@/lib/format';
import type { Zone } from '@/lib/instruments';
import { ZONE_BG, ZONE_TEXT } from '../tone';

interface BarMeterProps {
  label: string;
  value: number | null;
  min: number;
  max: number;
  unit: string;
  decimals?: number;
  /** Zona de cada ponto da escala; colore os segmentos mesmo apagados */
  zoneAt: (value: number) => Zone;
  /** Leitura secundária à direita do rótulo */
  note?: string;
  segments?: number;
}

/**
 * Medidor de barra em segmentos, como os bargraphs de LED dos painéis de máquinas:
 * a escala inteira aparece apagada com as cores das zonas, e acende até o valor.
 */
export function BarMeter({ label, value, min, max, unit, decimals = 0, zoneAt, note, segments = 24 }: BarMeterProps) {
  const step = (max - min) / segments;
  const zone = value === null ? 'normal' : zoneAt(value);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="engraved">{label}</span>
        {note && <span className="font-mono text-xs text-muted">{note}</span>}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-mono text-[2rem] font-semibold leading-none tracking-tight ${ZONE_TEXT[zone]}`}>
          {value === null ? '—' : formatNumber(value, decimals)}
        </span>
        <span className="font-mono text-sm text-muted">{unit}</span>
      </div>
      <div className="flex h-4 gap-[3px]" role="meter" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value ?? undefined}>
        {Array.from({ length: segments }, (_, i) => {
          const center = min + step * (i + 0.5);
          const lit = value !== null && value >= min + step * i + step * 0.25;
          return <span key={i} className={`segment flex-1 rounded-[2px] ${ZONE_BG[zoneAt(center)]} ${lit ? 'opacity-100' : 'opacity-15'}`} />;
        })}
      </div>
      <div className="flex justify-between font-mono text-[0.625rem] text-muted">
        <span>{formatNumber(min)}</span>
        <span>{formatNumber(max)}</span>
      </div>
    </div>
  );
}
