const assert = require('node:assert/strict');
const { test } = require('node:test');
const { NauticalSimulation } = require('../dist/simulator/nautical-simulation');
const { createSeededRandom } = require('../dist/simulator/random');
const route = require('../dist/simulator/route');
const { NavigationStatus: S } = require('../dist/grpc/telemetry');
const make = (options = {}, seed = 13) => new NauticalSimulation({
  dockTimeMs: 30000, fuelCapacityLiters: 2000, ...options,
}, createSeededRandom(seed));

test('inicia atracado, aguarda 30s e acelera a 0,1 m/s² sem teletransporte', () => {
  const model = make();
  const initial = model.snapshot();
  assert.deepEqual(initial.position, route.SAO_JOAQUIM);
  assert.equal(initial.navegacao.velocidade_nos, 0);
  assert.equal(model.advance(30).navegacao.status_navegacao, S.NAVIGATION_STATUS_ATRACADO);
  const first = model.advance(5);
  assert.equal(first.navegacao.status_navegacao, S.NAVIGATION_STATUS_MANOBRA);
  assert.ok(Math.abs(first.navegacao.velocidade_nos * route.KNOT_IN_METERS_PER_SECOND - 0.5) < 1e-9);
  assert.ok(Math.abs(first.progressMeters - 1.25) < 1e-9);
  assert.deepEqual(initial.position, route.SAO_JOAQUIM);
});

test('percorre ida e volta, respeita limites fisicos, sensores e parada no destino', () => {
  const model = make();
  let previous = model.snapshot();
  let reachedBom = false;
  let returned = false;
  let cruiseSamples = 0;
  for (let i = 0; i < 700; i++) {
    const sample = model.advance(5);
    const nav = sample.navegacao;
    const motor = sample.propulsao;
    assert.ok(route.distanceMeters(previous.position, sample.position) <= 14 * route.KNOT_IN_METERS_PER_SECOND * 5 + 0.1);
    assert.ok(route.distanceMeters(sample.position, nav) <= 10.0001);
    assert.ok(sample.progressMeters >= 0 && sample.progressMeters <= route.ROUTE_DISTANCE_METERS);
    assert.ok(nav.rumo_graus >= 0 && nav.rumo_graus < 360);
    assert.ok(nav.hdop >= 0.8 && nav.hdop <= 2);
    assert.ok(Number.isInteger(nav.satelites) && nav.satelites >= 8 && nav.satelites <= 14);
    assert.ok(motor.temperatura_motor_celsius >= 78 && motor.temperatura_motor_celsius <= 92);
    assert.ok(motor.tensao_bateria_volts >= 24 && motor.tensao_bateria_volts <= 27);
    assert.ok(motor.consumo_instantaneo_lph >= 8 && motor.consumo_instantaneo_lph <= 160);
    assert.ok(motor.nivel_combustivel_percentual <= previous.propulsao.nivel_combustivel_percentual);
    if (nav.status_navegacao === S.NAVIGATION_STATUS_EM_TRAVESSIA) {
      cruiseSamples++;
      assert.ok(nav.velocidade_nos >= 10 && nav.velocidade_nos <= 14);
      assert.ok(motor.rpm_motor >= 1500 && motor.rpm_motor <= 1850);
    }
    if (nav.status_navegacao === S.NAVIGATION_STATUS_ATRACADO) {
      assert.equal(nav.velocidade_nos, 0);
      assert.equal(motor.rpm_motor, 750);
      assert.deepEqual({ latitude: nav.latitude, longitude: nav.longitude }, sample.position);
      if (sample.direction === 'ida' && sample.progressMeters === route.ROUTE_DISTANCE_METERS) {
        reachedBom = true;
        assert.deepEqual(sample.position, route.BOM_DESPACHO);
      }
      if (sample.direction === 'volta' && sample.progressMeters === route.ROUTE_DISTANCE_METERS) {
        returned = true;
        assert.deepEqual(sample.position, route.SAO_JOAQUIM);
      }
    }
    if (nav.velocidade_nos === 0 && previous.navegacao.velocidade_nos === 0) {
      assert.equal(nav.rumo_graus, previous.navegacao.rumo_graus);
    }
    previous = sample;
  }
  assert.ok(cruiseSamples > 100);
  assert.ok(reachedBom && returned);
});

test('mantem atracacao por 30s em Bom Despacho antes de inverter o sentido', () => {
  const model = make({ dockTimeMs: 30000 });
  let sample;
  for (let i = 0; i < 3000; i++) {
    sample = model.advance(1);
    if (sample.progressMeters === route.ROUTE_DISTANCE_METERS) break;
  }
  assert.deepEqual(sample.position, route.BOM_DESPACHO);
  assert.deepEqual(model.advance(29).position, route.BOM_DESPACHO);
  assert.equal(model.advance(1).navegacao.status_navegacao, S.NAVIGATION_STATUS_ATRACADO);
  const departure = model.advance(1);
  assert.equal(departure.direction, 'volta');
  assert.ok(departure.progressMeters > 0 && departure.progressMeters < 1);
  assert.ok(route.distanceMeters(departure.position, route.BOM_DESPACHO) < 1);
});

test('integra consumo em litros por hora pelo tempo sem permitir combustivel negativo', () => {
  const model = make({ dockTimeMs: 0 });
  let previous = model.snapshot();
  for (let i = 0; i < 200; i++) {
    const current = model.advance(1);
    const expected = previous.fuelLiters - current.propulsao.consumo_instantaneo_lph / 3600;
    assert.ok(Math.abs(expected - current.fuelLiters) < 1e-10);
    previous = current;
  }
  assert.ok(previous.fuelLiters < 2000);
  const empty = make({ dockTimeMs: 0, fuelCapacityLiters: 0.001 });
  const stopped = empty.advance(5);
  assert.equal(stopped.fuelLiters, 0);
  assert.equal(stopped.navegacao.status_navegacao, S.NAVIGATION_STATUS_EMERGENCIA);
  assert.equal(stopped.navegacao.velocidade_nos, 0);
  assert.equal(stopped.propulsao.rpm_motor, 0);
  assert.equal(stopped.propulsao.consumo_instantaneo_lph, 0);
  assert.deepEqual(empty.advance(100).position, stopped.position);
});

test('seed reproduz sensores e subpassos conservam resultado em intervalos diferentes', () => {
  const a = make({ dockTimeMs: 500 });
  const b = make({ dockTimeMs: 500 });
  const finalA = a.advance(120.5);
  for (let i = 0; i < 24; i++) b.advance(5);
  assert.deepEqual(b.advance(0.5), finalA);
  const c = make({ dockTimeMs: 500 }, 14);
  assert.notDeepEqual(c.advance(120.5).navegacao, finalA.navegacao);
  assert.throws(() => a.advance(-1), /Tempo/);
  assert.throws(() => a.advance(NaN), /Tempo/);
  assert.throws(() => make({ fuelCapacityLiters: 0 }), /invalidos/);
});
