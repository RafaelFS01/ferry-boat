// Contrato da API REST local do NestJS (servida pelo Nginx em /api/edge).
// Espelha TelemetryPacket (src/grpc/telemetry.ts) e BufferStatus (src/buffer/buffer.types.ts).

export const EDGE_API_BASE = '/api/edge';

export enum NavigationStatus {
  Unspecified = 0,
  Atracado = 1,
  EmTravessia = 2,
  Manobra = 3,
  Emergencia = 4,
}

export interface NavigationData {
  latitude: number;
  longitude: number;
  velocidade_nos: number;
  rumo_graus: number;
  status_navegacao: NavigationStatus;
  hdop?: number;
  satelites?: number;
}

export interface PropulsionData {
  rpm_motor: number;
  temperatura_motor_celsius: number;
  pressao_oleo_bar: number;
  nivel_combustivel_percentual: number;
  consumo_instantaneo_lph: number;
  tensao_bateria_volts?: number;
}

export interface NetworkDiagnostics {
  rssi_dbm: number;
  latencia_rtt_ms: number;
  perda_pacotes_percentual: number;
  tamanho_buffer_local: number;
  tentativa_envio: number;
  tipo_enlace: number;
}

export interface TelemetryPacket {
  message_id: string;
  boat_id: string;
  /** Epoch em milissegundos serializado como string (int64 do Protobuf) */
  timestamp_coleta: string;
  passageiros: number;
  navegacao?: NavigationData;
  propulsao?: PropulsionData;
  rede?: NetworkDiagnostics;
}

export type BufferState = 'disabled' | 'idle' | 'draining' | 'offline' | 'blocked' | 'storage_error';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface BufferStatus {
  enabled: boolean;
  state: BufferState;
  circuit_state: CircuitState;
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

/** Resultado de uma leitura: `null` quando o recurso ainda não existe (404). */
export type EdgeResult<T> = { ok: true; data: T | null } | { ok: false };

async function getJson<T>(path: string, signal: AbortSignal): Promise<EdgeResult<T>> {
  try {
    const response = await fetch(`${EDGE_API_BASE}${path}`, { cache: 'no-store', signal });
    if (response.status === 404) return { ok: true, data: null };
    if (!response.ok) return { ok: false };
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false };
  }
}

export const fetchLatestTelemetry = (signal: AbortSignal) =>
  getJson<TelemetryPacket>('/telemetry/latest', signal);

export const fetchBufferStatus = (signal: AbortSignal) =>
  getJson<BufferStatus>('/telemetry/buffer/status', signal);

/** Comando manual do simulador (src/simulator/simulator-command.ts). */
export interface SimulatorCommand {
  /** `null` = velocidade automática do simulador */
  velocidade_alvo_nos: number | null;
  passageiros: number;
}

export const MAX_COMMANDED_KNOTS = 14;
export const MAX_PASSENGERS = 1000;

export const fetchSimulatorCommand = (signal: AbortSignal) =>
  getJson<SimulatorCommand>('/simulator/command', signal);

export async function sendSimulatorCommand(update: Partial<SimulatorCommand>): Promise<SimulatorCommand | null> {
  try {
    const response = await fetch(`${EDGE_API_BASE}/simulator/command`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    return response.ok ? ((await response.json()) as SimulatorCommand) : null;
  } catch {
    return null;
  }
}
