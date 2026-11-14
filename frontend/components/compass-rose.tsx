'use client';

import { useRef } from 'react';
import { formatNumber } from '@/lib/format';
import { cardinalOf } from '@/lib/instruments';

/** Acumula a rotação pelo menor caminho, evitando a volta completa ao cruzar 0°/360°. */
function useUnwrappedAngle(angle: number): number {
  const previous = useRef(angle);
  const delta = ((angle - previous.current) % 360 + 540) % 360 - 180;
  previous.current += delta;
  return previous.current;
}

interface CompassRoseProps {
  heading: number | null;
}

const CARDINAL_LABELS: Record<number, string> = { 0: 'N', 90: 'L', 180: 'S', 270: 'O' };

/**
 * Rosa dos ventos de cartão giratório: a linha de fé fica fixa no topo
 * e o cartão gira em sentido contrário ao rumo, como numa agulha magnética.
 */
export function CompassRose({ heading }: CompassRoseProps) {
  const rotation = -useUnwrappedAngle(heading ?? 0);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 200" className="w-full max-w-64" role="img" aria-label={`Proa ${heading === null ? 'indisponível' : `${Math.round(heading)} graus`}`}>
        <circle cx={100} cy={100} r={92} fill="var(--surface-2)" stroke="var(--line)" strokeWidth={2} />
        <g className="needle-transition" style={{ transform: `rotate(${rotation}deg)`, transformOrigin: '100px 100px' }}>
          {Array.from({ length: 36 }, (_, i) => {
            const angle = i * 10;
            const major = angle % 30 === 0;
            return (
              <line
                key={angle}
                x1={100}
                y1={10}
                x2={100}
                y2={major ? 24 : 17}
                stroke={major ? 'var(--ink)' : 'var(--muted)'}
                strokeWidth={major ? 2 : 1}
                transform={`rotate(${angle} 100 100)`}
              />
            );
          })}
          {Array.from({ length: 12 }, (_, i) => {
            const angle = i * 30;
            const cardinal = CARDINAL_LABELS[angle];
            return (
              <text
                key={angle}
                x={100}
                y={40}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${angle} 100 100)`}
                fill={cardinal === 'N' ? 'var(--danger)' : cardinal ? 'var(--ink)' : 'var(--muted)'}
                fontSize={cardinal ? 16 : 10}
                fontWeight={cardinal ? 700 : 500}
              >
                {cardinal ?? angle}
              </text>
            );
          })}
        </g>
        {/* Linha de fé (proa) fixa */}
        <path d="M100 4 L108 18 L92 18 Z" fill="var(--accent)" />
        <line x1={100} y1={56} x2={100} y2={144} stroke="var(--accent)" strokeWidth={2} strokeDasharray="4 4" opacity={0.5} />
        <path d="M100 74 L112 120 L100 112 L88 120 Z" fill="var(--accent)" opacity={heading === null ? 0.3 : 1} />
      </svg>
      <div className="-mt-1 flex items-baseline gap-2">
        <span className="font-display text-5xl font-semibold leading-none">
          {heading === null ? '—' : `${formatNumber(Math.round(heading) % 360).padStart(3, '0')}°`}
        </span>
        <span className="text-lg font-semibold text-muted">{heading === null ? '' : cardinalOf(heading)}</span>
      </div>
    </div>
  );
}
