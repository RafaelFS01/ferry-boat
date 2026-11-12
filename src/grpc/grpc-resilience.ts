import type { ChannelOptions } from '@grpc/grpc-js';
import { asyncScheduler, type SchedulerLike } from 'rxjs';

export const GRPC_CHANNEL_OPTIONS: ChannelOptions = {
  'grpc.keepalive_time_ms': 10000,
  'grpc.keepalive_timeout_ms': 5000,
  'grpc.keepalive_permit_without_calls': 1,
  // Há um único controlador de retries, com deadline novo em cada tentativa.
  'grpc.enable_retries': 0,
};

export const GRPC_RETRY_RUNTIME = Symbol('GRPC_RETRY_RUNTIME');

export interface GrpcRetryRuntime {
  epochMilliseconds(): number;
  random(): number;
  scheduler: SchedulerLike;
}

export const grpcRetryRuntime: GrpcRetryRuntime = {
  epochMilliseconds: () => Date.now(),
  random: () => Math.random(),
  scheduler: asyncScheduler,
};

// retryNumber começa em 1. Jitter de ±20%, com teto absoluto de 30s.
export function retryDelayMilliseconds(retryNumber: number, random: number): number {
  const base = Math.min(30000, 2000 * 2 ** Math.min(retryNumber - 1, 4));
  return Math.min(30000, Math.round(base * (0.8 + 0.4 * random)));
}
