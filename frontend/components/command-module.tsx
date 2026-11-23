'use client';

import { useSimulatorCommand } from '@/hooks/use-simulator-command';
import { Module } from './module';
import { PassengerCommand } from './passenger-command';
import { SpeedCommand } from './speed-command';

/** Comando do simulador: o operador ajusta velocidade e lotação e vê os instrumentos reagirem. */
export function CommandModule() {
  const { command, failed, update } = useSimulatorCommand();

  return (
    <Module
      label="Comando do simulador"
      aside={failed && <span className="font-mono text-xs text-danger">comando não aplicado</span>}
    >
      {command === null ? (
        <p className="font-mono text-sm text-muted">Aguardando o nó embarcado…</p>
      ) : (
        <div className="grid flex-1 content-center gap-x-10 gap-y-7 md:grid-cols-2">
          <SpeedCommand target={command.velocidade_alvo_nos} onChange={(velocidade_alvo_nos) => update({ velocidade_alvo_nos })} />
          <PassengerCommand passengers={command.passageiros} onChange={(passageiros) => update({ passageiros })} />
        </div>
      )}
    </Module>
  );
}
