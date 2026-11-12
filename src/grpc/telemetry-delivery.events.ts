import type { status } from '@grpc/grpc-js';
import type { TelemetryAck, TelemetryPacket } from './telemetry';

export const TELEMETRY_OFFLINE_EVENT = 'telemetry.offline';
export const TELEMETRY_DELIVERY_SETTLED_EVENT = 'telemetry.delivery-settled';

// Uma emissão na primeira falha transitória de cada assinatura do Observable.
export interface OfflineTelemetryEvent {
  readonly packet: TelemetryPacket;
  readonly grpc_code: status.UNAVAILABLE | status.DEADLINE_EXCEEDED;
  readonly attempt: number;
}

// Libera a posse dos retries para o futuro buffer. Só acknowledged permite remoção.
export interface TelemetryDeliverySettledEvent {
  readonly packet: TelemetryPacket;
  readonly attempts: number;
  readonly outcome: 'acknowledged' | 'rejected' | 'failed' | 'cancelled';
  readonly grpc_code: status;
  readonly ack?: TelemetryAck;
}
