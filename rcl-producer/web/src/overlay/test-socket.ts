import { vi } from 'vitest';
import type { LiveSocket } from './live.ts';

/** A stand-in for the overlay's Socket.IO client, for tests: `emit` plays what the server would send. */
export class FakeSocket implements LiveSocket {
  private handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  close = vi.fn<() => void>();
  on(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }
  emit(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
  get listening() {
    return this.handlers.size > 0;
  }
}
