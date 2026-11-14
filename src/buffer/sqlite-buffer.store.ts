import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BoatEnvironment } from '../config/environment';
import { PROJECT_ROOT } from '../config/proto-path';
import type { TelemetryPacket } from '../grpc/telemetry';
import type { BufferAppendResult, BufferCommand, BufferReply, BufferRow, BufferSnapshot } from './buffer.types';

@Injectable()
export class SqliteBufferStore {
  private worker: Worker | undefined;
  private sequence = 0;
  private failure: Error | undefined;
  private closing = false;
  private readonly requests = new Map<number, {
    resolve(value: unknown): void; reject(error: Error): void;
  }>();

  constructor(private readonly config: ConfigService<BoatEnvironment, true>) {}

  async open(): Promise<BufferSnapshot> {
    if (this.worker) throw new Error('Armazenamento do buffer já inicializado.');
    this.worker = new Worker(resolve(__dirname, 'sqlite-buffer.worker.js'), {
      workerData: { path: resolve(PROJECT_ROOT, this.config.get('BUFFER_BACKUP_PATH', { infer: true })) },
    });
    this.worker.on('message', (reply: BufferReply) => {
      const pending = this.requests.get(reply.id);
      if (!pending) return;
      this.requests.delete(reply.id);
      if (reply.error) pending.reject(new Error(reply.error));
      else pending.resolve(reply.value);
    });
    this.worker.on('error', (error) => this.fail(error));
    this.worker.on('exit', () => {
      if (!this.closing) this.fail(new Error('Worker do buffer encerrado inesperadamente.'));
    });
    try {
      return await this.request<BufferSnapshot>({ op: 'load',
        limit: this.config.get('BUFFER_MAX_ITEMS', { infer: true }) });
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  append(packet: TelemetryPacket, rememberLatest = true): Promise<BufferAppendResult> {
    return this.request({ op: 'append', packet, rememberLatest });
  }

  read(after: number, limit: number): Promise<BufferRow[]> {
    return this.request({ op: 'read', after, limit });
  }

  remove(messageId: string): Promise<number> {
    return this.request({ op: 'remove', messageId });
  }

  async close(): Promise<void> {
    if (!this.worker || this.closing) return;
    this.closing = true;
    try {
      if (!this.failure) await this.request({ op: 'close' });
    } finally {
      await this.worker.terminate();
      this.fail(new Error('Armazenamento do buffer encerrado.'));
    }
  }

  private request<T>(command: Omit<BufferCommand, 'id'>): Promise<T> {
    if (this.failure) return Promise.reject(this.failure);
    if (!this.worker || (this.closing && command.op !== 'close')) {
      return Promise.reject(new Error('Armazenamento do buffer indisponível.'));
    }
    return new Promise<T>((resolvePromise, reject) => {
      const id = ++this.sequence;
      this.requests.set(id, { resolve: (value) => resolvePromise(value as T), reject });
      try { this.worker!.postMessage({ ...command, id }); }
      catch (error) {
        this.requests.delete(id);
        reject(error instanceof Error ? error : new Error('Falha ao acessar o worker.'));
      }
    });
  }

  private fail(error: Error): void {
    this.failure = error;
    for (const pending of this.requests.values()) pending.reject(error);
    this.requests.clear();
  }
}
