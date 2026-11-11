import { NavigationStatus } from '../grpc/telemetry';
import type { NavigationData, PropulsionData } from '../grpc/telemetry';
import { gaussian, RandomSource } from './random';
import {
  SAO_JOAQUIM, BOM_DESPACHO, ROUTE_DISTANCE_METERS, KNOT_IN_METERS_PER_SECOND,
  Coordinates, bearingDegrees, destination,
} from './route';

const ACCELERATION = 0.1;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const approach = (value: number, target: number, maximumChange: number): number =>
  value + clamp(target - value, -maximumChange, maximumChange);
const smooth = (value: number, target: number, dt: number, timeConstant: number): number =>
  value + (target - value) * (1 - Math.exp(-dt / timeConstant));

export interface NauticalSimulationOptions {
  readonly dockTimeMs: number;
  readonly fuelCapacityLiters: number;
}
export interface NauticalSnapshot {
  readonly direction: 'ida' | 'volta';
  readonly position: Coordinates;
  readonly progressMeters: number;
  readonly fuelLiters: number;
  readonly navegacao: NavigationData;
  readonly propulsao: PropulsionData;
}

// Modelo sintético: nenhum acesso a relógio, timers, rede, arquivos ou injeção Nest.
export class NauticalSimulation {
  private direction: 'ida' | 'volta' = 'ida';
  private status = NavigationStatus.NAVIGATION_STATUS_ATRACADO;
  private progress = 0;
  private seconds = 0;
  private dockRemaining: number;
  private arrived = false;
  private speed = 0;
  private heading = bearingDegrees(SAO_JOAQUIM, BOM_DESPACHO);
  private rpm = 750;
  private temperature = 78;
  private battery = 26;
  private fuel: number;
  private consumption = 8;
  private tideNoise = 0;
  private rpmNoise = 0;
  private noiseEast = 0;
  private noiseNorth = 0;
  private satelliteEstimate = 11;
  private hdop = 1.4;

  constructor(
    private readonly options: NauticalSimulationOptions,
    private readonly random: RandomSource = Math.random,
  ) {
    if (!Number.isFinite(options.dockTimeMs) || options.dockTimeMs < 0 ||
      !Number.isFinite(options.fuelCapacityLiters) || options.fuelCapacityLiters <= 0) {
      throw new Error('Tempo de atracacao e capacidade do tanque invalidos.');
    }
    this.dockRemaining = options.dockTimeMs / 1000;
    this.fuel = options.fuelCapacityLiters;
  }

  advance(seconds: number): NauticalSnapshot {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Tempo decorrido invalido.');
    let remaining = seconds;
    while (remaining > 1e-9) {
      const dt = Math.min(1 - (this.seconds % 1), remaining);
      if (this.status === NavigationStatus.NAVIGATION_STATUS_ATRACADO && this.dockRemaining <= 1e-9) {
        if (this.arrived) {
          this.direction = this.direction === 'ida' ? 'volta' : 'ida';
          this.progress = 0;
          this.arrived = false;
        }
        this.status = NavigationStatus.NAVIGATION_STATUS_MANOBRA;
      }
      const spent = this.status === NavigationStatus.NAVIGATION_STATUS_ATRACADO
        ? Math.min(dt, this.dockRemaining) : dt;
      this.step(spent);
      remaining -= spent;
    }
    return this.snapshot();
  }

  snapshot(): NauticalSnapshot {
    const position = this.truePosition();
    const stationary = this.status === NavigationStatus.NAVIGATION_STATUS_ATRACADO;
    const noiseDistance = stationary ? 0 : Math.min(10, Math.hypot(this.noiseEast, this.noiseNorth));
    const measured = noiseDistance === 0 ? position : destination(position,
      (Math.atan2(this.noiseEast, this.noiseNorth) * 180 / Math.PI + 360) % 360, noiseDistance);
    return {
      direction: this.direction, position: { ...position }, progressMeters: this.progress, fuelLiters: this.fuel,
      navegacao: {
        ...measured, velocidade_nos: this.speed / KNOT_IN_METERS_PER_SECOND,
        rumo_graus: this.heading, status_navegacao: this.status,
        hdop: this.hdop, satelites: clamp(Math.round(this.satelliteEstimate), 8, 14),
      },
      propulsao: {
        rpm_motor: this.rpm, temperatura_motor_celsius: this.temperature,
        pressao_oleo_bar: this.rpm === 0 ? 0 : 1.5 + 3 * this.engineLoad(),
        nivel_combustivel_percentual: clamp(this.fuel / this.options.fuelCapacityLiters * 100, 0, 100),
        consumo_instantaneo_lph: this.consumption, tensao_bateria_volts: this.battery,
      },
    };
  }

  private truePosition(): Coordinates {
    const from = this.direction === 'ida' ? SAO_JOAQUIM : BOM_DESPACHO;
    const to = this.direction === 'ida' ? BOM_DESPACHO : SAO_JOAQUIM;
    if (this.progress === 0) return { ...from };
    if (this.progress >= ROUTE_DISTANCE_METERS) return { ...to };
    return destination(from, bearingDegrees(from, to), this.progress);
  }

  private engineLoad(): number { return clamp((this.rpm - 750) / 1100, 0, 1); }

  private step(dt: number): void {
    this.seconds += dt;
    this.updateNoise(dt);
    if (this.fuel <= 0) {
      this.exhaustFuel();
      this.updateEngineSensors(dt);
      return;
    }
    if (this.status === NavigationStatus.NAVIGATION_STATUS_ATRACADO) {
      this.speed = 0;
      this.rpm = 750;
      this.dockRemaining = Math.max(0, this.dockRemaining - dt);
    } else {
      const previousPosition = this.truePosition();
      const remaining = Math.max(0, ROUTE_DISTANCE_METERS - this.progress);
      const cruiseKnots = clamp(12 + 1.5 * Math.sin(2 * Math.PI * this.seconds / 43200) + this.tideNoise, 10, 14);
      const cruiseSpeed = cruiseKnots * KNOT_IN_METERS_PER_SECOND;
      // A margem de um subpasso inicia a frenagem antes do limite de parada.
      const brakingDistance = Math.max(0, remaining - this.speed * dt);
      const brakingSpeed = Math.sqrt(2 * ACCELERATION * brakingDistance);
      const nextSpeed = approach(this.speed, Math.min(cruiseSpeed, brakingSpeed), ACCELERATION * dt);
      const travel = (this.speed + nextSpeed) / 2 * dt;
      this.speed = nextSpeed;
      this.progress = Math.min(ROUTE_DISTANCE_METERS, this.progress + travel);
      if (travel > 1e-9) this.heading = bearingDegrees(previousPosition, this.truePosition());
      if (remaining <= travel + 0.05) {
        this.progress = ROUTE_DISTANCE_METERS;
        this.speed = 0;
        this.status = NavigationStatus.NAVIGATION_STATUS_ATRACADO;
        this.dockRemaining = this.options.dockTimeMs / 1000;
        this.arrived = true;
        this.rpm = 750;
      } else {
        const knots = this.speed / KNOT_IN_METERS_PER_SECOND;
        const cruising = knots >= 10 && brakingSpeed >= cruiseSpeed;
        this.status = cruising ? NavigationStatus.NAVIGATION_STATUS_EM_TRAVESSIA : NavigationStatus.NAVIGATION_STATUS_MANOBRA;
        const targetRpm = cruising
          ? clamp(1500 + 350 * (knots - 10) / 4 + this.rpmNoise, 1500, 1850)
          : clamp(750 + 750 * knots / 10, 750, 1500);
        this.rpm = approach(this.rpm, targetRpm, 100 * dt);
        if (cruising) this.rpm = clamp(this.rpm, 1500, 1850);
      }
    }
    this.consumption = 8 + 152 * this.engineLoad() ** 3;
    this.fuel = Math.max(0, this.fuel - this.consumption * dt / 3600);
    if (this.fuel === 0) this.exhaustFuel();
    this.updateEngineSensors(dt);
  }

  private exhaustFuel(): void {
    this.fuel = 0;
    this.speed = 0;
    this.rpm = 0;
    this.consumption = 0;
    this.status = NavigationStatus.NAVIGATION_STATUS_EMERGENCIA;
  }

  private updateNoise(dt: number): void {
    this.tideNoise = clamp(smooth(this.tideNoise, gaussian(this.random) * 0.3, dt, 15), -0.3, 0.3);
    this.rpmNoise = clamp(smooth(this.rpmNoise, gaussian(this.random) * 15, dt, 10), -20, 20);
    this.noiseEast = smooth(this.noiseEast, gaussian(this.random) * 5, dt, 5);
    this.noiseNorth = smooth(this.noiseNorth, gaussian(this.random) * 5, dt, 5);
    this.satelliteEstimate = clamp(this.satelliteEstimate +
      clamp(gaussian(this.random) * 0.15, -0.2, 0.2) * dt, 8, 14);
    const satellites = clamp(Math.round(this.satelliteEstimate), 8, 14);
    this.hdop = clamp(smooth(this.hdop,
      2 - 1.2 * (satellites - 8) / 6 + gaussian(this.random) * 0.05, dt, 15), 0.8, 2);
  }

  private updateEngineSensors(dt: number): void {
    this.temperature = clamp(smooth(this.temperature, 78 + 14 * this.engineLoad(), dt, 120), 78, 92);
    this.battery = clamp(smooth(this.battery,
      (this.rpm > 0 ? 26.4 : 24.5) + clamp(gaussian(this.random) * 0.1, -0.3, 0.3), dt, 20), 24, 27);
  }
}
