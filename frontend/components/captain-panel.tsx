'use client';

import { useEdgeTelemetry } from '@/hooks/use-edge-telemetry';
import { useNow } from '@/hooks/use-now';
import { formatNumber } from '@/lib/format';
import { batteryLevel, ENGINE_TEMP_RANGE, RPM_RANGE, SPEED_RANGE, zoneOf } from '@/lib/instruments';
import { deriveLinkStatus } from '@/lib/link-status';
import { ArcGauge } from './arc-gauge';
import { BufferCard } from './buffer-card';
import { CompassRose } from './compass-rose';
import { LinkStatusCard } from './link-status-card';
import { Panel } from './panel';
import { PanelHeader } from './panel-header';
import { ReadoutTile } from './readout-tile';

export function CaptainPanel() {
  const { packet, buffer, apiReachable, loading } = useEdgeTelemetry();
  const now = useNow();

  const nav = packet?.navegacao;
  const engine = packet?.propulsao;
  const temperature = engine?.temperatura_motor_celsius ?? null;
  const volts = engine?.tensao_bateria_volts ?? null;
  const battery = volts === null ? null : batteryLevel(volts);
  const temperatureZone = temperature === null ? 'normal' : zoneOf(temperature, ENGINE_TEMP_RANGE);

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-4 p-4 sm:p-6">
      <PanelHeader packet={packet} now={now} />
      <LinkStatusCard status={deriveLinkStatus({ loading, apiReachable, buffer })} buffer={buffer} now={now} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Velocidade">
          <ArcGauge value={nav?.velocidade_nos ?? null} range={SPEED_RANGE} unit="nós" decimals={1} />
        </Panel>
        <Panel title="Proa">
          <CompassRose heading={nav?.rumo_graus ?? null} />
        </Panel>
        <Panel title="Rotação do motor">
          <ArcGauge value={engine?.rpm_motor ?? null} range={RPM_RANGE} unit="rpm" />
        </Panel>

        <Panel title="Máquinas" className="md:col-span-2 xl:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <ReadoutTile
              label="Temperatura do motor"
              value={temperature === null ? '—' : formatNumber(temperature, 1)}
              unit="°C"
              zone={temperatureZone}
              level={temperature === null ? 0 : ((temperature - ENGINE_TEMP_RANGE.min) / (ENGINE_TEMP_RANGE.max - ENGINE_TEMP_RANGE.min)) * 100}
              caption={temperatureZone === 'danger' ? 'Acima do limite de 90 °C' : temperatureZone === 'warn' ? 'Aproximando do limite' : 'Faixa normal'}
            />
            <ReadoutTile
              label="Bateria"
              value={volts === null ? '—' : formatNumber(volts, 1)}
              unit="V"
              zone={battery?.zone}
              level={battery?.percent}
              caption={battery ? `Carga estimada ${battery.percent}%` : 'Sem leitura de tensão'}
            />
          </div>
        </Panel>

        <BufferCard buffer={buffer} now={now} />
      </div>
    </main>
  );
}
