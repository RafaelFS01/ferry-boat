// Faixas operacionais dos instrumentos, calibradas pelo simulador náutico
// (src/simulator/nautical-simulation.ts): cruzeiro 10–14 nós, 750–1850 RPM,
// motor 78–92 °C e sistema elétrico de 24 V (24–27 V).

export type Zone = 'normal' | 'warn' | 'danger';

export interface InstrumentRange {
  min: number;
  max: number;
  /** Limite a partir do qual o valor entra em atenção */
  warnAt: number;
  /** Limite a partir do qual o valor é crítico */
  dangerAt: number;
}

export const SPEED_RANGE: InstrumentRange = { min: 0, max: 16, warnAt: 14.5, dangerAt: 15.5 };
export const RPM_RANGE: InstrumentRange = { min: 0, max: 2200, warnAt: 1900, dangerAt: 2050 };
export const ENGINE_TEMP_RANGE: InstrumentRange = { min: 60, max: 100, warnAt: 88, dangerAt: 90 };

export function zoneOf(value: number, range: InstrumentRange): Zone {
  if (value >= range.dangerAt) return 'danger';
  if (value >= range.warnAt) return 'warn';
  return 'normal';
}

// Bateria de 24 V: abaixo de 23,5 V em repouso indica carga baixa; acima de 28,8 V, sobrecarga.
const BATTERY_EMPTY_V = 23;
const BATTERY_FULL_V = 27;

export function batteryLevel(volts: number): { percent: number; zone: Zone } {
  const percent = Math.round(Math.min(100, Math.max(0, (volts - BATTERY_EMPTY_V) / (BATTERY_FULL_V - BATTERY_EMPTY_V) * 100)));
  const zone: Zone = volts < 23.5 || volts > 28.8 ? 'danger' : volts < 24.2 ? 'warn' : 'normal';
  return { percent, zone };
}

// Pressão de óleo do simulador: 1,5 bar em marcha lenta a 4,5 bar em carga máxima.
export const OIL_RANGE = { min: 0, max: 6 } as const;

export function oilZone(bar: number, rpm: number): Zone {
  if (rpm === 0) return 'normal';
  if (bar < 1 || bar > 5.5) return 'danger';
  if (bar < 1.3 || bar > 5) return 'warn';
  return 'normal';
}

/** Mesmo limite de combustível baixo do dashboard da Central (15%). */
export function fuelZone(percent: number): Zone {
  if (percent < 15) return 'danger';
  if (percent < 25) return 'warn';
  return 'normal';
}

export const BATTERY_RANGE = { min: 22, max: 30 } as const;

export function batteryZone(volts: number): Zone {
  return batteryLevel(volts).zone;
}

const CARDINALS =['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'] as const;

export function cardinalOf(heading: number): string {
  const index = Math.round((((heading % 360) + 360) % 360) / 45) % 8;
  return CARDINALS[index] ?? 'N';
}
