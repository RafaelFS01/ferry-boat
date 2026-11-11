const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ConfigService } = require('@nestjs/config');
const { Logger } = require('@nestjs/common');
const { EventEmitter2 } = require('@nestjs/event-emitter');
const { GpsSimulatorService } = require('../dist/simulator/gps-simulator.service');
const { TELEMETRY_GENERATED_EVENT: EVENT } = require('../dist/simulator/telemetry-generated.event');
const { createSeededRandom } = require('../dist/simulator/random');
const { validateEnvironment } = require('../dist/config/environment');
const { SAO_JOAQUIM, BOM_DESPACHO } = require('../dist/simulator/route');
Logger.overrideLogger(false);

class FakeRuntime {
  now = 0;
  timers = new Set();
  monotonicMilliseconds = () => this.now;
  epochMilliseconds = () => 1794300000000 + this.now;
  every = (callback, interval) => {
    const timer = { callback, interval, due: this.now + interval };
    this.timers.add(timer);
    return timer;
  };
  cancel = (timer) => { this.timers.delete(timer); };
  advance(ms) {
    const end = this.now + ms;
    while (this.timers.size) {
      const timer = [...this.timers].sort((a, b) => a.due - b.due)[0];
      if (timer.due > end) break;
      this.now = timer.due;
      timer.due += timer.interval;
      timer.callback();
    }
    this.now = end;
  }
  delayed(ms) {
    this.now += ms;
    for (const timer of this.timers) {
      timer.due = this.now + timer.interval;
      timer.callback();
    }
  }
}

function make(environment = {}, readiness = { waitUntilReady: async () => {} }) {
  const runtime = new FakeRuntime();
  const emitter = new EventEmitter2();
  const samples = [];
  emitter.on(EVENT, (packet) => samples.push(packet));
  const service = new GpsSimulatorService(new ConfigService(validateEnvironment(environment)),
    emitter, readiness, runtime, runtime, createSeededRandom(13));
  return { runtime, emitter, service, samples };
}

test('emite a cada 5s, sem antecipacao, com UUIDv4, alias e sequencia por execucao', async (t) => {
  const { runtime, service, samples } = make();
  t.after(() => service.onModuleDestroy());
  await service.onApplicationBootstrap();
  await service.onApplicationBootstrap();
  assert.equal(runtime.timers.size, 1);
  runtime.advance(4999);
  assert.equal(samples.length, 0);
  runtime.advance(1);
  const firstSnapshot = JSON.stringify(samples[0]);
  runtime.advance(5000);
  assert.deepEqual(samples.map((p) => p.sequence_number), ['1', '2']);
  assert.equal(JSON.stringify(samples[0]), firstSnapshot);
  for (const packet of samples) {
    assert.match(packet.packet_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(packet.packet_id, packet.message_id);
    assert.ok(packet.navegacao.hdop && packet.navegacao.satelites);
    assert.ok(packet.propulsao.tensao_bateria_volts);
    assert.equal(packet.timestamp_coleta, packet === samples[0] ? '1794300005000' : '1794300010000');
    assert.equal(packet.rede.tipo_enlace, 0);
    assert.equal(packet.passageiros, 0);
  }
  assert.notEqual(samples[0].packet_id, samples[1].packet_id);
  service.onModuleDestroy();
  runtime.advance(10000);
  assert.equal(samples.length, 2);
  assert.equal(runtime.timers.size, 0);
  const nextExecution = make();
  await nextExecution.service.onApplicationBootstrap();
  nextExecution.runtime.advance(5000);
  assert.equal(nextExecution.samples[0].sequence_number, '1');
  assert.notEqual(nextExecution.samples[0].packet_id, samples[0].packet_id);
  nextExecution.service.onModuleDestroy();
});

test('aguarda listeners, respeita desligamento e simulador desabilitado', async () => {
  let resolveReadiness;
  const ready = new Promise((resolve) => { resolveReadiness = resolve; });
  const blocked = make({}, { waitUntilReady: () => ready });
  const pending = blocked.service.onApplicationBootstrap();
  assert.equal(blocked.runtime.timers.size, 0);
  blocked.service.onModuleDestroy();
  resolveReadiness();
  await pending;
  assert.equal(blocked.runtime.timers.size, 0);
  const disabled = make({ SIMULATOR_ENABLED: 'false' });
  await disabled.service.onApplicationBootstrap();
  disabled.runtime.advance(20000);
  assert.equal(disabled.samples.length, 0);
});

test('atrasos nao geram rajadas e a fisica usa tempo monotono', async (t) => {
  const { runtime, service, samples } = make();
  t.after(() => service.onModuleDestroy());
  await service.onApplicationBootstrap();
  runtime.delayed(60000);
  assert.equal(samples.length, 1);
  assert.equal(samples[0].sequence_number, '1');
  assert.ok(samples[0].navegacao.velocidade_nos > 0);
  runtime.advance(5000);
  assert.equal(samples.length, 2);
});

test('continua gerando sem consumidor de fila e depois de esgotar combustivel', async (t) => {
  const { runtime, service, emitter } = make({ SIMULATOR_FUEL_CAPACITY_L: '0.001' });
  t.after(() => service.onModuleDestroy());
  emitter.removeAllListeners(EVENT);
  await service.onApplicationBootstrap();
  runtime.advance(10000);
  const received = [];
  emitter.on(EVENT, (packet) => received.push(packet));
  runtime.advance(5000);
  assert.equal(received[0].sequence_number, '3');
  assert.equal(received[0].navegacao.status_navegacao, 4);
  assert.equal(received[0].propulsao.nivel_combustivel_percentual, 0);
});

test('preserva sequencia durante ida, atracacao, volta e nova partida', async (t) => {
  const { runtime, service, samples } = make();
  t.after(() => service.onModuleDestroy());
  await service.onApplicationBootstrap();
  runtime.advance(3500000);
  assert.equal(samples.length, 700);
  samples.forEach((packet, index) => assert.equal(packet.sequence_number, String(index + 1)));
  assert.ok(samples.some((packet) => packet.navegacao.latitude === BOM_DESPACHO.latitude &&
    packet.navegacao.longitude === BOM_DESPACHO.longitude));
  assert.ok(samples.some((packet) => Number(packet.sequence_number) > 100 &&
    packet.navegacao.latitude === SAO_JOAQUIM.latitude &&
    packet.navegacao.longitude === SAO_JOAQUIM.longitude));
  assert.equal(new Set(samples.map((packet) => packet.message_id)).size, 700);
});

test('falha de consumidor nao interrompe os ciclos seguintes', async (t) => {
  const { runtime, service, emitter, samples } = make();
  t.after(() => service.onModuleDestroy());
  emitter.on(EVENT, () => { throw new Error('consumidor indisponivel'); });
  await service.onApplicationBootstrap();
  runtime.advance(10000);
  assert.equal(samples.length, 2);
  assert.equal(samples[1].sequence_number, '2');
  assert.equal(runtime.timers.size, 1);
});
