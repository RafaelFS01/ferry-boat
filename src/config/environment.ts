export interface BoatEnvironment {
  NODE_ENV: 'development' | 'test' | 'production';
  API_HOST: string;
  API_PORT: number;
  BOAT_ID: string;
  CENTRAL_GRPC_URL: string;
  TELEMETRY_INTERVAL_MS: number;
  SIMULATOR_ENABLED: boolean;
  SIMULATOR_DOCK_TIME_MS: number;
  SIMULATOR_FUEL_CAPACITY_L: number;
  SIMULATOR_SEED: number | undefined;
  GRPC_DEADLINE_MS: number;
  GRPC_RETRY_MAX_ATTEMPTS: number;
  BUFFER_MAX_ITEMS: number;
  BUFFER_BACKUP_PATH: string;
  TELEMETRY_PROTO_PATH: string | undefined;
  GRPC_TLS_CA_PATH: string | undefined;
  GRPC_TLS_CERT_PATH: string | undefined;
  GRPC_TLS_KEY_PATH: string | undefined;
}

function text(
  environment: Record<string, unknown>,
  name: string,
  fallback?: string,
): string {
  const value = environment[name] ?? fallback;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} deve ser uma string não vazia.`);
  }
  return value.trim();
}

function positiveInteger(
  environment: Record<string, unknown>,
  name: string,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const raw = environment[name] ?? fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} deve ser um inteiro entre 1 e ${max}.`);
  }
  return value;
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): BoatEnvironment {
  const nodeEnv = text(environment, 'NODE_ENV', 'development');
  const enabled = environment.SIMULATOR_ENABLED ?? 'true';
  if (!['true', 'false', true, false].includes(enabled as string | boolean)) {
    throw new Error('SIMULATOR_ENABLED deve ser true ou false.');
  }
  const dockTime = Number(environment.SIMULATOR_DOCK_TIME_MS ?? 30000);
  if (!Number.isSafeInteger(dockTime) || dockTime < 0 ||
    String(environment.SIMULATOR_DOCK_TIME_MS ?? 30000).trim() === '') {
    throw new Error('SIMULATOR_DOCK_TIME_MS deve ser um inteiro maior ou igual a zero.');
  }
  const capacity = Number(environment.SIMULATOR_FUEL_CAPACITY_L ?? 2000);
  if (!Number.isFinite(capacity) || capacity <= 0) {
    throw new Error('SIMULATOR_FUEL_CAPACITY_L deve ser um numero positivo.');
  }
  const rawSeed = environment.SIMULATOR_SEED;
  const seed = rawSeed === undefined ? undefined : Number(rawSeed);
  if (seed !== undefined && (!Number.isInteger(seed) || seed < 0 || seed > 4294967295 ||
    String(rawSeed).trim() === '')) {
    throw new Error('SIMULATOR_SEED deve ser um inteiro entre 0 e 4294967295.');
  }
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV deve ser development, test ou production.');
  }

  const centralUrl = text(environment, 'CENTRAL_GRPC_URL', 'localhost:50051');
  const endpoint = /^(?:\[[\da-fA-F:]+\]|[\w.-]+):(\d+)$/.exec(centralUrl);
  if (!endpoint || Number(endpoint[1]) < 1 || Number(endpoint[1]) > 65535) {
    throw new Error('CENTRAL_GRPC_URL deve usar host:porta (1 a 65535).');
  }

  const tlsNames = [
    'GRPC_TLS_CA_PATH',
    'GRPC_TLS_CERT_PATH',
    'GRPC_TLS_KEY_PATH',
  ] as const;
  const tlsPaths = tlsNames.map((name) =>
    environment[name] === undefined ? undefined : text(environment, name),
  );
  const tlsCount = tlsPaths.filter(Boolean).length;
  if (tlsCount !== 0 && tlsCount !== 3) {
    throw new Error('mTLS exige GRPC_TLS_CA_PATH, GRPC_TLS_CERT_PATH e GRPC_TLS_KEY_PATH juntos.');
  }
  if (nodeEnv === 'production' && tlsCount !== 3) {
    throw new Error('mTLS é obrigatório em NODE_ENV=production.');
  }

  return {
    NODE_ENV: nodeEnv as BoatEnvironment['NODE_ENV'],
    API_HOST: text(environment, 'API_HOST', '0.0.0.0'),
    API_PORT: positiveInteger(environment, 'API_PORT', 3002, 65535),
    BOAT_ID: text(environment, 'BOAT_ID', 'ferry-ivete-sangalo'),
    CENTRAL_GRPC_URL: centralUrl,
    TELEMETRY_INTERVAL_MS: positiveInteger(environment, 'TELEMETRY_INTERVAL_MS', 5000, 2147483647),
    SIMULATOR_ENABLED: enabled === 'true' || enabled === true,
    SIMULATOR_DOCK_TIME_MS: dockTime,
    SIMULATOR_FUEL_CAPACITY_L: capacity,
    SIMULATOR_SEED: seed,
    GRPC_DEADLINE_MS: positiveInteger(environment, 'GRPC_DEADLINE_MS', 2500, 2500),
    GRPC_RETRY_MAX_ATTEMPTS: positiveInteger(environment, 'GRPC_RETRY_MAX_ATTEMPTS', 6, 10),
    BUFFER_MAX_ITEMS: positiveInteger(environment, 'BUFFER_MAX_ITEMS', 5000),
    BUFFER_BACKUP_PATH: text(environment, 'BUFFER_BACKUP_PATH', './data/telemetry_buffer_backup.json'),
    TELEMETRY_PROTO_PATH: environment.TELEMETRY_PROTO_PATH === undefined
      ? undefined
      : text(environment, 'TELEMETRY_PROTO_PATH'),
    GRPC_TLS_CA_PATH: tlsPaths[0],
    GRPC_TLS_CERT_PATH: tlsPaths[1],
    GRPC_TLS_KEY_PATH: tlsPaths[2],
  };
}
