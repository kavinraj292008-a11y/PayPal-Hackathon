/** Bounded, non-queuing concurrency limiter: callers over the limit are rejected immediately. */
export class ConcurrencyLimiter {
  private active = 0;
  constructor(private readonly limit: () => number) {}

  tryAcquire(): (() => void) | null {
    if (this.active >= this.limit()) return null;
    this.active += 1;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.active -= 1;
      }
    };
  }

  get inFlight(): number {
    return this.active;
  }
}
