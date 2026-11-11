import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, EventEmitterReadinessWatcher } from '@nestjs/event-emitter';
import { BoatEnvironment } from '../config/environment';
import { LinkType } from '../grpc/telemetry';
import { NauticalSimulation } from './nautical-simulation';
import {
  SIMULATOR_CLOCK, SIMULATOR_RANDOM, SIMULATOR_SCHEDULER,
  SimulatorClock, SimulatorScheduler, SimulatorRandom,
} from './simulator-runtime';
import { GeneratedTelemetryPacket, TELEMETRY_GENERATED_EVENT } from './telemetry-generated.event';

@Injectable()
export class GpsSimulatorService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(GpsSimulatorService.name);
  private readonly model: NauticalSimulation;
  private timer: unknown;
  private destroyed = false;
  private lastTime = 0;
  private sequence = 0n;

  constructor(
    private readonly config: ConfigService<BoatEnvironment, true>,
    private readonly emitter: EventEmitter2,
    private readonly readiness: EventEmitterReadinessWatcher,
    @Inject(SIMULATOR_CLOCK) private readonly clock: SimulatorClock,
    @Inject(SIMULATOR_SCHEDULER) private readonly scheduler: SimulatorScheduler,
    @Inject(SIMULATOR_RANDOM) random: SimulatorRandom,
  ) {
    this.model = new NauticalSimulation({
      dockTimeMs: config.get('SIMULATOR_DOCK_TIME_MS', { infer: true }),
      fuelCapacityLiters: config.get('SIMULATOR_FUEL_CAPACITY_L', { infer: true }),
    }, random);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.get('SIMULATOR_ENABLED', { infer: true })) return;
    await this.readiness.waitUntilReady();
    if (this.destroyed || this.timer !== undefined) return;
    this.lastTime = this.clock.monotonicMilliseconds();
    this.timer = this.scheduler.every(() => this.tick(),
      this.config.get('TELEMETRY_INTERVAL_MS', { infer: true }));
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    if (this.timer !== undefined) {
      this.scheduler.cancel(this.timer);
      this.timer = undefined;
    }
  }

  private tick(): void {
    if (this.destroyed) return;
    const now = this.clock.monotonicMilliseconds();
    const elapsed = Math.max(0, now - this.lastTime) / 1000;
    this.lastTime = Math.max(this.lastTime, now);
    try {
      const snapshot = this.model.advance(elapsed);
      const messageId = randomUUID();
      this.sequence += 1n;
      const packet: GeneratedTelemetryPacket = {
        packet_id: messageId,
        message_id: messageId,
        boat_id: this.config.get('BOAT_ID', { infer: true }),
        timestamp_coleta: Math.trunc(this.clock.epochMilliseconds()).toString(),
        sequence_number: this.sequence.toString(),
        passageiros: 0,
        navegacao: snapshot.navegacao,
        propulsao: snapshot.propulsao,
        rede: {
          rssi_dbm: 0, latencia_rtt_ms: 0, perda_pacotes_percentual: 0,
          tamanho_buffer_local: 0, tentativa_envio: 1,
          tipo_enlace: LinkType.LINK_TYPE_UNSPECIFIED,
        },
      };
      // Uma amostra nova por ciclo; consumidores cuidam da fila e do envio.
      this.emitter.emit(TELEMETRY_GENERATED_EVENT, packet);
      this.logger.log(JSON.stringify({
        event: TELEMETRY_GENERATED_EVENT, packet_id: packet.packet_id,
        sequence_number: packet.sequence_number, direction: snapshot.direction,
        status_navegacao: snapshot.navegacao.status_navegacao,
      }));
    } catch (error: unknown) {
      this.logger.error(error instanceof Error ? error.message : 'Falha ao gerar telemetria.');
    }
  }
}
