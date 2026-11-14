import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitterReadinessWatcher, OnEvent } from '@nestjs/event-emitter';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import type { BoatEnvironment } from '../config/environment';
import { TelemetryGrpcClient } from '../grpc/telemetry-grpc.client';
import { AckStatus, TelemetryPacket } from '../grpc/telemetry';
import {
  OfflineTelemetryEvent, TELEMETRY_DELIVERY_SETTLED_EVENT, TELEMETRY_OFFLINE_EVENT,
  TelemetryDeliverySettledEvent,
} from '../grpc/telemetry-delivery.events';
import { TELEMETRY_GENERATED_EVENT } from '../simulator/telemetry-generated.event';
import type { BufferRow, BufferState, BufferStatus } from './buffer.types';
import { SqliteBufferStore } from './sqlite-buffer.store';
import { BUFFER_RUNTIME, BufferRuntime, bufferRuntime } from './buffer-runtime';

@Injectable()
export class FifoBufferService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(FifoBufferService.name);
  private readonly stop = new Subject<void>();
  private readonly external = new Set<string>();
  private rows: BufferRow[] = [];
  private count = 0;
  private latest: TelemetryPacket | null = null;
  private state: BufferState = 'idle';
  private active: string | null = null;
  private lastError: BufferStatus['last_error'] = null;
  private lastAckAt: string | null = null;
  private nextEligible = 0;
  private nextRetryAt: string | null = null;
  private serial: Promise<unknown> = Promise.resolve();
  private timer: unknown;
  private drainTask: Promise<void> | undefined;
  private closing: Promise<void> | undefined;
  private ready = false;
  private started = false;
  private stopped = false;

  constructor(
    private readonly config: ConfigService<BoatEnvironment, true>,
    private readonly store: SqliteBufferStore,
    private readonly client: TelemetryGrpcClient,
    private readonly readiness: EventEmitterReadinessWatcher,
    @Inject(BUFFER_RUNTIME) private readonly runtime: BufferRuntime = bufferRuntime,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.enabled) { this.state = 'disabled'; return; }
    const snapshot = await this.store.open();
    this.rows = snapshot.rows;
    this.count = snapshot.count;
    this.latest = snapshot.latest;
    this.ready = true;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) return;
    await this.readiness.waitUntilReady();
    if (this.stopped) return;
    this.started = true;
    this.kick();
  }

  onModuleDestroy(): Promise<void> {
    if (this.closing) return this.closing;
    this.stopped = true;
    if (this.timer !== undefined) this.runtime.cancel(this.timer);
    this.timer = undefined;
    this.stop.next();
    this.stop.complete();
    this.closing = (async () => {
      await this.drainTask?.catch(() => {});
      await this.serial;
      await this.store.close();
    })();
    return this.closing;
  }

  @OnEvent(TELEMETRY_GENERATED_EVENT)
  onGenerated(packet: TelemetryPacket): void {
    if (!this.enabled || this.stopped) return;
    void this.enqueue(packet).catch((error: unknown) => this.storageError(error));
  }

  @OnEvent(TELEMETRY_OFFLINE_EVENT)
  onOffline(event: OfflineTelemetryEvent): void {
    if (!this.enabled || this.stopped) return;
    if (this.state !== 'storage_error' && this.state !== 'blocked') {
      this.state = 'offline';
      this.lastError = { kind: 'grpc', code: event.grpc_code, message: 'Central indisponível.' };
    }
    if (this.active === event.packet.message_id) return;
    // Chamadas externas conservam a posse dos retries até delivery-settled.
    this.external.add(event.packet.message_id);
    void this.enqueue(event.packet, false).catch((error: unknown) => this.storageError(error));
  }

  @OnEvent(TELEMETRY_DELIVERY_SETTLED_EVENT)
  onSettled(event: TelemetryDeliverySettledEvent): void {
    if (!this.enabled || this.stopped || this.state === 'storage_error' || this.active === event.packet.message_id ||
      !this.external.has(event.packet.message_id)) return;
    void this.exclusive(async () => {
      this.external.delete(event.packet.message_id);
      if (event.outcome === 'acknowledged' && event.ack?.sucesso &&
        event.ack.message_id === event.packet.message_id) {
        const wasHead = this.rows[0]?.packet.message_id === event.packet.message_id;
        await this.remove(event.packet.message_id);
        this.lastAckAt = this.runtime.epochMilliseconds().toString();
        if (this.active === null && (wasHead || this.count === 0)) {
          this.state = 'idle';
          this.lastError = null;
        }
      } else if (event.outcome === 'rejected' || (event.outcome === 'failed' &&
        event.grpc_code !== 4 && event.grpc_code !== 14)) {
        this.state = 'blocked';
        this.lastError = { kind: 'rejected', code: event.grpc_code, message: 'Pacote não confirmado pela Central.' };
      }
    }).then(() => this.kick()).catch((error: unknown) => this.storageError(error));
  }

  async enqueue(packet: TelemetryPacket, rememberLatest = true): Promise<void> {
    if (!this.enabled || !this.ready || this.stopped) throw new Error('Buffer não está disponível.');
    if (!packet.message_id || !/^\d+$/.test(packet.timestamp_coleta)) {
      throw new Error('Pacote exige message_id e timestamp_coleta válidos.');
    }
    const snapshot = structuredClone(packet);
    await this.exclusive(async () => {
      const result = await this.store.append(snapshot, rememberLatest).catch((error: unknown) => {
        this.storageError(error);
        throw error;
      });
      this.count = result.count;
      this.latest = result.latest;
      if (result.row && this.rows.length < this.limit) this.rows.push(result.row);
    });
    this.kick();
  }

  getStatus(): BufferStatus {
    return {
      enabled: this.enabled, state: this.state, pending_count: this.count,
      memory_count: this.rows.length, disk_count: this.count - this.rows.length,
      memory_limit: this.limit, in_flight: this.active,
      oldest_timestamp: this.rows[0]?.packet.timestamp_coleta ?? null,
      next_retry_at: this.nextRetryAt, last_ack_at: this.lastAckAt,
      last_error: this.lastError ? { ...this.lastError } : null,
    };
  }

  getLatest(): TelemetryPacket | null { return structuredClone(this.latest); }

  private get enabled(): boolean { return this.config.get('BUFFER_ENABLED', { infer: true }); }
  private get limit(): number { return this.config.get('BUFFER_MAX_ITEMS', { infer: true }); }

  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    const result = this.serial.then(action);
    this.serial = result.catch(() => {});
    return result;
  }

  private kick(): void {
    if (!this.started || this.stopped || this.timer !== undefined || this.drainTask || !this.count ||
      this.state === 'blocked' || this.state === 'storage_error' ||
      this.external.has(this.rows[0]?.packet.message_id ?? '')) return;
    this.timer = this.runtime.schedule(() => {
      this.timer = undefined;
      if (this.runtime.monotonicMilliseconds() < this.nextEligible) { this.kick(); return; }
      const task = this.drainOne();
      this.drainTask = task;
      void task.catch((error: unknown) => this.storageError(error)).finally(() => {
        this.drainTask = undefined;
        this.kick();
      });
    }, Math.ceil(Math.max(0, this.nextEligible - this.runtime.monotonicMilliseconds())));
  }

  private async drainOne(): Promise<void> {
    const row = await this.exclusive(async () => {
      const head = this.rows[0];
      if (this.stopped || !head || this.external.has(head.packet.message_id)) return null;
      this.active = head.packet.message_id;
      this.nextRetryAt = null;
      this.state = 'draining';
      const sending = structuredClone(head);
      if (sending.packet.rede) sending.packet.rede.tamanho_buffer_local = this.count;
      return sending;
    });
    if (!row) return;
    let delivered = false;
    try {
      const ack = await firstValueFrom(this.client.enviarTelemetria(row.packet).pipe(takeUntil(this.stop)));
      if (this.stopped) return;
      if (this.state === 'storage_error') throw new Error('Armazenamento indisponível; ACK será reconciliado após recuperação.');
      if (ack.message_id !== row.packet.message_id || !ack.sucesso ||
        (ack.status !== AckStatus.ACK_STATUS_ACEITO && ack.status !== AckStatus.ACK_STATUS_DUPLICADO_IGNORADO)) {
        this.state = 'blocked';
        this.lastError = { kind: 'rejected', message: 'ACK não confirma a entrega do primeiro pacote.' };
        return;
      }
      await this.exclusive(async () => {
        await this.remove(row.packet.message_id);
        this.lastAckAt = this.runtime.epochMilliseconds().toString();
        this.lastError = null;
        this.state = 'idle';
      });
      delivered = true;
      this.logger.log(JSON.stringify({ event: 'buffer.delivered', message_id: row.packet.message_id,
        pending_count: this.count }));
    } catch (error) {
      if (this.stopped) return;
      if (this.state === 'storage_error') throw error;
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? Number(error.code) : 2;
      this.state = code === 4 || code === 14 ? 'offline' : 'blocked';
      this.lastError = { kind: 'grpc', code, message: 'Entrega não confirmada; pacote preservado.' };
    } finally {
      this.active = null;
      const delay = this.config.get(delivered ? 'BUFFER_DRAIN_INTERVAL_MS' : 'BUFFER_RETRY_INTERVAL_MS', { infer: true });
      this.nextEligible = this.runtime.monotonicMilliseconds() + delay;
      this.nextRetryAt = !delivered && this.state === 'offline' ? (this.runtime.epochMilliseconds() + delay).toString() : null;
    }
  }

  private async remove(messageId: string): Promise<void> {
    try {
      this.count = await this.store.remove(messageId);
      this.rows = this.rows.filter((row) => row.packet.message_id !== messageId);
      const missing = Math.min(this.count, this.limit) - this.rows.length;
      if (missing > 0) {
        this.rows.push(...await this.store.read(this.rows.at(-1)?.ordinal ?? 0, missing));
      }
    } catch (error) { this.storageError(error); throw error; }
  }

  private storageError(error: unknown): void {
    this.state = 'storage_error';
    this.nextRetryAt = null;
    this.lastError = { kind: 'storage', message: 'Falha no armazenamento persistente do buffer.' };
    this.logger.error(error instanceof Error ? error.message : 'Falha no armazenamento persistente.');
  }
}
