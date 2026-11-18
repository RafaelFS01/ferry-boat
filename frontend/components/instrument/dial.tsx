import { formatNumber } from '@/lib/format';
import { zoneOf, type InstrumentRange } from '@/lib/instruments';
import { ZONE_TEXT } from '../tone';
import { Bezel } from './bezel';
import { arcPath, polar } from './svg-geometry';

interface DialProps {
  /** Sigla gravada na face (SOG, RPM) */
  label: string;
  value: number | null;
  range: InstrumentRange;
  unit: string;
  decimals?: number;
  majorStep: number;
  minorStep: number;
  /** Divide os números da escala: 100 transforma 1.800 rpm em "18" */
  scaleDivisor?: number;
  /** Nota da escala gravada abaixo da sigla, ex.: "× 100" */
  scaleNote?: string;
}

const C = 120;
const START = 135;
const SWEEP = 270;
const TICK_OUTER = 99;

/**
 * Mostrador analógico de 270° no padrão dos instrumentos de máquinas:
 * escala fina, setores de atenção e perigo, ponteiro com contrapeso e janela digital.
 */
export function Dial({ label, value, range, unit, decimals = 0, majorStep, minorStep, scaleDivisor = 1, scaleNote }: DialProps) {
  const span = range.max - range.min;
  const angleOf = (v: number) => START + ((Math.min(Math.max(v, range.min), range.max) - range.min) / span) * SWEEP;
  const end = START + SWEEP;
  const zone = value === null ? 'normal' : zoneOf(value, range);
  // O ponteiro é desenhado apontando para o topo (270°)
  const rotation = angleOf(value ?? range.min) - 270;

  const minorCount = Math.round(span / minorStep);
  const ticks = Array.from({ length: minorCount + 1 }, (_, i) => range.min + i * minorStep);
  const isMajor = (v: number) => Math.abs(((v - range.min) / majorStep) - Math.round((v - range.min) / majorStep)) < 1e-6;

  return (
    <svg viewBox="0 0 240 240" className="w-full max-w-80" role="img" aria-label={`${label}: ${value === null ? 'sem leitura' : `${formatNumber(value, decimals)} ${unit}`}`}>
      <Bezel cx={C} cy={C} radius={118} />

      <path d={arcPath(C, C, 103, angleOf(range.warnAt), angleOf(range.dangerAt))} fill="none" stroke="var(--warn)" strokeWidth={7} />
      <path d={arcPath(C, C, 103, angleOf(range.dangerAt), end)} fill="none" stroke="var(--danger)" strokeWidth={7} />

      {ticks.map((v) => {
        const major = isMajor(v);
        const a = polar(C, C, TICK_OUTER, angleOf(v));
        const b = polar(C, C, major ? 86 : 93, angleOf(v));
        return <line key={v} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--ink)" strokeWidth={major ? 2.2 : 1} opacity={major ? 1 : 0.55} />;
      })}

      {ticks.filter(isMajor).map((v) => {
        const p = polar(C, C, 73, angleOf(v));
        return (
          <text key={v} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fill="var(--ink)" fontSize={13} fontWeight={500} fontFamily="var(--font-jetbrains)">
            {formatNumber(v / scaleDivisor)}
          </text>
        );
      })}

      <text x={C} y={C - 34} textAnchor="middle" fill="var(--muted)" fontSize={10} letterSpacing="0.2em" fontFamily="var(--font-jetbrains)">
        {label}
      </text>
      {scaleNote && (
        <text x={C} y={C - 21} textAnchor="middle" fill="var(--muted)" fontSize={8.5} letterSpacing="0.12em" fontFamily="var(--font-jetbrains)">
          {scaleNote}
        </text>
      )}

      {/* Janela digital no vão inferior da escala */}
      <rect x={C - 40} y={C + 40} width={80} height={34} rx={5} fill="var(--surface-2)" stroke="var(--line)" />
      <text
        x={C}
        y={C + 58}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={21}
        fontWeight={600}
        fontFamily="var(--font-jetbrains)"
        className={`${ZONE_TEXT[zone]} fill-current`}
      >
        {value === null ? '—' : formatNumber(value, decimals)}
      </text>
      <text x={C} y={C + 86} textAnchor="middle" fill="var(--muted)" fontSize={9} letterSpacing="0.16em" fontFamily="var(--font-jetbrains)">
        {unit.toUpperCase()}
      </text>

      <g className="needle-transition glow" style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${C}px ${C}px` }} opacity={value === null ? 0.3 : 1}>
        <path d={`M ${C - 1} ${C - 96} L ${C + 1} ${C - 96} L ${C + 4.2} ${C} L ${C + 3} ${C + 24} L ${C - 3} ${C + 24} L ${C - 4.2} ${C} Z`} fill="var(--needle)" />
      </g>
      <circle cx={C} cy={C} r={11} fill="var(--bezel-b)" stroke="var(--bezel-a)" strokeWidth={1.5} />
      <circle cx={C} cy={C} r={4} fill="var(--needle)" />
    </svg>
  );
}
