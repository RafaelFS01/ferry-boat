import { CallOptions, Metadata, status } from '@grpc/grpc-js';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ClientGrpc } from '@nestjs/microservices';
import { Observable, Subject, defer, finalize, retry, takeUntil, tap, throwError, timer } from 'rxjs';
import { BoatEnvironment } from '../config/environment';
import { CircuitState, GrpcCircuitBreaker } from './circuit-breaker';
import { TELEMETRY_GRPC_CLIENT } from './grpc-client.constants';
import { GRPC_RETRY_RUNTIME, GrpcRetryRuntime, retryDelayMilliseconds } from './grpc-resilience';
import {
  OfflineTelemetryEvent, TELEMETRY_DELIVERY_SETTLED_EVENT, TELEMETRY_OFFLINE_EVENT,
  TelemetryDeliverySettledEvent,
} from './telemetry-delivery.events';
import { AckStatus, TELEMETRY_SERVICE_NAME, TelemetryAck, TelemetryPacket } from './telemetry';

// O proxy Nest aceita CallOptions, embora o stub gerado só declare Metadata.
interface UnaryTelemetryService {
  enviarTelemetria(
    packet: TelemetryPacket, metadata: Metadata, options: CallOptions,
  ): Observable<TelemetryAck>;
}

function grpcCode(error: unknown): status {
  if (typeof error === 'object' && error !== null && 'code' in error &&
    typeof error.code === 'number') return error.code;
  return status.UNKNOWN;
}

function transient(code: status): code is status.UNAVAILABLE | status.DEADLINE_EXCEEDED {
  return code === status.UNAVAILABLE || code === status.DEADLINE_EXCEEDED;
}

@Injectable()
export class TelemetryGrpcClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryGrpcClient.name);
  private readonly shutdown = new Subject<void>();
  private readonly circuitBreaker: GrpcCircuitBreaker;
  private destroyed = false;
  private service!: UnaryTelemetryService;

  constructor(
    @Inject(TELEMETRY_GRPC_CLIENT) private readonly client: ClientGrpc,
    private readonly config: ConfigService<BoatEnvironment, true>,
    private readonly emitter: EventEmitter2,
    @Inject(GRPC_RETRY_RUNTIME) private readonly runtime: GrpcRetryRuntime,
  ) {
    const failureThreshold = this.config.get('GRPC_CIRCUIT_BREAKER_FAILURE_THRESHOLD', { infer: true });
    const cooldownMs = this.config.get('GRPC_CIRCUIT_BREAKER_COOLDOWN_MS', { infer: true });
    this.circuitBreaker = new GrpcCircuitBreaker({
      failureThreshold,
      cooldownMs,
      monotonicMilliseconds: () => this.runtime.monotonicMilliseconds(),
      onTransition: (from, to) => {
        const payload = JSON.stringify({
          event: 'grpc.circuit_breaker.transition',
          from,
          to,
          ...(to === 'OPEN' ? { cooldown_ms: cooldownMs } : {}),
        });
        if (to === 'OPEN') this.logger.warn(payload);
        else this.logger.log(payload);
      },
    });
  }

  onModuleInit(): void {
    this.service = this.client.getService<UnaryTelemetryService>(TELEMETRY_SERVICE_NAME);
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    this.shutdown.next();
    this.shutdown.complete();
  }

  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  getCircuitRetryAfterMs(): number {
    return this.circuitBreaker.getRemainingCooldownMs();
  }

  enviarTelemetria(packet: TelemetryPacket, metadata?: Metadata): Observable<TelemetryAck> {
    return defer(() => {
      if (this.destroyed) {
        return throwError(() => Object.assign(new Error('Cliente gRPC encerrado.'), {
          code: status.CANCELLED,
        }));
      }
      const snapshot = structuredClone(packet);
      const acquisition = this.circuitBreaker.tryAcquire();
      if (!acquisition.allowed) {
        const error = Object.assign(
          new Error(`Circuito gRPC ${acquisition.state}; envio desviado para o buffer local.`),
          { code: status.UNAVAILABLE, circuit_state: acquisition.state },
        );
        this.publish(TELEMETRY_OFFLINE_EVENT, {
          packet: structuredClone(snapshot),
          grpc_code: status.UNAVAILABLE,
          attempt: 0,
        });
        this.publish(TELEMETRY_DELIVERY_SETTLED_EVENT, {
          packet: structuredClone(snapshot),
          attempts: 0,
          outcome: 'failed',
          grpc_code: status.UNAVAILABLE,
        });
        return throwError(() => error);
      }

      const headers = metadata?.clone() ?? new Metadata();
      if (!headers.get('x-correlation-id').length) headers.set('x-correlation-id', snapshot.message_id);
      let attempts = 0;
      let offline = false;
      let probeSettled = false;
      let lastPacket = snapshot;
      let outcome: TelemetryDeliverySettledEvent['outcome'] = 'cancelled';
      let code = status.CANCELLED;
      let receivedAck: TelemetryAck | undefined;

      const send = defer(() => {
        if (attempts > 0 && !acquisition.isProbe && this.circuitBreaker.getState() === 'OPEN') {
          return throwError(() => Object.assign(
            new Error('Circuito gRPC OPEN; retries interrompidos.'),
            { code: status.UNAVAILABLE, circuit_state: 'OPEN' as CircuitState },
          ));
        }

        attempts += 1;
        lastPacket = structuredClone(snapshot);

        if (lastPacket.rede) {
          lastPacket.rede.tentativa_envio = Math.min(2147483647,
            Math.max(1, snapshot.rede?.tentativa_envio ?? 1) + attempts - 1);
        }

        return this.service.enviarTelemetria(lastPacket, headers.clone(), {
          deadline: new Date(this.runtime.epochMilliseconds() +
            this.config.get('GRPC_DEADLINE_MS', { infer: true })),
        });
      });

      const maxRetries = acquisition.isProbe
        ? 0
        : this.config.get('GRPC_RETRY_MAX_ATTEMPTS', { infer: true }) - 1;

      return send.pipe(
        tap({
          error: (error: unknown) => {
            code = grpcCode(error);
            if (transient(code)) {
              if (!offline) {
                offline = true;
                const event: OfflineTelemetryEvent = {
                  packet: structuredClone(lastPacket), grpc_code: code, attempt: attempts,
                };
                this.publish(TELEMETRY_OFFLINE_EVENT, event);
              }

              if (acquisition.isProbe) {
                probeSettled = true;
                this.circuitBreaker.recordTransientFailure();
              } else if (attempts > 0 && !(typeof error === 'object' && error !== null && 'circuit_state' in error)) {
                this.circuitBreaker.recordTransientFailure();
              }
            } else if (acquisition.isProbe) {
              probeSettled = true;
              this.circuitBreaker.recordProbeFailure();
            }
          }
        }),
        retry({
          count: maxRetries,
          delay: (error: unknown) => {
            if (!transient(grpcCode(error))) return throwError(() => error);

            if (this.circuitBreaker.getState() === 'OPEN') {
              return throwError(() => error);
            }

            const delayMs = retryDelayMilliseconds(attempts, this.runtime.random());
            this.logger.warn(JSON.stringify({
              event: 'telemetry.retry', message_id: snapshot.message_id,
              attempt: attempts, grpc_code: code, retry_in_ms: delayMs,
            }));
            return timer(delayMs, this.runtime.scheduler);
          },
        }),
        tap({
          next: (ack) => {
            if (ack.message_id !== snapshot.message_id) {
              outcome = 'failed';
              code = status.DATA_LOSS;
              if (acquisition.isProbe) {
                probeSettled = true;
                this.circuitBreaker.recordProbeFailure();
              }
              throw Object.assign(new Error('ACK não corresponde ao message_id enviado.'), { code });
            }
            receivedAck = structuredClone(ack);
            code = status.OK;
            const validAck = ack.sucesso &&
              (ack.status === AckStatus.ACK_STATUS_ACEITO ||
                ack.status === AckStatus.ACK_STATUS_DUPLICADO_IGNORADO);
            outcome = validAck ? 'acknowledged' : 'rejected';
            if (validAck) {
              if (acquisition.isProbe) probeSettled = true;
              this.circuitBreaker.recordSuccess();
            } else if (acquisition.isProbe) {
              probeSettled = true;
              this.circuitBreaker.recordProbeFailure();
            }
          },
          error: (error: unknown) => { outcome = 'failed'; code = grpcCode(error); },
        }),
        takeUntil(this.shutdown),
        finalize(() => {
          if (acquisition.isProbe && !probeSettled) {
            this.circuitBreaker.cancelProbe();
          }
          const event: TelemetryDeliverySettledEvent = {
            packet: structuredClone(lastPacket), attempts, outcome,
            grpc_code: outcome === 'cancelled' ? status.CANCELLED : code,
            ...(receivedAck ? { ack: receivedAck } : {}),
          };
          this.publish(TELEMETRY_DELIVERY_SETTLED_EVENT, event);
        }),
      );
    });
  }

  private publish(
    name: string, event: OfflineTelemetryEvent | TelemetryDeliverySettledEvent,
  ): void {
    try {
      this.emitter.emit(name, event);
    } catch (error) {
      this.logger.error(`Falha no consumidor de ${name}; o evento não garante persistência.`, error);
    }
  }
}
