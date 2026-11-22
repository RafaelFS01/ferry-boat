export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  readonly failureThreshold: number;
  readonly cooldownMs: number;
  readonly monotonicMilliseconds: () => number;
  readonly onTransition?: (from: CircuitState, to: CircuitState) => void;
}

export type CircuitAcquisition =
  | { readonly allowed: true; readonly isProbe: boolean }
  | { readonly allowed: false; readonly state: 'OPEN' | 'HALF_OPEN'; readonly retryAfterMs: number };

export class GrpcCircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAtMs: number | null = null;
  private probeInFlight = false;

  constructor(private readonly options: CircuitBreakerOptions) {
    if (!Number.isSafeInteger(options.failureThreshold) || options.failureThreshold < 1) {
      throw new Error('failureThreshold deve ser um inteiro positivo.');
    }

    if (!Number.isSafeInteger(options.cooldownMs) || options.cooldownMs < 1) {
      throw new Error('cooldownMs deve ser um inteiro positivo.');
    }
  }

  getState(): CircuitState {
    this.evaluateCooldown();
    return this.state;
  }

  getRemainingCooldownMs(): number {
    this.evaluateCooldown();

    if (this.state !== 'OPEN' || this.openedAtMs === null) {
      return 0;
    }

    const elapsed = this.options.monotonicMilliseconds() - this.openedAtMs;

    return Math.max(0, this.options.cooldownMs - elapsed);
  }

  tryAcquire(): CircuitAcquisition {
    this.evaluateCooldown();
    if (this.state === 'CLOSED') {
      return { allowed: true, isProbe: false };
    }

    if (this.state === 'OPEN') {
      return { allowed: false, state: 'OPEN', retryAfterMs: this.getRemainingCooldownMs() };
    }

    if (this.probeInFlight) {
      return { allowed: false, state: 'HALF_OPEN', retryAfterMs: 0 };
    }

    this.probeInFlight = true;
    return { allowed: true, isProbe: true };
  }

  recordSuccess(): CircuitState {
    const previous = this.state;
    this.consecutiveFailures = 0;
    this.openedAtMs = null;
    this.probeInFlight = false;
    this.state = 'CLOSED';

    if (previous !== 'CLOSED') {
      this.options.onTransition?.(previous, 'CLOSED');
    }

    return this.state;
  }

  recordTransientFailure(): CircuitState {
    if (this.state === 'HALF_OPEN') {
      return this.open('HALF_OPEN');
    }

    if (this.state === 'OPEN') {
      this.openedAtMs = this.options.monotonicMilliseconds();
      return 'OPEN';
    }

    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.options.failureThreshold) {
      return this.open('CLOSED');
    }

    return this.state;
  }

  recordProbeFailure(): CircuitState {
    if (this.state === 'HALF_OPEN') {
      return this.open('HALF_OPEN');
    }

    return this.state;
  }

  cancelProbe(): void {
    this.probeInFlight = false;
  }

  private evaluateCooldown(): void {
    if (this.state !== 'OPEN' || this.openedAtMs === null) {
      return;
    }

    if (this.options.monotonicMilliseconds() - this.openedAtMs >= this.options.cooldownMs) {
      this.state = 'HALF_OPEN';
      this.openedAtMs = null;
      this.probeInFlight = false;
      this.options.onTransition?.('OPEN', 'HALF_OPEN');
    }
  }

  private open(from: CircuitState): CircuitState {
    this.state = 'OPEN';
    this.openedAtMs = this.options.monotonicMilliseconds();
    this.probeInFlight = false;
    this.consecutiveFailures = 0;

    if (from !== 'OPEN') {
      this.options.onTransition?.(from, 'OPEN');
    }

    return this.state;
  }
}
