import { formatNumber } from '@/lib/format';
import { zoneOf, type InstrumentRange } from '@/lib/instruments';
import { ZONE_STROKE, ZONE_TEXT } from './tone';

interface ArcGaugeProps {
  value: number | null;
  range: InstrumentRange;
  unit: string;
  decimals?: number;
  /** Divisões entre rótulos; 2 = mínimo, meio e máximo (laterais livres para o valor) */
  ticks?: number;
}

// Arco de 240° aberto para baixo, de 150° a 390° no sentido horário (coordenadas SVG).
const CX = 100;
const CY = 100;
const R = 78;
const START = 150;
const SWEEP = 240;

const point = (angle: number, radius = R) => {
  const rad = (angle * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
};

function arcPath(fromAngle: number, toAngle: number, radius = R): string {
  const a = point(fromAngle, radius);
  const b = point(toAngle, radius);
  const large = toAngle - fromAngle > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y}`;
}

export function ArcGauge({ value, range, unit, decimals = 0, ticks = 2 }: ArcGaugeProps) {
  const span = range.max - range.min;
  const angleOf = (v: number) => START + (Math.min(Math.max(v, range.min), range.max) - range.min) / span * SWEEP;
  const fraction = value === null ? 0 : (angleOf(value) - START) / SWEEP;
  const zone = value === null ? 'normal' : zoneOf(value, range);
  const end = START + SWEEP;

  return (
    <div className="relative mx-auto w-full max-w-72">
      <svg viewBox="0 0 200 165" className="w-full" role="img" aria-label={`${value ?? '—'} ${unit}`}>
        <path d={arcPath(START, end)} fill="none" stroke="var(--surface-2)" strokeWidth={14} strokeLinecap="round" />
        <path d={arcPath(angleOf(range.warnAt), angleOf(range.dangerAt), R + 12)} fill="none" stroke="var(--warn)" strokeWidth={3} />
        <path d={arcPath(angleOf(range.dangerAt), end, R + 12)} fill="none" stroke="var(--danger)" strokeWidth={3} />
        <path
          d={arcPath(START, end)}
          fill="none"
          stroke={ZONE_STROKE[zone]}
          strokeWidth={14}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${fraction * 100} 200`}
          className="needle-transition"
          opacity={value === null || fraction === 0 ? 0 : 1}
        />
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const v = range.min + (span * i) / ticks;
          const label = point(angleOf(v), R - 24);
          return (
            <text key={v} x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fill="var(--muted)" fontSize={10}>
              {formatNumber(v)}
            </text>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-[38%] flex flex-col items-center">
        <span className={`font-display text-6xl leading-none font-semibold ${ZONE_TEXT[zone]}`}>
          {value === null ? '—' : formatNumber(value, decimals)}
        </span>
        <span className="mt-1 text-sm uppercase tracking-widest text-muted">{unit}</span>
      </div>
    </div>
  );
}
