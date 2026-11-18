export const BUFFER_RUNTIME = Symbol('BUFFER_RUNTIME');

export interface BufferRuntime {
  monotonicMilliseconds(): number;
  epochMilliseconds(): number;
  schedule(callback: () => void, delay: number): unknown;
  cancel(handle: unknown): void;
}

export const bufferRuntime: BufferRuntime = {
  monotonicMilliseconds: () => performance.now(),
  epochMilliseconds: () => Date.now(),
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
