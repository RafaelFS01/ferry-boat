require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const grpc = require('@grpc/grpc-js');
const loader = require('@grpc/proto-loader');
const { Test } = require('@nestjs/testing');
const { firstValueFrom, timeout } = require('rxjs');
const { resolveTelemetryProtoPath } = require('../dist/config/proto-path.js');
const { TelemetryGrpcClient } = require('../dist/grpc/telemetry-grpc.client.js');

test('inicia sem Central, expõe health e transporta o contrato tipado por gRPC', { timeout: 15000 }, async (t) => {
  const definition = grpc.loadPackageDefinition(loader.loadSync(resolveTelemetryProtoPath(), {
    keepCase: true,
    longs: String,
    defaults: true,
    oneofs: true,
  }));
  const server = new grpc.Server();
  let receivedPacket;
  let receivedCorrelation;
  const processedAt = '1794236400123';
  const port = await new Promise((resolve, reject) => {
    server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, boundPort) => {
      if (error) reject(error);
      else resolve(boundPort);
    });
  });
  // Libera a porta antes de iniciar o Nest: a API de bordo deve subir offline.
  server.forceShutdown();

  process.env.NODE_ENV = 'test';
  process.env.SIMULATOR_ENABLED = 'false';
  process.env.BOAT_ID = 'ferry-integracao';
  process.env.CENTRAL_GRPC_URL = `127.0.0.1:${port}`;
  const { AppModule } = require('../dist/app.module.js');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication({ logger: false });
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');

  const response = await fetch(`${await app.getUrl()}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', boat_id: 'ferry-integracao' });

  // Recria a Central na mesma porta após comprovar a inicialização offline.
  const central = new grpc.Server();
  central.addService(definition.ferry.telemetry.v1.TelemetryService.service, {
    enviarTelemetria(call, callback) {
      receivedPacket = call.request;
      receivedCorrelation = call.metadata.get('x-correlation-id')[0];
      callback(null, {
        message_id: call.request.message_id,
        sucesso: true,
        duplicado: false,
        processado_em: processedAt,
        mensagem: 'aceito',
        status: 1,
      });
    },
  });
  t.after(() => central.forceShutdown());
  await new Promise((resolve, reject) => {
    central.bindAsync(`127.0.0.1:${port}`, grpc.ServerCredentials.createInsecure(), (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const packet = {
    message_id: randomUUID(),
    boat_id: 'ferry-integracao',
    timestamp_coleta: '1794236400000',
    passageiros: 120,
    navegacao: {
      latitude: -12.9714,
      longitude: -38.5014,
      velocidade_nos: 12,
      rumo_graus: 270,
      status_navegacao: 2,
    },
    propulsao: {
      rpm_motor: 1400,
      temperatura_motor_celsius: 85,
      pressao_oleo_bar: 4,
      nivel_combustivel_percentual: 80,
      consumo_instantaneo_lph: 110,
    },
    rede: {
      rssi_dbm: -80,
      latencia_rtt_ms: 25,
      perda_pacotes_percentual: 0,
      tamanho_buffer_local: 0,
      tentativa_envio: 1,
      tipo_enlace: 2,
    },
  };
  const metadata = new grpc.Metadata();
  metadata.set('x-correlation-id', packet.message_id);
  const ack = await firstValueFrom(
    app.get(TelemetryGrpcClient).enviarTelemetria(packet, metadata).pipe(timeout(5000)),
  );

  assert.deepEqual(receivedPacket, packet);
  assert.equal(receivedCorrelation, packet.message_id);
  assert.deepEqual(ack, {
    message_id: packet.message_id,
    sucesso: true,
    duplicado: false,
    processado_em: processedAt,
    mensagem: 'aceito',
    status: 1,
  });
});
