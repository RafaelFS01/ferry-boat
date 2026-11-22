require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { status } = require('@grpc/grpc-js');
const { Logger } = require('@nestjs/common');
const { ConfigService } = require('@nestjs/config');
const { EventEmitter2 } = require('@nestjs/event-emitter');
const { Subject, firstValueFrom, of, throwError } = require('rxjs');
const { validateEnvironment } = require('../dist/config/environment.js');
const { GrpcCircuitBreaker } = require('../dist/grpc/circuit-breaker.js');
const { TelemetryGrpcClient } = require('../dist/grpc/telemetry-grpc.client.js');
const {
  TELEMETRY_DELIVERY_SETTLED_EVENT,
  TELEMETRY_OFFLINE_EVENT,
} = require('../dist/grpc/telemetry-delivery.events.js');
const { AckStatus } = require('../dist/grpc/telemetry.js');
const { FifoBufferService } = require('../dist/buffer/fifo-buffer.service.js');
const { SqliteBufferStore } = require('../dist/buffer/sqlite-buffer.store.js');

Logger.overrideLogger(false);

function makePacket(sequence = 1) {
  const id = randomUUID();
  return {
    message_id: id,
    boat_id: 'ferry-cb-test',
    timestamp_coleta: String(1794300000000 + sequence * 5000),
    sequence_number: String(sequence),
    passageiros: 0,
    navegacao: {
      latitude: -12.9482,
      longitude: -38.5028,
      velocidade_nos: 12,
      rumo_graus: 245,
      status_navegacao: 2,
    },
    propulsao: {
      rpm_motor: 1500,
      temperatura_motor_celsius: 84,
      pressao_oleo_bar: 4.1,
      nivel_combustivel_percentual: 85,
      consumo_instantaneo_lph: 110,
    },
    rede: {
      rssi_dbm: -75,
      latencia_rtt_ms: 25,
      perda_pacotes_percentual: 0,
      tamanho_buffer_local: 0,
      tentativa_envio: 1,
      tipo_enlace: 2,
    },
  };
}

function validAck(packet) {
  return {
    message_id: packet.message_id,
    sucesso: true,
    duplicado: false,
    processado_em: '1794300001000',
    mensagem: 'aceito',
    status: AckStatus.ACK_STATUS_ACEITO,
  };
}

function grpcError(code, message = 'falha gRPC simulada') {
  return Object.assign(new Error(message), { code });
}

function createFakeGrpcRuntime(clock) {
  return {
    epochMilliseconds: () => 1794300000000 + clock.now,
    monotonicMilliseconds: () => clock.now,
    random: () => 0.5,
    scheduler: {
      now: () => clock.now,
      schedule(work, _delay = 0, state) {
        let cancelled = false;
        const sub = { unsubscribe() { cancelled = true; } };
        Promise.resolve().then(() => {
          if (!cancelled) work.call(sub, state);
        });
        return sub;
      },
    },
  };
}

class FakeBufferRuntime {
  constructor(clock) {
    this.clock = clock;
    this.timers = new Set();
  }
  monotonicMilliseconds() { return this.clock.now; }
  epochMilliseconds() { return 1794300000000 + this.clock.now; }
  schedule(callback, delay) {
    const timer = { callback, due: this.clock.now + Math.max(0, delay) };
    this.timers.add(timer);
    return timer;
  }
  cancel(timer) {
    this.timers.delete(timer);
  }
  async flushDue(buffer) {
    for (let guard = 0; guard < 100; guard += 1) {
      const due = [...this.timers]
        .filter((timer) => timer.due <= this.clock.now)
        .sort((a, b) => a.due - b.due);
      if (!due.length) break;
      const next = due[0];
      this.timers.delete(next);
      next.callback();
      if (buffer && buffer.drainTask) await buffer.drainTask;
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
}

test('GrpcCircuitBreaker transita CLOSED -> OPEN -> HALF_OPEN -> OPEN -> HALF_OPEN -> CLOSED', () => {
  let now = 1000;
  const transitions = [];
  const cb = new GrpcCircuitBreaker({
    failureThreshold: 3,
    cooldownMs: 10000,
    monotonicMilliseconds: () => now,
    onTransition: (from, to) => transitions.push(`${from}->${to}`),
  });

  assert.equal(cb.getState(), 'CLOSED');
  assert.deepEqual(cb.tryAcquire(), { allowed: true, isProbe: false });

  // Falhas abaixo do limite são zeradas por sucesso.
  assert.equal(cb.recordTransientFailure(), 'CLOSED');
  assert.equal(cb.recordTransientFailure(), 'CLOSED');
  assert.equal(cb.recordSuccess(), 'CLOSED');

  // N falhas consecutivas abrem o circuito.
  assert.equal(cb.recordTransientFailure(), 'CLOSED');
  assert.equal(cb.recordTransientFailure(), 'CLOSED');
  assert.equal(cb.recordTransientFailure(), 'OPEN');
  assert.equal(cb.getState(), 'OPEN');
  assert.equal(cb.getRemainingCooldownMs(), 10000);

  // Durante o cooldown, bloqueia novos envios.
  now += 4000;
  assert.equal(cb.getState(), 'OPEN');
  assert.equal(cb.getRemainingCooldownMs(), 6000);
  assert.deepEqual(cb.tryAcquire(), { allowed: false, state: 'OPEN', retryAfterMs: 6000 });

  // Após o cooldown, transita para HALF_OPEN e permite apenas uma sondagem simultânea.
  now += 6000;
  assert.equal(cb.getState(), 'HALF_OPEN');
  assert.deepEqual(cb.tryAcquire(), { allowed: true, isProbe: true });
  assert.deepEqual(cb.tryAcquire(), { allowed: false, state: 'HALF_OPEN', retryAfterMs: 0 });

  // Falha na sondagem retorna para OPEN com novo cooldown.
  assert.equal(cb.recordTransientFailure(), 'OPEN');
  assert.equal(cb.getRemainingCooldownMs(), 10000);

  // Novo cooldown -> HALF_OPEN -> cancelamento libera vaga -> nova sondagem com sucesso fecha o circuito.
  now += 10000;
  assert.deepEqual(cb.tryAcquire(), { allowed: true, isProbe: true });
  cb.cancelProbe();
  assert.deepEqual(cb.tryAcquire(), { allowed: true, isProbe: true });
  assert.equal(cb.recordSuccess(), 'CLOSED');
  assert.equal(cb.getState(), 'CLOSED');
  assert.deepEqual(cb.tryAcquire(), { allowed: true, isProbe: false });

  assert.deepEqual(transitions, [
    'CLOSED->OPEN',
    'OPEN->HALF_OPEN',
    'HALF_OPEN->OPEN',
    'OPEN->HALF_OPEN',
    'HALF_OPEN->CLOSED',
  ]);
});

test('TelemetryGrpcClient aplica CLOSED -> OPEN -> HALF_OPEN -> CLOSED sem rajada durante cooldown', async () => {
  const clock = { now: 0 };
  const emitter = new EventEmitter2();
  const offlineEvents = [];
  const settledEvents = [];
  emitter.on(TELEMETRY_OFFLINE_EVENT, (event) => offlineEvents.push(event));
  emitter.on(TELEMETRY_DELIVERY_SETTLED_EVENT, (event) => settledEvents.push(event));

  let rpcCalls = 0;
  let behavior = () => throwError(() => grpcError(status.UNAVAILABLE));
  const fakeClientGrpc = {
    getService: () => ({
      enviarTelemetria: (packet) => {
        rpcCalls += 1;
        return behavior(packet);
      },
    }),
  };

  const config = new ConfigService(validateEnvironment({
    NODE_ENV: 'test',
    GRPC_RETRY_MAX_ATTEMPTS: '6',
    GRPC_CIRCUIT_BREAKER_FAILURE_THRESHOLD: '3',
    GRPC_CIRCUIT_BREAKER_COOLDOWN_MS: '15000',
  }));
  const client = new TelemetryGrpcClient(fakeClientGrpc, config, emitter, createFakeGrpcRuntime(clock));
  client.onModuleInit();

  assert.equal(client.getCircuitState(), 'CLOSED');

  // Erro permanente não abre o circuito.
  behavior = () => throwError(() => grpcError(status.INVALID_ARGUMENT));
  await assert.rejects(() => firstValueFrom(client.enviarTelemetria(makePacket(1))), { code: status.INVALID_ARGUMENT });
  assert.equal(client.getCircuitState(), 'CLOSED');
  assert.equal(rpcCalls, 1);

  // 3 falhas transitórias consecutivas abrem o circuito e interrompem retries extras (não dispara 6 tentativas).
  behavior = () => throwError(() => grpcError(status.UNAVAILABLE));
  await assert.rejects(() => firstValueFrom(client.enviarTelemetria(makePacket(2))), { code: status.UNAVAILABLE });
  assert.equal(rpcCalls, 4); // 1 (INVALID_ARGUMENT) + 3 (threshold)
  assert.equal(client.getCircuitState(), 'OPEN');
  assert.equal(client.getCircuitRetryAfterMs(), 15000);

  // Em OPEN durante cooldown, não dispara nenhuma chamada gRPC e sinaliza offline para o buffer.
  clock.now += 5000;
  const packetDuringOpen = makePacket(3);
  await assert.rejects(
    () => firstValueFrom(client.enviarTelemetria(packetDuringOpen)),
    { code: status.UNAVAILABLE, circuit_state: 'OPEN' },
  );
  assert.equal(rpcCalls, 4);
  assert.equal(offlineEvents.at(-1).packet.message_id, packetDuringOpen.message_id);
  assert.equal(settledEvents.at(-1).attempts, 0);

  // Após o cooldown, transita para HALF_OPEN e permite exatamente 1 tentativa de sondagem (sem retries).
  clock.now += 10000;
  assert.equal(client.getCircuitState(), 'HALF_OPEN');
  behavior = () => throwError(() => grpcError(status.DEADLINE_EXCEEDED));
  await assert.rejects(() => firstValueFrom(client.enviarTelemetria(makePacket(4))), { code: status.DEADLINE_EXCEEDED });
  assert.equal(rpcCalls, 5); // exatamente +1 sondagem, sem retries
  assert.equal(client.getCircuitState(), 'OPEN');

  // Segundo cooldown -> sondagem em voo expõe HALF_OPEN -> segunda chamada simultânea é desviada -> ACK fecha o circuito.
  clock.now += 15000;
  assert.equal(client.getCircuitState(), 'HALF_OPEN');
  const probeResponse = new Subject();
  behavior = () => probeResponse.asObservable();
  const probePacket = makePacket(5);
  const probePromise = firstValueFrom(client.enviarTelemetria(probePacket));
  assert.equal(rpcCalls, 6);
  assert.equal(client.getCircuitState(), 'HALF_OPEN');

  await assert.rejects(
    () => firstValueFrom(client.enviarTelemetria(makePacket(6))),
    { code: status.UNAVAILABLE, circuit_state: 'HALF_OPEN' },
  );
  assert.equal(rpcCalls, 6);

  probeResponse.next(validAck(probePacket));
  probeResponse.complete();
  const ack = await probePromise;
  assert.equal(ack.message_id, probePacket.message_id);
  assert.equal(client.getCircuitState(), 'CLOSED');

  // Em CLOSED volta a enviar normalmente.
  behavior = (packet) => of(validAck(packet));
  const normalPacket = makePacket(7);
  const normalAck = await firstValueFrom(client.enviarTelemetria(normalPacket));
  assert.equal(normalAck.message_id, normalPacket.message_id);
  assert.equal(rpcCalls, 7);

  client.onModuleDestroy();
});

test('FifoBufferService retém leituras no SQLite em OPEN, sonda em HALF_OPEN e drena ao fechar', async (t) => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'ferry-cb-buffer-'));
  const clock = { now: 0 };
  const emitter = new EventEmitter2();
  const sentIds = [];
  let centralOnline = false;

  const fakeClientGrpc = {
    getService: () => ({
      enviarTelemetria: (packet) => {
        sentIds.push(packet.message_id);
        if (!centralOnline) return throwError(() => grpcError(status.UNAVAILABLE));
        return of(validAck(packet));
      },
    }),
  };

  const config = new ConfigService(validateEnvironment({
    NODE_ENV: 'test',
    BUFFER_ENABLED: 'true',
    BUFFER_BACKUP_PATH: path.join(tempDir, 'buffer.sqlite'),
    BUFFER_DRAIN_INTERVAL_MS: '20',
    BUFFER_RETRY_INTERVAL_MS: '5000',
    GRPC_RETRY_MAX_ATTEMPTS: '6',
    GRPC_CIRCUIT_BREAKER_FAILURE_THRESHOLD: '3',
    GRPC_CIRCUIT_BREAKER_COOLDOWN_MS: '20000',
  }));

  const client = new TelemetryGrpcClient(fakeClientGrpc, config, emitter, createFakeGrpcRuntime(clock));
  client.onModuleInit();
  const store = new SqliteBufferStore(config);
  const bufferRuntime = new FakeBufferRuntime(clock);
  const buffer = new FifoBufferService(
    config,
    store,
    client,
    { waitUntilReady: async () => {} },
    bufferRuntime,
  );
  emitter.on(TELEMETRY_OFFLINE_EVENT, (event) => buffer.onOffline(event));
  emitter.on(TELEMETRY_DELIVERY_SETTLED_EVENT, (event) => buffer.onSettled(event));

  await buffer.onModuleInit();
  await buffer.onApplicationBootstrap();
  t.after(async () => {
    await buffer.onModuleDestroy();
    client.onModuleDestroy();
    rmSync(tempDir, { recursive: true, force: true });
  });

  assert.equal(buffer.getStatus().circuit_state, 'CLOSED');

  // Primeira leitura falha 3x consecutivas e abre o circuito (OPEN).
  const p1 = makePacket(1);
  await buffer.enqueue(p1);
  await bufferRuntime.flushDue(buffer);

  assert.equal(sentIds.length, 3);
  assert.equal(buffer.getStatus().circuit_state, 'OPEN');
  assert.equal(buffer.getStatus().state, 'offline');
  assert.equal(buffer.getStatus().pending_count, 1);

  // Durante o cooldown, novas leituras vão direto para o SQLite sem rajada contra a Central.
  clock.now += 5000;
  const p2 = makePacket(2);
  await buffer.enqueue(p2);
  await bufferRuntime.flushDue(buffer);

  clock.now += 5000;
  const p3 = makePacket(3);
  await buffer.enqueue(p3);
  await bufferRuntime.flushDue(buffer);

  assert.equal(sentIds.length, 3); // zero novas chamadas gRPC durante cooldown
  assert.equal(buffer.getStatus().circuit_state, 'OPEN');
  assert.equal(buffer.getStatus().pending_count, 3);

  // Ao expirar o cooldown, sonda 1x em HALF_OPEN; Central ainda indisponível -> retorna para OPEN.
  clock.now += 10000;
  assert.equal(buffer.getStatus().circuit_state, 'HALF_OPEN');
  await bufferRuntime.flushDue(buffer);

  assert.equal(sentIds.length, 4); // exatamente 1 sondagem
  assert.equal(buffer.getStatus().circuit_state, 'OPEN');
  assert.equal(buffer.getStatus().pending_count, 3);

  // Central volta; após novo cooldown, sondagem em HALF_OPEN recebe ACK, fecha o circuito e drena FIFO.
  centralOnline = true;
  clock.now += 20000;
  assert.equal(buffer.getStatus().circuit_state, 'HALF_OPEN');
  await bufferRuntime.flushDue(buffer);

  assert.equal(buffer.getStatus().circuit_state, 'CLOSED');
  assert.equal(buffer.getStatus().pending_count, 2);

  // Drena p2 e p3 respeitando BUFFER_DRAIN_INTERVAL_MS (20ms).
  clock.now += 20;
  await bufferRuntime.flushDue(buffer);
  clock.now += 20;
  await bufferRuntime.flushDue(buffer);

  const finalStatus = buffer.getStatus();
  assert.equal(finalStatus.circuit_state, 'CLOSED');
  assert.equal(finalStatus.state, 'idle');
  assert.equal(finalStatus.pending_count, 0);
  assert.deepEqual(sentIds.slice(-3), [p1.message_id, p2.message_id, p3.message_id]);
});
