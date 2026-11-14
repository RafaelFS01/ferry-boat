'use client';

import { useRef } from 'react';
import { Bezel } from './bezel';
import { polar } from './svg-geometry';

/** Acumula a rotação pelo menor caminho, evitando a volta completa ao cruzar 0°/360°. */
function useUnwrappedAngle(angle: number): number {
  const previous = useRef(angle);
  const delta = ((((angle - previous.current) % 360) + 540) % 360) - 180;
  previous.current += delta;
  return previous.current;
}

const C = 150;
const CARD_OUTER = 128;
const CARDINALS: Record<number, string> = { 0: 'N', 90: 'L', 180: 'S', 270: 'O' };
const DEGREES = Array.from({ length: 72 }, (_, i) => i * 5);

/**
 * Repetidora da giro: o cartão gira sob a linha de fé fixa e a silhueta do
 * navio fica sempre com a proa para cima, como no console real da ponte.
 */
export function GyroRepeater({ heading }: { heading: number | null }) {
  const rotation = -useUnwrappedAngle(heading ?? 0);

  return (
    <svg viewBox="0 0 300 300" className="w-full max-w-[22rem]" role="img" aria-label={`Proa ${heading === null ? 'indisponível' : `${Math.round(heading)} graus`}`}>
      <Bezel cx={C} cy={C} radius={148} rim={11} />

      <g className="needle-transition" style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${C}px ${C}px` }} opacity={heading === null ? 0.4 : 1}>
        {DEGREES.map((deg) => {
          const major = deg % 30 === 0;
          const mid = deg % 10 === 0;
          const a = polar(C, C, CARD_OUTER, deg - 90);
          const b = polar(C, C, CARD_OUTER - (major ? 16 : mid ? 11 : 6), deg - 90);
          return <line key={deg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--ink)" strokeWidth={major ? 2.2 : 1} opacity={major || mid ? 1 : 0.5} />;
        })}
        {DEGREES.filter((deg) => deg % 30 === 0).map((deg) => {
          const cardinal = CARDINALS[deg];
          const p = polar(C, C, 92, deg - 90);
          return (
            <text
              key={deg}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              transform={`rotate(${deg} ${p.x} ${p.y})`}
              fill={cardinal === 'N' ? 'var(--needle)' : 'var(--ink)'}
              fontSize={cardinal ? 22 : 13}
              fontWeight={cardinal ? 600 : 500}
              fontFamily={cardinal ? 'var(--font-suse)' : 'var(--font-jetbrains)'}
            >
              {cardinal ?? String(deg).padStart(3, '0')}
            </text>
          );
        })}
        <circle cx={C} cy={C} r={70} fill="none" stroke="var(--line)" strokeWidth={1} />
      </g>

      {/* Linha de fé e silhueta do navio, fixas */}
      <path d={`M ${C} 14 L ${C + 8} 2 L ${C - 8} 2 Z`} fill="var(--needle)" className="glow" />
      <line x1={C} y1={22} x2={C} y2={C - 40} stroke="var(--needle)" strokeWidth={1.5} className="glow" />
      <path
        d={`M ${C} ${C - 40} C ${C + 13} ${C - 22} ${C + 16} ${C - 6} ${C + 16} ${C + 8} L ${C + 16} ${C + 34} Q ${C + 16} ${C + 40} ${C + 10} ${C + 40} L ${C - 10} ${C + 40} Q ${C - 16} ${C + 40} ${C - 16} ${C + 34} L ${C - 16} ${C + 8} C ${C - 16} ${C - 6} ${C - 13} ${C - 22} ${C} ${C - 40} Z`}
        fill="var(--surface-2)"
        stroke="var(--muted)"
        strokeWidth={1.2}
      />
      <rect x={C - 7} y={C - 2} width={14} height={20} rx={2} fill="none" stroke="var(--muted)" strokeWidth={1} />
    </svg>
  );
}
