// Geometria polar dos mostradores. Ângulos em graus no sistema do SVG:
// 0° aponta para a direita e cresce no sentido horário (270° = topo).

// Arredonda em 0,01 unidade: o Node (SSR) e o navegador divergem na última casa de
// Math.cos/Math.sin, o que quebraria a hidratação dos atributos do SVG.
const round = (value: number) => Math.round(value * 100) / 100;

export function polar(cx: number, cy: number, radius: number, angle: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: round(cx + radius * Math.cos(rad)), y: round(cy + radius * Math.sin(rad)) };
}

export function arcPath(cx: number, cy: number, radius: number, from: number, to: number): string {
  const a = polar(cx, cy, radius, from);
  const b = polar(cx, cy, radius, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y}`;
}
