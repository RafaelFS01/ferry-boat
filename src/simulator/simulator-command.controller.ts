import { BadRequestException, Body, Controller, Get, Header, Put } from '@nestjs/common';
import { GpsSimulatorService } from './gps-simulator.service';
import { commandError, SimulatorCommand } from './simulator-command';

const FIELDS = ['velocidade_alvo_nos', 'passageiros'] as const;

/** Comando manual do simulador, usado pelo Painel do Capitão (via /api/edge/simulator/command). */
@Controller('simulator/command')
export class SimulatorCommandController {
  constructor(private readonly simulator: GpsSimulatorService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getCommand(): SimulatorCommand { return this.simulator.getCommand(); }

  @Put()
  @Header('Cache-Control', 'no-store')
  updateCommand(@Body() body: unknown): SimulatorCommand {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new BadRequestException('Envie um objeto JSON com velocidade_alvo_nos e/ou passageiros.');
    }
    const update = Object.fromEntries(FIELDS.filter((field) => field in body)
      .map((field) => [field, (body as Record<string, unknown>)[field]])) as Partial<SimulatorCommand>;
    const error = commandError({ ...this.simulator.getCommand(), ...update });
    if (error) throw new BadRequestException(error);
    return this.simulator.updateCommand(update);
  }
}
