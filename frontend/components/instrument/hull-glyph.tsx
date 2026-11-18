interface HullGlyphProps {
  className?: string;
  /** Rotação em graus; 0 = proa para cima */
  rotate?: number;
}

/** Silhueta do ferry vista de cima (proa fina, popa larga), usada na giro e na faixa da travessia. */
export function HullGlyph({ className, rotate = 0 }: HullGlyphProps) {
  return (
    <svg viewBox="0 0 24 48" className={className} style={{ transform: `rotate(${rotate}deg)` }} aria-hidden>
      <path
        d="M12 1 C17.5 9 20 16 20 24 L20 44 Q20 47 17 47 L7 47 Q4 47 4 44 L4 24 C4 16 6.5 9 12 1 Z"
        fill="currentColor"
      />
      <rect x={8} y={22} width={8} height={14} rx={1.5} fill="var(--surface)" opacity={0.55} />
    </svg>
  );
}
