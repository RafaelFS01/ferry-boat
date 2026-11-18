import { useId } from 'react';

interface BezelProps {
  cx: number;
  cy: number;
  /** Raio externo do aro metálico */
  radius: number;
  /** Largura do aro entre a borda e a face do mostrador */
  rim?: number;
}

/** Aro usinado e face do mostrador, compartilhados por todos os instrumentos redondos. */
export function Bezel({ cx, cy, radius, rim = 9 }: BezelProps) {
  const id = useId();
  const ring = `${id}-ring`;
  const face = `${id}-face`;

  return (
    <>
      <defs>
        <linearGradient id={ring} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="var(--bezel-a)" />
          <stop offset="1" stopColor="var(--bezel-b)" />
        </linearGradient>
        <radialGradient id={face} cx="0.5" cy="0.42" r="0.62">
          <stop offset="0.55" stopColor="var(--face)" />
          <stop offset="1" stopColor="var(--face-edge)" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={radius} fill={`url(#${ring})`} />
      <circle cx={cx} cy={cy} r={radius - rim} fill={`url(#${face})`} stroke="var(--line)" strokeWidth={1} />
    </>
  );
}
