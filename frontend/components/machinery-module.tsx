import type { PropulsionData } from '@/lib/edge-api';
import { formatNumber } from '@/lib/format';
import { BATTERY_RANGE, batteryLevel, batteryZone, ENGINE_TEMP_RANGE, fuelZone, OIL_RANGE, oilZone, zoneOf } from '@/lib/instruments';
import { BarMeter } from './instrument/bar-meter';
import { Module } from './module';

/** Praça de máquinas: temperatura, óleo, combustível e bateria em bargraphs, com o consumo no rótulo. */
export function MachineryModule({ engine }: { engine: PropulsionData | undefined }) {
  const rpm = engine?.rpm_motor ?? 0;
  const volts = engine?.tensao_bateria_volts ?? null;

  return (
    <Module
      label="Praça de máquinas"
      aside={
        <span className="font-mono text-sm">
          <span className="text-muted">consumo </span>
          <span className="font-medium">{engine ? `${formatNumber(engine.consumo_instantaneo_lph, 0)} L/h` : '—'}</span>
        </span>
      }
    >
      <div className="grid flex-1 content-center gap-x-10 gap-y-7 sm:grid-cols-2">
        <BarMeter
          label="Temperatura do motor"
          value={engine?.temperatura_motor_celsius ?? null}
          min={ENGINE_TEMP_RANGE.min}
          max={ENGINE_TEMP_RANGE.max}
          unit="°C"
          decimals={1}
          zoneAt={(v) => zoneOf(v, ENGINE_TEMP_RANGE)}
          note={`limite ${ENGINE_TEMP_RANGE.dangerAt} °C`}
        />
        <BarMeter
          label="Pressão do óleo"
          value={engine?.pressao_oleo_bar ?? null}
          min={OIL_RANGE.min}
          max={OIL_RANGE.max}
          unit="bar"
          decimals={1}
          zoneAt={(v) => oilZone(v, rpm || 1)}
          note={rpm === 0 ? 'motor parado' : undefined}
        />
        <BarMeter
          label="Combustível"
          value={engine?.nivel_combustivel_percentual ?? null}
          min={0}
          max={100}
          unit="%"
          zoneAt={fuelZone}
        />
        <BarMeter
          label="Bateria 24 V"
          value={volts}
          min={BATTERY_RANGE.min}
          max={BATTERY_RANGE.max}
          unit="V"
          decimals={1}
          zoneAt={batteryZone}
          note={volts === null ? undefined : `carga ${batteryLevel(volts).percent}%`}
        />
      </div>
    </Module>
  );
}
