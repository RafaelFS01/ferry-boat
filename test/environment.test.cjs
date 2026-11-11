const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validateEnvironment } = require('../dist/config/environment.js');
const { resolveTelemetryProtoPath } = require('../dist/config/proto-path.js');

test('aplica os valores do README e do Docker Compose', () => {
  const config = validateEnvironment({});
  assert.equal(config.API_PORT, 3002);
  assert.equal(config.API_HOST, '0.0.0.0');
  assert.equal(config.BOAT_ID, 'ferry-ivete-sangalo');
  assert.equal(config.TELEMETRY_INTERVAL_MS, 5000);
  assert.equal(config.GRPC_DEADLINE_MS, 2500);
  assert.equal(config.BUFFER_MAX_ITEMS, 5000);
});

test('converte as variáveis de ambiente e aceita o DNS do Compose', () => {
  const config = validateEnvironment({
    API_PORT: '3102',
    BOAT_ID: 'ferry-teste',
    TELEMETRY_INTERVAL_MS: '1000',
    CENTRAL_GRPC_URL: 'ferry-central:50051',
  });
  assert.equal(config.API_PORT, 3102);
  assert.equal(config.BOAT_ID, 'ferry-teste');
  assert.equal(config.TELEMETRY_INTERVAL_MS, 1000);
  assert.equal(config.CENTRAL_GRPC_URL, 'ferry-central:50051');
});

test('recusa portas, ciclos e identificadores inválidos antes de iniciar', () => {
  for (const [name, value] of [
    ['API_PORT', '0'],
    ['API_PORT', '65536'],
    ['API_PORT', 'abc'],
    ['TELEMETRY_INTERVAL_MS', '-5'],
    ['TELEMETRY_INTERVAL_MS', '1.5'],
    ['GRPC_DEADLINE_MS', ''],
    ['BUFFER_MAX_ITEMS', '0'],
    ['BOAT_ID', '   '],
    ['NODE_ENV', 'invalid'],
    ['CENTRAL_GRPC_URL', 'http://localhost:50051'],
    ['CENTRAL_GRPC_URL', 'localhost:70000'],
    ['CENTRAL_GRPC_URL', 'localhost'],
  ]) {
    assert.throws(() => validateEnvironment({ [name]: value }), new RegExp(name));
  }
});

test('exige os três arquivos de mTLS juntos e impede produção sem mTLS', () => {
  assert.throws(() => validateEnvironment({ GRPC_TLS_CA_PATH: './ca.crt' }), /mTLS/);
  assert.throws(() => validateEnvironment({ NODE_ENV: 'production' }), /mTLS/);
  const config = validateEnvironment({
    NODE_ENV: 'production',
    GRPC_TLS_CA_PATH: './ca.crt',
    GRPC_TLS_CERT_PATH: './boat.crt',
    GRPC_TLS_KEY_PATH: './boat.key',
  });
  assert.equal(config.GRPC_TLS_CERT_PATH, './boat.crt');
});

test('não ignora um override de contrato inexistente', () => {
  assert.throws(() => resolveTelemetryProtoPath('./contrato-inexistente.proto'), /telemetry.proto/);
});
