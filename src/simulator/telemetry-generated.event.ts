import type { TelemetryPacket } from '../grpc/telemetry';

export const TELEMETRY_GENERATED_EVENT = 'telemetry.generated';
export type GeneratedTelemetryPacket = TelemetryPacket & { readonly packet_id: string };
