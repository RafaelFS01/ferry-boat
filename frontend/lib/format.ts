const decimalFormats = new Map<number, Intl.NumberFormat>();

export function formatNumber(value: number, decimals = 0): string {
  let format = decimalFormats.get(decimals);
  if (!format) {
    format = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    decimalFormats.set(decimals, format);
  }
  return format.format(value);
}

/** "agora", "há 12 s", "há 3 min", "há 2 h" */
export function formatAge(fromEpochMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - fromEpochMs) / 1000));
  if (seconds < 3) return 'agora';
  if (seconds < 60) return `há ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  return `há ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** Posição em graus e minutos náuticos: 12°58,30′S · 038°33,51′W */
export function formatCoordinate(value: number, axis: 'lat' | 'lon'): string {
  const hemisphere = axis === 'lat' ? (value < 0 ? 'S' : 'N') : value < 0 ? 'W' : 'E';
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutes = formatNumber((absolute - degrees) * 60, 2).padStart(5, '0');
  return `${String(degrees).padStart(axis === 'lat' ? 2 : 3, '0')}°${minutes}′${hemisphere}`;
}

export function formatClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
