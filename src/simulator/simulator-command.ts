// Comando manual do simulador (velocidade alvo e lotação), ajustado pelo Painel do Capitão.

export const MAX_COMMANDED_KNOTS = 14;
export const MAX_PASSENGERS = 1000;

export interface SimulatorCommand {
  /** Velocidade de cruzeiro em nós; `null` devolve o controle ao modelo automático */
  readonly velocidade_alvo_nos: number | null;
  readonly passageiros: number;
}

export const AUTOMATIC_COMMAND: SimulatorCommand = { velocidade_alvo_nos: null, passageiros: 0 };

/** Devolve a mensagem do primeiro campo inválido, ou `null` quando o comando é válido. */
export function commandError(command: SimulatorCommand): string | null {
  const speed = command.velocidade_alvo_nos;
  if (speed !== null && (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0 || speed > MAX_COMMANDED_KNOTS)) {
    return `velocidade_alvo_nos deve ser null ou um número entre 0 e ${MAX_COMMANDED_KNOTS}.`;
  }
  const passengers = command.passageiros;
  if (typeof passengers !== 'number' || !Number.isInteger(passengers) || passengers < 0 || passengers > MAX_PASSENGERS) {
    return `passageiros deve ser um inteiro entre 0 e ${MAX_PASSENGERS}.`;
  }
  return null;
}

export function assertCommand(command: SimulatorCommand): void {
  const error = commandError(command);
  if (error) throw new RangeError(error);
}
