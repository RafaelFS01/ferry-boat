import { performance } from 'node:perf_hooks';
import type { RandomSource } from './random';

export const SIMULATOR_CLOCK = Symbol('SIMULATOR_CLOCK');
export const SIMULATOR_SCHEDULER = Symbol('SIMULATOR_SCHEDULER');
export const SIMULATOR_RANDOM = Symbol('SIMULATOR_RANDOM');

export interface SimulatorClock {
  monotonicMilliseconds(): number;
  epochMilliseconds(): number;
}
export interface SimulatorScheduler {
  every(callback: () => void, milliseconds: number): unknown;
  cancel(handle: unknown): void;
}

export const systemClock: SimulatorClock = {
  monotonicMilliseconds: () => performance.now(),
  epochMilliseconds: () => Date.now(),
};
export const systemScheduler: SimulatorScheduler = {
  every: (callback, milliseconds) => setInterval(callback, milliseconds),
  cancel: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};
export type SimulatorRandom = RandomSource;
