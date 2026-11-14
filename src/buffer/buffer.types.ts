import type { TelemetryPacket } from '../grpc/telemetry';

export interface BufferRow {
  ordinal: number;
  packet: TelemetryPacket;
}

export interface BufferSnapshot {
  count: number;
  rows: BufferRow[];
  latest: TelemetryPacket | null;
}

export interface BufferAppendResult {
  inserted: boolean;
  count: number;
  row: BufferRow | null;
  latest: TelemetryPacket | null;
}

export type BufferState = 'disabled' | 'idle' | 'draining' | 'offline' | 'blocked' | 'storage_error';

export interface BufferStatus {
  enabled: boolean;
  state: BufferState;
  pending_count: number;
  memory_count: number;
  disk_count: number;
  memory_limit: number;
  in_flight: string | null;
  oldest_timestamp: string | null;
  next_retry_at: string | null;
  last_ack_at: string | null;
  last_error: { kind: 'grpc' | 'storage' | 'rejected'; code?: number; message: string } | null;
}

export interface BufferCommand {
  id: number;
  op: 'load' | 'append' | 'read' | 'remove' | 'close';
  limit?: number;
  after?: number;
  packet?: TelemetryPacket;
  rememberLatest?: boolean;
  messageId?: string;
}

export interface BufferReply {
  id: number;
  value?: unknown;
  error?: string;
}
