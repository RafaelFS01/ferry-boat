import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const PROJECT_ROOT = resolve(__dirname, '../..');

export function resolveTelemetryProtoPath(override?: string): string {
  const candidates = override
    ? [resolve(PROJECT_ROOT, override)]
    : [
        resolve(PROJECT_ROOT, '../proto/telemetry.proto'),
        resolve('/proto/telemetry.proto'),
        resolve(__dirname, '../proto/telemetry.proto'),
      ];
  const protoPath = candidates.find((candidate) => existsSync(candidate));
  if (!protoPath) {
    throw new Error(`telemetry.proto não encontrado. Caminhos: ${candidates.join(', ')}`);
  }
  return protoPath;
}
