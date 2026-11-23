'use client';

import { useEdgeTelemetry } from '@/hooks/use-edge-telemetry';
import { useNow } from '@/hooks/use-now';
import { cardinalOf, RPM_RANGE, SPEED_RANGE } from '@/lib/instruments';
import { deriveLinkStatus } from '@/lib/link-status';
import { CommandModule } from './command-module';
import { ConsoleHeader } from './console-header';
import { Dial } from './instrument/dial';
import { GyroRepeater } from './instrument/gyro-repeater';
import { LinkModule } from './link-module';
import { MachineryModule } from './machinery-module';
import { Module } from './module';
import { PassageStrip } from './passage-strip';

export function CaptainPanel() {
  const { packet, buffer, apiReachable, loading } = useEdgeTelemetry();
  const now = useNow();
  const nav = packet?.navegacao;
  const heading = nav?.rumo_graus ?? null;

  return (
    <main className="mx-auto flex max-w-[1480px] flex-col gap-4 p-4 sm:gap-5 sm:p-6 lg:p-8">
      <ConsoleHeader packet={packet} now={now} />

      {/* Tablet em retrato: a giro ocupa a primeira linha inteira; na horizontal, fica no centro */}
      <div className="grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-[1fr_1.2fr_1fr]">
        <Module label="Velocidade sobre o fundo">
          <div className="grid flex-1 place-items-center">
            <Dial label="SOG" value={nav?.velocidade_nos ?? null} range={SPEED_RANGE} unit="nós" decimals={1} majorStep={2} minorStep={0.5} />
          </div>
        </Module>

        <Module
          label="Proa · giro"
          className="md:order-first md:col-span-2 lg:order-none lg:col-span-1"
          aside={
            <span className="font-mono text-sm font-medium">
              {heading === null ? '—' : `${String(Math.round(heading) % 360).padStart(3, '0')}° ${cardinalOf(heading)}`}
            </span>
          }
        >
          <div className="grid flex-1 place-items-center">
            <GyroRepeater heading={heading} />
          </div>
        </Module>

        <Module label="Rotação do motor">
          <div className="grid flex-1 place-items-center">
            <Dial
              label="RPM"
              value={packet?.propulsao?.rpm_motor ?? null}
              range={RPM_RANGE}
              unit="rpm"
              majorStep={200}
              minorStep={50}
              scaleDivisor={100}
              scaleNote="× 100"
            />
          </div>
        </Module>
      </div>

      <PassageStrip nav={nav} now={now} />

      <CommandModule />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.7fr_1fr]">
        <MachineryModule engine={packet?.propulsao} />
        <LinkModule status={deriveLinkStatus({ loading, apiReachable, buffer })} buffer={buffer} now={now} />
      </div>
    </main>
  );
}
