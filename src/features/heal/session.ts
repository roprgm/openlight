class PreparationCancelled extends Error {
  constructor() {
    super("AI Remove preparation was cancelled.");
    this.name = "PreparationCancelled";
  }
}

/** One in-flight creation. A cancelled caller releases the session only when nobody else is waiting for it. */
export function createPreparationGate<T>(release: (value: T) => Promise<void>) {
  let ready: T | undefined;
  let inflight: Promise<T> | undefined;
  let flight: AbortController | undefined;
  let waiters = 0;
  function acquire(
    signal: AbortSignal | undefined,
    create: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (ready) {
      signal?.throwIfAborted();
      return Promise.resolve(ready);
    }
    signal?.throwIfAborted();
    waiters += 1;
    let dropped = false;
    const drop = () => {
      if (dropped || ready) return;
      dropped = true;
      waiters -= 1;
      if (waiters === 0) flight?.abort();
    };
    signal?.addEventListener("abort", drop, { once: true });
    if (!inflight) {
      flight = new AbortController();
      inflight = create(flight.signal)
        .then(async (value) => {
          if (waiters > 0) {
            ready = value;
            return value;
          }
          await release(value);
          throw new PreparationCancelled();
        })
        .finally(() => {
          inflight = undefined;
          flight = undefined;
          if (!ready) waiters = 0;
        });
    }
    return inflight.then(
      (value) => {
        signal?.removeEventListener("abort", drop);
        signal?.throwIfAborted();
        return value;
      },
      (error: unknown) => {
        signal?.removeEventListener("abort", drop);
        signal?.throwIfAborted();
        if (
          error instanceof PreparationCancelled ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return acquire(signal, create);
        }
        throw error;
      },
    );
  }
  return {
    get ready() {
      return ready !== undefined;
    },
    acquire,
  };
}

/** Serializes work that must not re-enter, and skips a turn whose signal already aborted. */
export function createRunQueue() {
  let tail = Promise.resolve();
  return function enqueue<T>(
    task: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const turn = tail.then(() => {
      signal?.throwIfAborted();
      return task();
    });
    tail = turn.then(
      () => undefined,
      () => undefined,
    );
    return turn;
  };
}
