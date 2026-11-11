const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const loader = require('@grpc/proto-loader');
const { randomUUID } = require('node:crypto');
const { resolveTelemetryProtoPath } = require('../dist/config/proto-path');
const options = { keepCase: true, longs: String, defaults: true, oneofs: true };
const current = loader.loadSync(resolveTelemetryProtoPath(), options)['ferry.telemetry.v1.TelemetryPacket'];
const legacy = loader.loadSync(path.join(__dirname, 'fixtures/legacy/telemetry.proto'), options)['ferry.telemetry.v1.TelemetryPacket'];

test('novos campos preservam valores e int64/uint64 completos na serializacao protobuf', () => {
  const id = randomUUID();
  const packet = {
    message_id: id, packet_id: id, boat_id: 'ferry-contrato',
    timestamp_coleta: '1794300000000', sequence_number: '18446744073709551615',
    passageiros: 0,
    navegacao: { latitude: -12.9482, longitude: -38.5028, velocidade_nos: 12,
      rumo_graus: 246, status_navegacao: 2, hdop: 1.1, satelites: 12 },
    propulsao: { rpm_motor: 1600, temperatura_motor_celsius: 85, pressao_oleo_bar: 4,
      nivel_combustivel_percentual: 90, consumo_instantaneo_lph: 100, tensao_bateria_volts: 26.4 },
    rede: { rssi_dbm: 0, latencia_rtt_ms: 0, perda_pacotes_percentual: 0,
      tamanho_buffer_local: 0, tentativa_envio: 1, tipo_enlace: 0 },
  };
  const decoded = current.deserialize(current.serialize(packet));
  assert.equal(decoded.message_id, id);
  assert.equal(decoded.sequence_number, packet.sequence_number);
  assert.equal(decoded.timestamp_coleta, packet.timestamp_coleta);
  assert.equal(decoded.navegacao.hdop, 1.1);
  assert.equal(decoded.navegacao.satelites, 12);
  assert.equal(decoded.propulsao.tensao_bateria_volts, 26.4);
  assert.equal(decoded.packet_id, undefined);
  const oldReader = legacy.deserialize(current.serialize(packet));
  assert.equal(oldReader.message_id, id);
  assert.equal(oldReader.navegacao.velocidade_nos, 12);
  assert.equal(oldReader.sequence_number, undefined);
  assert.equal(oldReader.navegacao.hdop, undefined);
});

test('mensagens legadas omitem novos campos; zero opcional tem presenca propria', () => {
  const oldPacket = {
    message_id: randomUUID(), boat_id: 'legado', timestamp_coleta: '1794300000000',
    navegacao: { latitude: -12.9482, longitude: -38.5028 },
    propulsao: { rpm_motor: 1500 },
  };
  const decoded = current.deserialize(legacy.serialize(oldPacket));
  assert.equal(decoded.sequence_number, undefined);
  assert.equal(decoded.navegacao.hdop, undefined);
  assert.equal(decoded.navegacao.satelites, undefined);
  assert.equal(decoded.propulsao.tensao_bateria_volts, undefined);
  const explicitZero = current.deserialize(current.serialize({ ...oldPacket, sequence_number: '0' }));
  assert.equal(explicitZero.sequence_number, '0');
});
