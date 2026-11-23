'use client';

import { useSimulatorCommand } from '@/hooks/use-simulator-command';
import { Module } from './module';
import { SpeedCommand } from './speed-command';

/** Comando do simulador: o operador ajusta a velocidade e vê os instrumentos reagirem. */
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
        <div className="flex flex-1 flex-col justify-center">
          <SpeedCommand target={command.velocidade_alvo_nos} onChange={(velocidade_alvo_nos) => update({ velocidade_alvo_nos })} />
        </div>
      )}
    </Module>
  );
}
